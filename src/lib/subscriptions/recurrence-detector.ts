// src/lib/subscriptions/recurrence-detector.ts
//
// Subscription detector, rewritten 2026-10-14.
//
// Why: the subscriptions page was listing one-off payments as regular
// ones. A read-only audit of production found 175 live auto-detected
// rows across five users. 55 of them had no supporting bank
// transactions under their own merchant at all, 9 had only one or two,
// and 55 had amounts that moved by more than 25% between payments.
// Examples: a coffee shop, a bakery chain, a kebab shop, a hardware
// store, a train ticket retailer, a pharmacy, bank interest, a
// non-sterling transaction fee, card repayments and buy now pay later
// instalments.
//
// This module is PURE (no imports, no I/O) so the rules can be unit
// tested with realistic fixtures and shared by every writer:
//   - src/lib/detect-recurring.ts (bank sync, initial sync, Telegram)
//   - src/app/api/cron/detect-subscriptions/route.ts (daily cron and
//     the re-validation pass over existing auto-detected rows)
//
// Rules, in order:
//   1. Exclusions. Transfers between own accounts, refunds and
//      reversals, cash withdrawals, bank fees and interest, credit
//      card repayments and buy now pay later instalments never seed a
//      subscription, however periodic they look.
//   2. Same normalised merchant (card number, date stamp, payment
//      processor prefix and reference numbers stripped).
//   3. At least 3 charges on distinct days (4 identical-to-the-penny
//      charges for retail, grocery, fuel and eating-out merchants), or
//      2 charges roughly 365 days apart for annual billing.
//   4. Consistent cadence: weekly, fortnightly, monthly, quarterly or
//      annual, every interval inside one tolerance window. A single
//      missed payment (an interval of about two cycles) is tolerated
//      once the series has at least 4 intervals.
//   5. Amount stability: consecutive charges within 10% of each other.
//      Up to two step rises of at most 40% are allowed (a price rise
//      mid-year), but a fall back below the old level is not.
//   6. Liveness: the latest charge must be inside 1.5 cycles of the
//      reference date, otherwise the series is reported as lapsed.
//
// Output: qualifies, cadence, billing cycle, a 0 to 1 confidence score,
// the typical (latest-level) amount and the reason when it fails.

// ─── Types ──────────────────────────────────────────────────────────

export type DetectedCadence = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export interface DetectorOccurrence {
  /** ISO timestamp, YYYY-MM-DD or Date. */
  date: string | Date;
  /** Signed or unsigned. The absolute value is used. */
  amount: number;
}

export interface DetectorOptions {
  /** Reference date for the liveness check. Pass the user's latest
   *  transaction date when the bank feed may be stale. */
  now?: Date;
  /** Grocery, fuel, eating-out or general retail merchant. */
  highVariance?: boolean;
  /** Merchant is a known subscription brand (raises confidence only). */
  knownSubscription?: boolean;
}

export interface DetectionResult {
  qualifies: boolean;
  /** True when the series qualifies on shape but has stopped. */
  lapsed: boolean;
  cadence: DetectedCadence | null;
  /** Value safe to store in subscriptions.billing_cycle. */
  billingCycle: DetectedCadence | null;
  /** 0 to 1. Only meaningful when qualifies or lapsed is true. */
  confidence: number;
  /** Amount of the latest charge in the series (reflects price rises). */
  amount: number | null;
  /** Median amount of the series. */
  medianAmount: number | null;
  occurrences: number;
  priceRises: number;
  /** YYYY-MM-DD keys of the charges that form the series. */
  usedDayKeys: string[];
  reason: DetectionReason;
}

export type DetectionReason =
  | 'qualified'
  | 'qualified_annual'
  | 'no_valid_occurrences'
  | 'too_few_occurrences'
  | 'amounts_not_stable'
  | 'irregular_cadence'
  | 'below_minimum_amount'
  | 'series_lapsed';

// ─── Tunables ───────────────────────────────────────────────────────

/** [min, max, canonical] days between charges. */
export const CADENCE_WINDOWS: Record<DetectedCadence, [number, number, number]> = {
  weekly: [6, 8, 7],
  fortnightly: [13, 15, 14],
  // 26 to 35 covers calendar months, 4-weekly billing and a direct
  // debit that slides to the next working day across a weekend.
  monthly: [26, 35, 30],
  quarterly: [85, 97, 91],
  yearly: [350, 380, 365],
};

