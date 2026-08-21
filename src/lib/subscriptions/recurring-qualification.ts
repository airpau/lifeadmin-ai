// src/lib/subscriptions/recurring-qualification.ts
//
// Single source of truth for "does this payment series qualify as a
// recurring subscription?". Written 2026-08-16 to replace the loose
// heuristics in src/lib/detect-recurring.ts that listed one-off payments
// as subscriptions (2 payments 2-12 days apart matched "weekly", which
// was then rewritten to "monthly").
//
// The qualification core mirrors the proven upcoming-payments detector
// (src/lib/upcoming/detect-recurring.ts): tight non-overlapping cadence
// windows, same-day dedup, and a median-based amount trim that kicks out
// unrelated one-off charges at the same merchant (Amazon £120 purchase
// vs Amazon £9.99 subscription).
//
// Rules enforced here:
//   1. >= 3 occurrences AND >= 2 intervals, ALL intervals inside ONE
//      cadence window (weekly 6-8d, fortnightly 13-15d, four-weekly
//      27-29d, monthly 28-32d, quarterly 88-93d, annual 360-370d).
//   2. 13-month lookback; the most recent occurrence must be within
//      1.5x the cadence length, otherwise the series has lapsed.
//   3. Amount consistency: occurrences within +/-8% of the MEDIAN
//      amount (after trimming outliers outside that band, so mixed
//      one-off amounts at the same merchant don't block a real series).
//   4. Minimum amount: £1.
//   5. High-variance merchants (groceries / eating out / fuel / general
//      retail) need >= 4 occurrences AND identical-to-the-penny amounts
//      before they qualify — a weekly Tesco shop is not a subscription,
//      but a £7.99 Tesco Mobile-style fixed charge is.
//
// Both writers use this module:
//   - src/lib/detect-recurring.ts  (bank sync / initial sync path)
//   - src/app/api/cron/detect-subscriptions/route.ts (daily cron +
//     retro re-validation pass)

import { DESCRIPTION_CATEGORIES } from '@/lib/merchant-normalise';

// ─── Cadence windows ──────────────────────────────────────────────
// [minDays, maxDays, canonicalDays] — same numbers as the upcoming
// detector. Windows are deliberately tight; anything that doesn't fit
// one window across ALL its intervals is not a recurring payment.

export type RecurringCadence =
  | 'weekly'
  | 'fortnightly'
  | 'four_weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export const CADENCE_WINDOWS: Record<RecurringCadence, [number, number, number]> = {
  weekly: [6, 8, 7],
  fortnightly: [13, 15, 14],
  four_weekly: [27, 29, 28],
  monthly: [28, 32, 30],
  quarterly: [88, 93, 91],
  yearly: [360, 370, 365],
};

/** How far back a series may reach. Anything older is ignored. */
export const LOOKBACK_DAYS = 396; // ~13 months

/**
 * Lookback for the ANNUAL pass only.
 *
 * Annual billing was undetectable by arithmetic until 2026-08-21. The
 * general rules need 3 occurrences with every interval inside one
 * cadence window; two yearly intervals span at least 720 days, and the
 * lookback was 396. So `CADENCE_WINDOWS.yearly` existed, `toBillingCycle`
 * could return 'yearly', and nothing could ever reach either. Annual
 * insurance, breakdown cover, Amazon Prime, domain renewals: invisible.
 *
 * The general window is deliberately NOT widened to fix this. Doing that
 * would feed older payments into every merchant's interval list, and
 * because qualification requires `intervals.every(inside one window)`,
 * a merchant billed monthly today but also two years ago would gain one
 * enormous interval and stop qualifying. Widening the window would have
 * broken working detections to enable a new one.
 *
 * Instead the annual pass is separate and additive: same amount and
 * liveness rules, its own wider window, and only ever tried after the
 * general pass has already failed.
 */
export const ANNUAL_LOOKBACK_DAYS = 800; // ~26 months, two yearly cycles plus slack

/** Occurrences needed for the annual pass. Two payments a year apart is
 *  the most evidence an annual subscription can offer inside any
 *  reasonable window, so requiring a third would keep it undetectable. */
export const MIN_OCCURRENCES_ANNUAL = 2;

/** Minimum occurrences for a normal merchant. */
export const MIN_OCCURRENCES = 3;

/** Minimum occurrences for a high-variance (grocery/fuel/retail) merchant. */
export const MIN_OCCURRENCES_HIGH_VARIANCE = 4;

/** Amounts must sit within this fraction of the median. */
export const AMOUNT_TOLERANCE = 0.08;

/** Below this the charge is noise, not a subscription. */
export const MIN_AMOUNT_GBP = 1;

/** The last occurrence must be within this multiple of the cadence. */
export const RECENCY_MULTIPLIER = 1.5;

/**
 * Map a detected cadence onto the billing_cycle vocabulary stored on
 * `subscriptions`. The true cycle is preserved — the old detector's
 * weekly->monthly rewrite is deliberately gone. Four-weekly billing is
 * stored as monthly (13 vs 12 payments a year — industry-standard
 * "monthly" billing, and every consumer of billing_cycle treats it so).
 */
export function toBillingCycle(
  cadence: RecurringCadence
): 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly' {
  if (cadence === 'four_weekly') return 'monthly';
  return cadence;
}

// ─── Category exclusions ──────────────────────────────────────────
// bank_transactions.category / user_category values that must never
// seed a subscription: transfers between own accounts, cash machine
// withdrawals, income, bank fees and interest, and payments to a
// credit card (the card's own subscriptions are detected from the
// card's transactions, not from the settlement payment).

const EXCLUDED_TX_CATEGORIES = new Set([
  'transfer',
  'transfers',
  'internal_transfer',
  'internal transfer',
  'cash',
  'atm',
  'income',
  'credit',
  'fee',
  'fees',
  'interest',
  'bank_charge',
  'credit_card',
  'credit card',
]);

export function isExcludedTransactionCategory(
  category: string | null | undefined
): boolean {
  if (!category) return false;
  const key = category.toLowerCase().trim().replace(/\s+/g, ' ');
  return (
    EXCLUDED_TX_CATEGORIES.has(key) ||
    EXCLUDED_TX_CATEGORIES.has(key.replace(/ /g, '_'))
  );
}

// ─── Council tax blocklist ────────────────────────────────────────
// Moved here from src/app/api/cron/detect-subscriptions/route.ts so
// every writer shares one list. Council tax IS legitimately recurring,
// but it is handled by Expected Bills — it must never be classified as
// a cancellable subscription.

export const COUNCIL_TAX_PATTERNS: RegExp[] = [
  /borough council/i,
  /city council/i,
  /district council/i,
  /county council/i,
  /council tax/i,
  /london borough/i,
  /\btest valley\b/i,
  /\bwinchester\b.*\bcouncil\b/i,
  /\bwestminster\b.*\bcouncil\b/i,
  /\bhounslow\b/i,
  /\b(lbh|lbw|lbc)\b/i, // common council abbreviations
];

export function isCouncilTaxMerchant(merchantName: string): boolean {
  return COUNCIL_TAX_PATTERNS.some((re) => re.test(merchantName));
}

// ─── High-variance merchant guard ─────────────────────────────────
// Grocery / eating-out / fuel / general-retail merchants take frequent
// arbitrary-amount payments that trivially land in a cadence window.
// Keyword sets are reused from the shared categoriser in
// src/lib/merchant-normalise.ts so the two stay in lockstep.

const HIGH_VARIANCE_CATEGORIES = new Set([
  'groceries',
  'eating_out',
  'fuel',
  'shopping',
]);

const HIGH_VARIANCE_KEYWORDS: string[] = DESCRIPTION_CATEGORIES.filter((e) =>
  HIGH_VARIANCE_CATEGORIES.has(e.category)
).flatMap((e) => e.keywords);

export function isHighVarianceMerchant(
  merchantName: string,
  description?: string | null
): boolean {
  const text = `${merchantName} ${description || ''}`.toLowerCase();
  return HIGH_VARIANCE_KEYWORDS.some((kw) => text.includes(kw));
}

// ─── Qualification core ───────────────────────────────────────────

export interface RecurringOccurrence {
  /** ISO timestamp or YYYY-MM-DD. */
  date: string | Date;
  /** Signed or unsigned — absolute value is used. */
  amount: number;
}

export interface QualificationResult {
  qualifies: boolean;
  cadence: RecurringCadence | null;
  /** Value safe to store in subscriptions.billing_cycle. */
  billingCycle: ReturnType<typeof toBillingCycle> | null;
  /** Median amount of the kept series, rounded to pennies. */
  medianAmount: number | null;
  /** Number of occurrences that survived dedup + trim. */
  occurrencesUsed: number;
  /** YYYY-MM-DD keys of the occurrences that form the series — use
   *  these to flag only the matching bank_transactions rows. */
  usedDayKeys: string[];
  /** Human-readable reason when the series does not qualify. */
  reason: string;
}