export const GENERAL_LOOKBACK_DAYS = 400;
export const ANNUAL_LOOKBACK_DAYS = 800;
export const MIN_OCCURRENCES = 3;
export const MIN_OCCURRENCES_HIGH_VARIANCE = 4;
export const MIN_OCCURRENCES_ANNUAL = 2;
/** Consecutive charges may drift by this fraction. */
export const AMOUNT_DRIFT = 0.1;
/** Largest single price rise accepted. */
export const MAX_PRICE_RISE = 0.4;
export const MAX_PRICE_RISES = 2;
export const MIN_AMOUNT_GBP = 1;
export const RECENCY_MULTIPLIER = 1.5;

const DAY_MS = 86_400_000;

// ─── Helpers ────────────────────────────────────────────────────────

interface Row {
  t: number;
  dayKey: string;
  amount: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function toRows(occurrences: DetectorOccurrence[]): Row[] {
  const rows: Row[] = [];
  for (const occ of occurrences) {
    const d = occ.date instanceof Date ? occ.date : new Date(occ.date);
    if (Number.isNaN(d.getTime())) continue;
    const amount = Math.abs(Number(occ.amount) || 0);
    if (amount < 0.01) continue;
    const dayKey = d.toISOString().slice(0, 10);
    rows.push({ t: Date.parse(`${dayKey}T00:00:00Z`), dayKey, amount });
  }
  rows.sort((a, b) => a.t - b.t);
  // Same-day, same-amount dedup: a pending and a settled copy of one
  // charge. Two different amounts on one day are kept, because two
  // plans at one merchant often bill together (two LinkedIn seats, two
  // energy accounts); amount clustering then separates them.
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.dayKey}:${r.amount.toFixed(2)}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/**
 * Split rows into amount clusters (single linkage at AMOUNT_DRIFT on the
 * sorted amounts). Separates a £8.99 Prime charge from £35 purchases at
 * the same merchant.
 */
function amountClusters(rows: Row[]): Row[][] {
  const byAmount = [...rows].sort((a, b) => a.amount - b.amount);
  const clusters: Row[][] = [];
  let current: Row[] = [];
  for (const r of byAmount) {
    const prev = current[current.length - 1];
    if (prev && r.amount > prev.amount * (1 + AMOUNT_DRIFT)) {
      clusters.push(current);
      current = [];
    }
    current.push(r);
  }
  if (current.length) clusters.push(current);
  return clusters.map((c) => [...c].sort((a, b) => a.t - b.t));
}

/**
 * Candidate series: every amount cluster, plus pairs and triples of
 * clusters that follow each other in time with a modest rise between
 * them (a price rise). Rows are returned date-ordered.
 */
function candidateSeries(rows: Row[]): Row[][] {
  const clusters = amountClusters(rows);
  const out: Row[][] = clusters.map((c) => c);
  // The most common exact amount inside each cluster, so a fixed £8.99
  // membership still stands out among £8 to £9 purchases at one merchant.
  for (const c of clusters) {
    const byPenny = new Map<string, Row[]>();
    for (const r of c) {
      const key = r.amount.toFixed(2);
      byPenny.set(key, [...(byPenny.get(key) ?? []), r]);
    }
    const modal = [...byPenny.values()].sort((a, b) => b.length - a.length)[0];
    if (modal && modal.length >= 2 && modal.length < c.length) out.push(modal);
  }
  const level = (c: Row[]) => median(c.map((r) => r.amount));
  const follows = (a: Row[], b: Row[]) =>
    // b starts after a ends (3 days grace for overlap at the switch).
    b[0].t >= a[a.length - 1].t - 3 * DAY_MS &&
    level(b) > level(a) &&
    level(b) <= level(a) * (1 + MAX_PRICE_RISE);
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (!follows(clusters[i], clusters[j])) continue;
      out.push([...clusters[i], ...clusters[j]].sort((a, b) => a.t - b.t));
      for (let k = j + 1; k < clusters.length; k++) {
        if (!follows(clusters[j], clusters[k])) continue;
        out.push([...clusters[i], ...clusters[j], ...clusters[k]].sort((a, b) => a.t - b.t));
      }
    }
  }
  return out;
}

/** Count step rises; returns -1 when the amounts are not stable. */
function amountShape(series: Row[], identicalOnly: boolean): { rises: number; maxDrift: number } | null {
  let rises = 0;
  let maxDrift = 0;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].amount;
    const cur = series[i].amount;
    if (identicalOnly) {
      if (cur.toFixed(2) !== prev.toFixed(2)) return null;
      continue;
    }
    const ratio = cur / prev;
    if (ratio >= 1 - AMOUNT_DRIFT && ratio <= 1 + AMOUNT_DRIFT) {
      maxDrift = Math.max(maxDrift, Math.abs(ratio - 1));
      continue;
    }
    if (ratio > 1 + AMOUNT_DRIFT && ratio <= 1 + MAX_PRICE_RISE) {
      rises++;
      continue;
    }
    return null;
  }
  if (rises > MAX_PRICE_RISES) return null;
  // A rise must hold: the series may not end lower than it started
  // after a rise (that is two unrelated price points interleaved).
  if (rises > 0 && series[series.length - 1].amount < series[0].amount) return null;
  return { rises, maxDrift };
}

/**
 * Fit a cadence by walking back from a recent charge and chaining the
 * charge whose gap is closest to one cycle each time. One missed cycle
 * (a gap of about two cycles) is allowed once the chain has 5 charges.
 * Charges left out of the chain are "extras": a second membership at the
 * same merchant, or a duplicate charge two days after the real one.
 */
interface ChainFit {
  cadence: DetectedCadence;
  chain: Row[];
  missed: number;
  spread: number;
}

function chainFrom(rows: Row[], startIdx: number, cadence: DetectedCadence): ChainFit {
  const [lo, hi, canon] = CADENCE_WINDOWS[cadence];
  const chain: Row[] = [rows[startIdx]];
  let missed = 0;
  let idx = startIdx;
  let spreadSum = 0;
  for (;;) {
    const cur = rows[idx];
    let pick = -1;
    let pickDiff = Infinity;
    let pickMissed = false;
    for (let j = idx - 1; j >= 0; j--) {
      const gap = Math.round((cur.t - rows[j].t) / DAY_MS);
      if (gap > 2 * hi) break;
      if (gap >= lo && gap <= hi) {
        const diff = Math.abs(gap - canon);
        if (pickMissed || diff < pickDiff) {
          pick = j;
          pickDiff = diff;
          pickMissed = false;
        }
      } else if (missed === 0 && gap >= 2 * lo && gap <= 2 * hi && pick === -1) {
        pick = j;
        pickDiff = Math.abs(gap / 2 - canon);
        pickMissed = true;
      }
    }
    if (pick === -1) break;
    if (pickMissed) missed++;
    spreadSum += pickDiff;
    chain.unshift(rows[pick]);
    idx = pick;
  }
  if (missed > 0 && chain.length < 5) {
    // Not enough evidence to forgive a gap: keep only the part after it.
    let cut = chain.length - 1;
    for (let i = chain.length - 1; i > 0; i--) {
      const gap = Math.round((chain[i].t - chain[i - 1].t) / DAY_MS);
      if (gap > hi) {
        cut = i;
        break;
      }
    }
    const kept = chain.slice(cut);
    return { cadence, chain: kept, missed: 0, spread: 0 };
  }
  const intervals = chain.length - 1;
  return { cadence, chain, missed, spread: intervals > 0 ? spreadSum / intervals / canon : 1 };
}

function bestChain(rows: Row[], allowed: DetectedCadence[]): ChainFit | null {
  let best: ChainFit | null = null;
  // Start from each of the latest three charges, in case the very last
  // one is an extra.
  for (let s = rows.length - 1; s >= Math.max(0, rows.length - 3); s--) {
    for (const cadence of allowed) {
      const fit = chainFrom(rows, s, cadence);
      if (fit.chain.length < 2) continue;
      if (
        !best ||
        fit.chain.length > best.chain.length ||
        (fit.chain.length === best.chain.length && fit.missed < best.missed) ||
        (fit.chain.length === best.chain.length && fit.missed === best.missed && fit.spread < best.spread)
      ) {
        best = fit;
      }
    }
  }
  return best;
}