function fail(reason: string, occurrencesUsed = 0): QualificationResult {
  return {
    qualifies: false,
    cadence: null,
    billingCycle: null,
    medianAmount: null,
    occurrencesUsed,
    usedDayKeys: [],
    reason,
  };
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Decide whether a payment series at one merchant qualifies as a
 * recurring subscription. Pure and injectable (`now`) so it is unit
 * testable and both writers share identical behaviour.
 */
export function qualifyRecurringSeries(
  occurrences: RecurringOccurrence[],
  opts: { now?: Date; highVariance?: boolean } = {}
): QualificationResult {
  const now = opts.now ?? new Date();
  const minOccurrences = opts.highVariance
    ? MIN_OCCURRENCES_HIGH_VARIANCE
    : MIN_OCCURRENCES;

  // Parse, take absolute amounts, drop invalid rows.
  const rows: Array<{ date: Date; dayKey: string; amount: number }> = [];
  for (const occ of occurrences) {
    const d = occ.date instanceof Date ? occ.date : new Date(occ.date);
    if (Number.isNaN(d.getTime())) continue;
    const amount = Math.abs(Number(occ.amount) || 0);
    if (amount < 0.01) continue;
    rows.push({ date: d, dayKey: d.toISOString().slice(0, 10), amount });
  }
  if (rows.length === 0) return fail('no_valid_occurrences');

  // 13-month lookback.
  const cutoff = now.getTime() - LOOKBACK_DAYS * 86_400_000;
  const recent = rows.filter((r) => r.date.getTime() >= cutoff);
  if (recent.length < minOccurrences) {
    return fail('too_few_occurrences_in_lookback', recent.length);
  }

  // Same-day dedup (pending + settled copies of the same payment).
  recent.sort((a, b) => a.date.getTime() - b.date.getTime());
  const seenDays = new Set<string>();
  const deduped: typeof recent = [];
  for (const r of recent) {
    if (seenDays.has(r.dayKey)) continue;
    seenDays.add(r.dayKey);
    deduped.push(r);
  }
  if (deduped.length < minOccurrences) {
    return fail('too_few_distinct_days', deduped.length);
  }

  // Amount trim.
  let kept: typeof deduped;
  if (opts.highVariance) {
    // Identical-to-the-penny only: keep the most common exact amount.
    const byPenny = new Map<string, typeof deduped>();
    for (const r of deduped) {
      const key = r.amount.toFixed(2);
      const bucket = byPenny.get(key) ?? [];
      bucket.push(r);
      byPenny.set(key, bucket);
    }
    kept = [...byPenny.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  } else {
    // Keep rows within +/-8% of the median — the upcoming-style trim
    // that drops one-off big-ticket charges without splitting the
    // legitimate series.
    const med = medianOf(deduped.map((r) => r.amount));
    const lo = med * (1 - AMOUNT_TOLERANCE);
    const hi = med * (1 + AMOUNT_TOLERANCE);
    kept = deduped.filter((r) => r.amount >= lo && r.amount <= hi);
  }
  if (kept.length < minOccurrences) {
    return fail('amounts_not_consistent', kept.length);
  }

  const medianAmount = medianOf(kept.map((r) => r.amount));
  if (medianAmount < MIN_AMOUNT_GBP) {
    return fail('below_minimum_amount', kept.length);
  }

  // Intervals — need >= 2, ALL inside ONE cadence window.
  const intervals: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    const days = Math.round(
      (kept[i].date.getTime() - kept[i - 1].date.getTime()) / 86_400_000
    );
    if (days >= 1) intervals.push(days);
  }
  if (intervals.length < 2) return fail('too_few_intervals', kept.length);

  const medianInterval = medianOf(intervals);
  let best: { cadence: RecurringCadence; diff: number } | null = null;
  for (const [cadence, [lo, hi, canon]] of Object.entries(CADENCE_WINDOWS) as [
    RecurringCadence,
    [number, number, number],
  ][]) {
    const allInside = intervals.every((d) => d >= lo && d <= hi);
    if (!allInside) continue;
    const diff = Math.abs(medianInterval - canon);
    if (!best || diff < best.diff) best = { cadence, diff };
  }
  if (!best) return fail('intervals_not_in_one_cadence_window', kept.length);

  // Recency: the series must still be live.
  const canonicalDays = CADENCE_WINDOWS[best.cadence][2];
  const lastSeen = kept[kept.length - 1].date;
  const daysSinceLast = (now.getTime() - lastSeen.getTime()) / 86_400_000;
  if (daysSinceLast > canonicalDays * RECENCY_MULTIPLIER) {
    return fail('series_lapsed', kept.length);
  }

  return {
    qualifies: true,
    cadence: best.cadence,
    billingCycle: toBillingCycle(best.cadence),
    medianAmount: Math.round(medianAmount * 100) / 100,
    occurrencesUsed: kept.length,
    usedDayKeys: kept.map((r) => r.dayKey),
    reason: 'qualified',
  };
}


/**
 * Annual-only qualification pass.
 *
 * Run ONLY after `qualifyRecurringSeries` has failed, and only for
 * merchants that look like a candidate. Deliberately narrow: it accepts
 * exactly one interval, and that interval must sit inside the yearly
 * window. Everything else — amount consistency, the minimum amount, the
 * liveness check — matches the general path, because those rules are
 * about whether a series is real, not about how often it bills.
 *
 * A single interval is weaker evidence than the three-plus the general
 * path demands, which is why this is not simply folded into the main
 * function by lowering MIN_OCCURRENCES. Lowering that globally would let
 * any two coincidental same-priced payments 30 days apart become a
 * subscription. Confining the relaxation to a 360-370 day gap keeps it
 * to the case where the strictness was the bug.
 */
export function qualifyAnnualSeries(
  occurrences: RecurringOccurrence[],
  now: Date = new Date(),
): QualificationResult {
  const rows: Array<{ date: Date; dayKey: string; amount: number }> = [];
  for (const occ of occurrences) {
    const d = occ.date instanceof Date ? occ.date : new Date(occ.date);
    if (Number.isNaN(d.getTime())) continue;
    const amount = Math.abs(Number(occ.amount) || 0);
    if (amount < 0.01) continue;
    rows.push({ date: d, dayKey: d.toISOString().slice(0, 10), amount });
  }

  const cutoff = now.getTime() - ANNUAL_LOOKBACK_DAYS * 86_400_000;
  const recent = rows.filter((r) => r.date.getTime() >= cutoff);
  if (recent.length < MIN_OCCURRENCES_ANNUAL) {
    return fail('annual_too_few_occurrences', recent.length);
  }

  recent.sort((a, b) => a.date.getTime() - b.date.getTime());
  const seenDays = new Set<string>();
  const deduped: typeof recent = [];
  for (const r of recent) {
    if (seenDays.has(r.dayKey)) continue;
    seenDays.add(r.dayKey);
    deduped.push(r);
  }
  if (deduped.length < MIN_OCCURRENCES_ANNUAL) {
    return fail('annual_too_few_distinct_days', deduped.length);
  }

  const med = medianOf(deduped.map((r) => r.amount));
  const lo = med * (1 - AMOUNT_TOLERANCE);
  const hi = med * (1 + AMOUNT_TOLERANCE);
  const kept = deduped.filter((r) => r.amount >= lo && r.amount <= hi);
  if (kept.length < MIN_OCCURRENCES_ANNUAL) {
    return fail('annual_amounts_not_consistent', kept.length);
  }

  const medianAmount = medianOf(kept.map((r) => r.amount));
  if (medianAmount < MIN_AMOUNT_GBP) {
    return fail('annual_below_minimum_amount', kept.length);
  }

  const intervals: number[] = [];
  for (let i = 1; i < kept.length; i++) {
    const days = Math.round(
      (kept[i].date.getTime() - kept[i - 1].date.getTime()) / 86_400_000,
    );
    if (days >= 1) intervals.push(days);
  }
  if (intervals.length < 1) return fail('annual_no_intervals', kept.length);

  const [yLo, yHi, yCanon] = CADENCE_WINDOWS.yearly;
  if (!intervals.every((d) => d >= yLo && d <= yHi)) {
    return fail('annual_intervals_not_yearly', kept.length);
  }

  // Liveness, same rule as the general path: something cancelled 18
  // months ago must not reappear as a live subscription.
  const lastSeen = kept[kept.length - 1].date;
  const daysSinceLast = (now.getTime() - lastSeen.getTime()) / 86_400_000;
  if (daysSinceLast > yCanon * RECENCY_MULTIPLIER) {
    return fail('annual_series_lapsed', kept.length);
  }

  return {
    qualifies: true,
    cadence: 'yearly',
    billingCycle: toBillingCycle('yearly'),
    medianAmount: Math.round(medianAmount * 100) / 100,
    occurrencesUsed: kept.length,
    usedDayKeys: kept.map((r) => r.dayKey),
    reason: 'qualified_annual',
  };
}