function failure(reason: DetectionReason, occurrences = 0): DetectionResult {
  return {
    qualifies: false,
    lapsed: false,
    cadence: null,
    billingCycle: null,
    confidence: 0,
    amount: null,
    medianAmount: null,
    occurrences,
    priceRises: 0,
    usedDayKeys: [],
    reason,
  };
}

function scoreSeries(params: {
  occurrences: number;
  annual: boolean;
  identical: boolean;
  rises: number;
  maxDrift: number;
  missed: number;
  spread: number;
  extras: number;
  highVariance: boolean;
  knownSubscription: boolean;
}): number {
  let s: number;
  if (params.annual) s = 0.6;
  else if (params.occurrences >= 6) s = 0.75;
  else if (params.occurrences >= 4) s = 0.7;
  else s = 0.6;
  if (params.identical) s += 0.1;
  else if (params.maxDrift > 0.05) s -= 0.05;
  if (params.rises > 0) s -= 0.03 * params.rises;
  if (params.spread < 0.05) s += 0.1;
  else if (params.spread < 0.1) s += 0.05;
  s -= 0.1 * params.missed;
  if (params.extras > 0) s -= 0.05;
  if (params.highVariance) s -= 0.15;
  if (params.knownSubscription) s += 0.1;
  return Math.max(0, Math.min(1, round2(s)));
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Decide whether one merchant's charges form a real recurring payment.
 * Pure: same input, same answer.
 */
export function detectRecurringSeries(
  occurrences: DetectorOccurrence[],
  opts: DetectorOptions = {},
): DetectionResult {
  const now = (opts.now ?? new Date()).getTime();
  const highVariance = !!opts.highVariance;
  const all = toRows(occurrences).filter((r) => r.t <= now + DAY_MS);
  if (all.length === 0) return failure('no_valid_occurrences');

  const general = all.filter((r) => r.t >= now - GENERAL_LOOKBACK_DAYS * DAY_MS);
  const annualRows = all.filter((r) => r.t >= now - ANNUAL_LOOKBACK_DAYS * DAY_MS);
  const minOcc = highVariance ? MIN_OCCURRENCES_HIGH_VARIANCE : MIN_OCCURRENCES;

  type Candidate = DetectionResult & { score: number };
  let best: Candidate | null = null;
  let bestFailure: DetectionReason = general.length >= minOcc || annualRows.length >= 2
    ? 'amounts_not_stable'
    : 'too_few_occurrences';

  const consider = (series: Row[], annual: boolean) => {
    const needed = annual ? MIN_OCCURRENCES_ANNUAL : minOcc;
    if (series.length < needed) return;
    const fit = bestChain(
      series,
      annual ? ['yearly'] : ['weekly', 'fortnightly', 'monthly', 'quarterly'],
    );
    if (!fit || fit.chain.length < needed) {
      if (bestFailure === 'amounts_not_stable' || bestFailure === 'too_few_occurrences') {
        bestFailure = 'irregular_cadence';
      }
      return;
    }
    // Extras (same-amount charges outside the chain) are tolerated only
    // while the chain clearly dominates, and never for retail-type
    // merchants, where picking a monthly rhythm out of frequent
    // purchases would invent a subscription.
    const extras = series.length - fit.chain.length;
    const maxExtras = highVariance ? 0 : Math.max(1, Math.floor(fit.chain.length / 3));
    if (extras > maxExtras) {
      if (bestFailure !== 'below_minimum_amount') bestFailure = 'irregular_cadence';
      return;
    }
    const chain = fit.chain;
    const shape = amountShape(chain, highVariance);
    if (!shape) {
      if (bestFailure === 'too_few_occurrences') bestFailure = 'amounts_not_stable';
      return;
    }
    const amounts = chain.map((r) => r.amount);
    const latest = amounts[amounts.length - 1];
    const med = median(amounts);
    if (med < MIN_AMOUNT_GBP) {
      bestFailure = 'below_minimum_amount';
      return;
    }
    const canon = CADENCE_WINDOWS[fit.cadence][2];
    const lastT = chain[chain.length - 1].t;
    const lapsed = (now - lastT) / DAY_MS > canon * RECENCY_MULTIPLIER;
    const identical = amounts.every((a) => a.toFixed(2) === amounts[0].toFixed(2));
    const confidence = scoreSeries({
      occurrences: chain.length,
      annual,
      identical,
      rises: shape.rises,
      maxDrift: shape.maxDrift,
      missed: fit.missed,
      spread: fit.spread,
      extras,
      highVariance,
      knownSubscription: !!opts.knownSubscription,
    });
    const cand: Candidate = {
      qualifies: !lapsed,
      lapsed,
      cadence: fit.cadence,
      billingCycle: fit.cadence,
      confidence,
      amount: round2(latest),
      medianAmount: round2(med),
      occurrences: chain.length,
      priceRises: shape.rises,
      usedDayKeys: chain.map((r) => r.dayKey),
      reason: lapsed ? 'series_lapsed' : annual ? 'qualified_annual' : 'qualified',
      // Prefer live over lapsed, then more evidence, then confidence.
      score: (lapsed ? 0 : 1000) + chain.length * 10 + confidence,
    };
    if (!best || cand.score > best.score) best = cand;
  };

  for (const series of candidateSeries(general)) consider(series, false);

  // Annual pass: only when the general pass found nothing live, and
  // never for retail-type merchants (two same-priced shops a year apart
  // is coincidence, not a subscription).
  const generalBest = best as Candidate | null;
  if ((!generalBest || !generalBest.qualifies) && !highVariance) {
    for (const series of candidateSeries(annualRows)) {
      // Exactly the annual shape: every interval about a year.
      consider(series, true);
    }
  }

  if (!best) return failure(bestFailure, all.length);
  const { score: _score, ...result } = best as Candidate;
  void _score;
  return result;
}

// ─── Merchant normalisation ─────────────────────────────────────────

/** Payment processors whose real merchant follows the `*`. */
const PROCESSOR_PREFIXES = new Set([
  'paypal', 'pp', 'sq', 'sumup', 'iz', 'izettle', 'zettle', 'sp', 'crv', 'ztl', 'stripe', 'google', 'apple',
]);

const LOCATION_WORDS =
  /\b(london|londo|lond|nottingham|nott|boston|bost|manchester|birmingham|leeds|edinburgh|glasgow|cardiff|bristol|camden|camd|hackney|winchester|gb|gbr|us|usa|ie|irl|lu|nl)\b/g;

/**
 * Canonical merchant key for grouping bank lines. Strips card numbers,
 * date stamps, the debit flag, processor prefixes, reference numbers,
 * company suffixes and location words, then lowercases to [a-z0-9 ].
 *
 *   "9384 28JUL26 PAYPAL *LINKEDIN 35314369001" -> "linkedin"
 *   "Amazon Prime*T01E4amzn.co.uk/pm"           -> "amazon prime"
 *   "MICROSOFT#G1535308MSBILL.INFO"             -> "microsoft"
 *   "4239 01AUG26 D PATREON* MEMB"              -> "patreon"
 */
export function normaliseMerchantKey(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  s = s.replace(/^\d{4}\s+/, '');
  s = s.replace(/\b\d{2}[a-z]{3}\d{2}\b/g, ' ');
  s = s.replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, ' ');
  s = s.replace(/\b\d{1,2}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/g, ' ');
  s = s.replace(/^\s*d\s+/, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/^int'?\s?l\b\s*/, '');
  // Processor prefix: keep what follows. Otherwise keep what precedes.
  const star = s.match(/^([a-z ]{1,14}?)\s*\*\s*(.*)$/);
  if (star) {
    const prefix = star[1].trim();
    s = PROCESSOR_PREFIXES.has(prefix) && star[2].trim() ? star[2] : star[1] || star[2];
  }
  s = s.replace(/[#*].*$/, '');
  s = s.replace(/\b(www\.)?[a-z0-9-]+\.(co\.uk|com|net|org|io|tv|uk|info)\b.*$/, (m) =>
    m.replace(/^www\./, '').replace(/\.(co\.uk|com|net|org|io|tv|uk|info).*$/, ''),
  );
  // Foreign currency tail: "USD 0.97VRATE 1.31".
  s = s.replace(/\b(usd|eur|aud|cad|chf|sek|nok|dkk|pln|jpy)\b.*$/, ' ');
  s = s.replace(/\d{3,}/g, ' ');
  s = s.replace(/[^a-z0-9& ]/g, ' ');
  s = s.replace(/\b(ltd|limited|plc|llp|inc|corp|co|uk|t a|pymts?|payments?|subs|subscription)\b/g, ' ');
  s = s.replace(LOCATION_WORDS, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length >= 2 ? s : '';
}

// ─── Exclusions ─────────────────────────────────────────────────────

export type ExclusionReason =
  | 'internal_transfer'
  | 'refund'
  | 'cash_withdrawal'
  | 'bank_fee_or_interest'
  | 'credit_card_repayment'
  | 'buy_now_pay_later'
  | 'payroll'
  | 'excluded_category';

export interface ExclusionInput {
  merchant?: string | null;
  description?: string | null;
  category?: string | null;
  userCategory?: string | null;
  transferPairId?: string | null;
}

/** bank_transactions category values that never seed a subscription. */
const EXCLUDED_CATEGORIES = new Set([
  'transfer', 'transfers', 'internal_transfer', 'cash', 'atm', 'cash_withdrawal',
  'income', 'credit', 'refund', 'refunds', 'fee', 'fees', 'interest', 'bank_charge',
  'bank_charges', 'credit_card', 'credit_card_payment', 'savings', 'investment',
  'investments', 'wages', 'salary', 'payroll',
]);

const EXCLUSION_PATTERNS: Array<[ExclusionReason, RegExp]> = [
  ['refund', /\b(refund|reversal|reversed|chargeback|returned payment|cashback)\b/i],
  ['cash_withdrawal', /\b(notemachine|cashzone|euronet|atm|cash withdrawal|cashpoint|cash machine|link atm|cash wdl|cash adv(ance)?)\b/i],
  ['internal_transfer', /\b(internal transfer|own account|to savings|from savings|savings pot|pot transfer|moved to pot|round ?up|tfr to|transfer to|transfer from|isa transfer|to a\/c|a\/c)(?=\W|$)/i],
  ['payroll', /\b(salary|salaries|wages|payroll|net pay)\b/i],
  ['bank_fee_or_interest', /\b(non[- ]?sterling|transaction fee|foreign (exchange|currency) fee|interest( charged| paid)?$|^interest\b|overdraft|arrangement fee|unpaid item|total charges|charges? to \d|security gtee|account fee|monthly fee)\b/i],
  ['credit_card_repayment', /\b(barclaycard|american express|amex|mbna|capital one|credit card|commercial card|card repayment|vanquis|aqua card|marbles|ocean finance card)\b/i],
  ['buy_now_pay_later', /\b(klarna|clearpay|afterpay|laybuy|paypal pay in|pay in 3|zilch|openpay)\b/i],
];

export function exclusionReason(tx: ExclusionInput): ExclusionReason | null {
  if (tx.transferPairId) return 'internal_transfer';
  for (const c of [tx.userCategory, tx.category]) {
    if (!c) continue;
    const key = c.toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (EXCLUDED_CATEGORIES.has(key)) return 'excluded_category';
  }
  const text = `${tx.merchant || ''} ${tx.description || ''}`.trim();
  if (!text) return null;
  for (const [reason, re] of EXCLUSION_PATTERNS) {
    if (re.test(text)) return reason;
  }
  return null;
}

// ─── Merchant hints ─────────────────────────────────────────────────

/**
 * Retail, takeaway, travel ticket and similar merchants where repeated
 * charges are almost always separate purchases. Complements the
 * grocery, fuel and eating-out keywords in merchant-normalise.ts.
 */
const ONE_OFF_RETAIL_KEYWORDS = [
  'costa', 'greggs', 'starbucks', 'pret ', 'pret a manger', 'caffe nero', 'mcdonald', 'burger king', 'kfc',
  'subway', 'kebab', 'pizza', 'chicken', 'cafe', 'coffee', 'bakery', 'restaurant', 'takeaway', 'pub ',
  'toolstation', 'screwfix', 'b&q', 'wickes', 'homebase', 'dunelm', 'ikea', 'argos', 'currys', 'boots',
  'superdrug', 'pharmacy', 'chemist', 'vape', 'primark', 'tk maxx', 'next retail', 'asos', 'ebay',
  'trainline', 'apcoa', 'ncp ', 'buses', 'bus ', 'tfl travel', 'uber', 'bolt', 'parking', 'ringgo', 'paybyphone',
  'shell', 'esso', 'texaco', 'bp ', 'petrol', 'tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'morrisons',
  'waitrose', 'co-op', 'coop', 'iceland', 'm&s', 'marks & spencer', 'amazon.co.uk', 'amzn mktp', 'amazon marketplace',
];

/** Known subscription brands (raise confidence only, never qualify on their own). */
const KNOWN_SUBSCRIPTION_KEYWORDS = [
  'netflix', 'spotify', 'disney', 'amazon prime', 'prime video', 'apple.com', 'icloud', 'youtube',
  'now tv', 'nowtv', 'dazn', 'patreon', 'audible', 'xbox', 'playstation', 'nintendo', 'adobe', 'microsoft',
  'google storage', 'google one', 'dropbox', 'openai', 'chatgpt', 'anthropic', 'claude.ai', 'notion',
  'canva', 'linkedin', 'whoop', 'strava', 'peloton', 'puregym', 'the gym', 'gym', 'experian', 'clearscore',
  'tv licence', 'tv licensing', 'sky', 'virgin media', 'bt ', 'ee ', 'vodafone', 'o2', 'three', 'giffgaff', 'lebara',
  'insurance', 'aviva', 'admiral', 'direct line', 'vitality', 'manypets', 'ring protect', 'wix', 'deliveroo plus',
];

const escapeRe = (k: string) => k.trim().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const keywordCache = new Map<string[], RegExp>();

/** Whole-word keyword match ("bp" must not match "mbp", "ee" not "fee"). */
function hasAny(text: string, keywords: string[]): boolean {
  let re = keywordCache.get(keywords);
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])(${keywords.map(escapeRe).join("|")})s?(?=$|[^a-z0-9])`, 'i');
    keywordCache.set(keywords, re);
  }
  return re.test(text.toLowerCase());
}

const MEMBERSHIP_BRANDS = KNOWN_SUBSCRIPTION_KEYWORDS.concat(['deliveroo', 'uber', 'amazon', 'tesco', 'costa']);

export function isOneOffRetailMerchant(merchant: string, description?: string | null): boolean {
  // "Deliveroo Plus", "Uber One", "Amazon Prime" are memberships, not purchases.
  const text = `${merchant} ${description || ''}`;
  if (/\b(plus|one|prime|membership|member|subs?)\b/i.test(text) && hasAny(text, MEMBERSHIP_BRANDS)) {
    return false;
  }
  return hasAny(text, ONE_OFF_RETAIL_KEYWORDS);
}

export function isKnownSubscriptionMerchant(merchant: string, description?: string | null): boolean {
  return hasAny(`${merchant} ${description || ''}`, KNOWN_SUBSCRIPTION_KEYWORDS);
}

// ─── Review status for existing rows ────────────────────────────────

/** Values written to subscriptions.detection_status. */
export type DetectionStatus = 'confirmed' | 'needs_review' | 'dismissed_by_system';

/**
 * Map a re-validation result onto the status stored on an existing
 * auto-detected row. Rows are never deleted: `dismissed_by_system` only
 * hides the row by default, and the user can bring it back.
 */
export function reviewStatusFor(result: DetectionResult): DetectionStatus {
  if (result.qualifies && result.confidence >= 0.7) return 'confirmed';
  if (result.qualifies || result.lapsed) return 'needs_review';
  return 'dismissed_by_system';
}

// ─── Grouping bank transactions ─────────────────────────────────────

/** The subset of a bank_transactions row the detector reads. */
export interface BankTxLike {
  id?: string;
  merchant_name?: string | null;
  description?: string | null;
  amount: number | string;
  timestamp: string;
  category?: string | null;
  user_category?: string | null;
  transfer_pair_id?: string | null;
}

export interface MerchantSeries<T extends BankTxLike = BankTxLike> {
  key: string;
  /** Freshest merchant label seen (input is usually newest first). */
  displayName: string;
  description: string | null;
  txs: T[];
}

/**
 * Group OUTGOING transactions by normalised merchant, dropping every
 * transaction that can never be a subscription (see exclusionReason).
 */
export function groupTransactionsByMerchant<T extends BankTxLike>(txs: T[]): Map<string, MerchantSeries<T>> {
  const groups = new Map<string, MerchantSeries<T>>();
  for (const tx of txs) {
    if (Number(tx.amount) >= 0) continue;
    if (
      exclusionReason({
        merchant: tx.merchant_name,
        description: tx.description,
        category: tx.category,
        userCategory: tx.user_category,
        transferPairId: tx.transfer_pair_id,
      })
    ) {
      continue;
    }
    const label = tx.merchant_name || tx.description || '';
    const key = normaliseMerchantKey(label);
    if (!key || key.length < 3) continue;
    const g = groups.get(key);
    if (g) g.txs.push(tx);
    else groups.set(key, { key, displayName: label.trim(), description: tx.description ?? null, txs: [tx] });
  }
  return groups;
}

export function seriesOccurrences(series: MerchantSeries): DetectorOccurrence[] {
  return series.txs.map((t) => ({ date: t.timestamp, amount: Math.abs(Number(t.amount)) }));
}

// ─── Re-validating an existing auto-detected row ────────────────────

export interface ExistingRowLike {
  provider_name: string;
  recurring_group?: string | null;
  bank_description?: string | null;
  category?: string | null;
}

export interface RowReview {
  status: DetectionStatus;
  reason: string;
  result: DetectionResult | null;
}

/** Subscription categories that are bank-ledger buckets, never subscriptions. */
const LEDGER_ROW_CATEGORIES = new Set(['transfers', 'transfer', 'cash', 'income', 'credit']);

/**
 * Decide what an existing bank-detected subscription row should become
 * under the new rules. Never returns a delete: the worst outcome is
 * `dismissed_by_system`, which only hides the row by default.
 */
export function reviewExistingRow(
  row: ExistingRowLike,
  groups: Map<string, MerchantSeries>,
  opts: { now?: Date; isHighVariance?: (merchant: string, description?: string | null) => boolean } = {},
): RowReview {
  const rowCategory = (row.category || '').toLowerCase().trim();
  const excluded = exclusionReason({
    merchant: row.provider_name,
    description: row.bank_description,
    category: LEDGER_ROW_CATEGORIES.has(rowCategory) ? rowCategory : null,
  });
  if (excluded) return { status: 'dismissed_by_system', reason: `excluded_${excluded}`, result: null };

  // Find the merchant series by any of the row's names.
  const compact = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const wanted = new Set(
    [normaliseMerchantKey(row.provider_name), normaliseMerchantKey(row.bank_description), row.recurring_group || '']
      .map((k) => compact(k))
      .filter((k) => k.length >= 3),
  );
  // Exact key matches first; then keys where one is a prefix of the
  // other ("tv licence" vs "tv licence mbp"), because bank labels gain
  // and lose suffixes over time.
  const exact: MerchantSeries[] = [];
  const prefix: MerchantSeries[] = [];
  for (const g of groups.values()) {
    const gk = compact(g.key);
    if (wanted.has(gk)) exact.push(g);
    else if (gk.length >= 5 && [...wanted].some((w) => w.length >= 5 && (w.startsWith(gk) || gk.startsWith(w)))) {
      prefix.push(g);
    }
  }
  const candidates = exact.length ? [...exact, ...prefix] : prefix;

  const highVariance = (opts.isHighVariance ?? isOneOffRetailMerchant)(row.provider_name, row.bank_description);
  if (candidates.length === 0) {
    return highVariance
      ? { status: 'dismissed_by_system', reason: 'no_supporting_transactions_retail', result: null }
      : { status: 'needs_review', reason: 'no_supporting_transactions', result: null };
  }

  // Lenient on purpose: the row keeps the BEST verdict any matching
  // series earns, so a renamed merchant never hides a real subscription.
  const rank: Record<DetectionStatus, number> = { confirmed: 2, needs_review: 1, dismissed_by_system: 0 };
  let best: RowReview | null = null;
  for (const series of candidates) {
    const result = detectRecurringSeries(seriesOccurrences(series), {
      now: opts.now,
      highVariance,
      knownSubscription: isKnownSubscriptionMerchant(row.provider_name, row.bank_description),
    });
    const review: RowReview = { status: reviewStatusFor(result), reason: result.reason, result };
    if (
      !best ||
      rank[review.status] > rank[best.status] ||
      (rank[review.status] === rank[best.status] && result.occurrences > (best.result?.occurrences ?? 0))
    ) {
      best = review;
    }
  }
  return best!;
}
