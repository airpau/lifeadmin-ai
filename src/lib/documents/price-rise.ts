/**
 * Price-rise watch over the documents vault. Pure: no AI, no database.
 *
 * For each supplier, compare its latest bill, statement, policy or
 * renewal with the one from about a year earlier, and flag a rise of
 * more than 5 percent or more than £50 a year.
 *
 * What counts:
 *  - bills; policies and contracts (renewals); letters that mention a
 *    renewal or carry a renewal date; statements only when they read
 *    like a bill (energy, water, broadband, phone, insurance, council
 *    tax), because a bank or card statement's amount is a balance, not
 *    a price
 *  - amounts in pounds above £5
 *  - never receipts or invoices: those are one-off purchases, and two
 *    different things bought from the same shop a year apart are not a
 *    price rise
 *
 * Same supplier: the normalised supplier name (supplier-match.ts) must
 * match. Same kind of document: bills are compared with bills and
 * statements, policies with policies and renewals.
 *
 * Similar period: the older document must be dated close to a year
 * before the newer one. How close depends on how often the supplier
 * bills, worked out from the typical gap between its documents: monthly
 * within 20 days, quarterly within 35, half yearly within 45, yearly
 * within 60. A supplier whose billing pattern is unclear is skipped.
 *
 * The yearly cost of the rise: the difference times 12 (monthly), 4
 * (quarterly), 2 (half yearly) or 1 (yearly). A new amount more than
 * three times the old one is treated as two different things rather
 * than a price rise.
 */

import { addDays, daysBetween } from '@/lib/documents/dates';
import { normaliseSupplierName, supplierMatches } from '@/lib/documents/packs/supplier-match';
import type { DocType } from '@/lib/documents/types';

export type Cadence = 'monthly' | 'quarterly' | 'half_yearly' | 'annual';

export interface PriceDoc {
  id: string;
  doc_type: DocType;
  supplier: string | null;
  amount: number | null;
  currency: string | null;
  doc_date: string | null;
  renewal_date: string | null;
  summary: string | null;
  filename: string;
  email_subject: string | null;
  status?: string;
}

export interface PriceRiseFinding {
  supplier: string;
  supplierNormalised: string;
  docType: DocType;
  cadence: Cadence;
  oldDoc: PriceDoc;
  newDoc: PriceDoc;
  oldAmount: number;
  newAmount: number;
  oldDate: string;
  newDate: string;
  increasePct: number;
  annualIncrease: number;
}

export const DEFAULT_PCT_THRESHOLD = 5;
export const DEFAULT_ANNUAL_THRESHOLD_GBP = 50;
export const MIN_AMOUNT_GBP = 5;
export const MAX_RISE_RATIO = 3;

const BILL_LIKE_STATEMENT_RE = /\b(energy|gas|electric(ity)?|water|broadband|fibre|internet|phone|mobile|tv|insurance|council tax|annual statement of account)\b/i;
const NOT_PRICE_STATEMENT_RE = /\b(bank|current account|credit card|card statement|mortgage|loan|pension|isa|savings|investment|payslip)\b/i;
const RENEWAL_RE = /\b(renewal|renews|renewing|premium)\b/i;

function text(d: PriceDoc): string {
  return [d.supplier, d.summary, d.filename, d.email_subject].filter(Boolean).join(' ');
}

/** 'bill' or 'policy' family, or null when the document is not a price at all. */
export function priceFamily(d: PriceDoc): 'bill' | 'policy' | null {
  const t = text(d);
  switch (d.doc_type) {
    case 'bill':
      return 'bill';
    case 'statement':
      return BILL_LIKE_STATEMENT_RE.test(t) && !NOT_PRICE_STATEMENT_RE.test(t) ? 'bill' : null;
    case 'policy':
    case 'contract':
      return 'policy';
    case 'letter':
      return d.renewal_date || RENEWAL_RE.test(t) ? 'policy' : null;
    default:
      // receipt, invoice, certificate, other: one-off or not a price
      return null;
  }
}

function usable(d: PriceDoc): boolean {
  if (d.status && d.status !== 'active') return false;
  if (!d.supplier || !d.doc_date) return false;
  if (d.currency && d.currency !== 'GBP') return false;
  const a = Number(d.amount);
  return Number.isFinite(a) && a > MIN_AMOUNT_GBP;
}

/** Typical (median) gap in days between a supplier's documents, or null with fewer than two dates. */
export function typicalGapDays(dates: string[]): number | null {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Billing cadence from the typical gap between a supplier's documents:
 * up to 45 days monthly, up to 135 quarterly, up to 250 half yearly,
 * 300 or more yearly. A gap between 250 and 300 days, or too few
 * documents, is unknown (null) and the supplier is skipped rather than
 * guessed: guessing monthly turned a half yearly water bill into a £240
 * a year "rise".
 */
export function inferCadence(dates: string[], family: 'bill' | 'policy'): Cadence | null {
  if (family === 'policy') return 'annual';
  const median = typicalGapDays(dates);
  if (median === null) return null;
  if (median <= 45) return 'monthly';
  if (median <= 135) return 'quarterly';
  if (median <= 250) return 'half_yearly';
  return median >= 300 ? 'annual' : null;
}

export const PERIOD_TOLERANCE_DAYS: Record<Cadence, number> = { monthly: 20, quarterly: 35, half_yearly: 45, annual: 60 };
export const PER_YEAR: Record<Cadence, number> = { monthly: 12, quarterly: 4, half_yearly: 2, annual: 1 };

/**
 * Only a supplier billed about monthly (typical gap of 45 days or less)
 * may be fed into price_increase_alerts, whose consumers describe every
 * alert as a monthly payment.
 */
export function feedsPriceAlerts(f: Pick<PriceRiseFinding, 'cadence'>): boolean {
  return f.cadence === 'monthly';
}

/** Group documents by supplier (fuzzy) and price family. */
export function groupBySupplier(docs: PriceDoc[]): Array<{ supplier: string; normalised: string; family: 'bill' | 'policy'; docs: PriceDoc[] }> {
  const groups: Array<{ supplier: string; normalised: string; family: 'bill' | 'policy'; docs: PriceDoc[] }> = [];
  for (const d of docs) {
    if (!usable(d)) continue;
    const family = priceFamily(d);
    if (!family) continue;
    const g = groups.find((x) => x.family === family && supplierMatches(x.supplier, d.supplier));
    if (g) g.docs.push(d);
    else groups.push({ supplier: d.supplier!, normalised: normaliseSupplierName(d.supplier), family, docs: [d] });
  }
  return groups;
}

/**
 * Year on year rises. `pctThreshold` may be raised per supplier by the
 * caller (the existing alert system's auto-tune never goes below 5).
 */
export function detectPriceRises(
  docs: PriceDoc[],
  opts: { pctThreshold?: (supplierNormalised: string) => number; annualThresholdGbp?: number } = {},
): PriceRiseFinding[] {
  const annualThreshold = opts.annualThresholdGbp ?? DEFAULT_ANNUAL_THRESHOLD_GBP;
  const findings: PriceRiseFinding[] = [];
  for (const g of groupBySupplier(docs)) {
    if (g.docs.length < 2) continue;
    const sorted = [...g.docs].sort((a, b) => (a.doc_date! < b.doc_date! ? -1 : a.doc_date! > b.doc_date! ? 1 : 0));
    const newest = sorted[sorted.length - 1];
    const cadence = inferCadence(sorted.map((d) => d.doc_date!), g.family);
    if (!cadence) continue;
    const tolerance = PERIOD_TOLERANCE_DAYS[cadence];

    // The older document dated closest to a year before the newest.
    let best: PriceDoc | null = null;
    let bestOff = Infinity;
    for (const d of sorted) {
      if (d.id === newest.id) continue;
      const off = Math.abs(daysBetween(d.doc_date!, newest.doc_date!) - 365);
      if (off <= tolerance && off < bestOff) {
        best = d;
        bestOff = off;
      }
    }
    if (!best) continue;

    const oldAmount = Math.round(Number(best.amount) * 100) / 100;
    const newAmount = Math.round(Number(newest.amount) * 100) / 100;
    const diff = Math.round((newAmount - oldAmount) * 100) / 100;
    if (diff <= 0) continue;
    if (newAmount > oldAmount * MAX_RISE_RATIO) continue;

    const increasePct = Math.round((diff / oldAmount) * 1000) / 10;
    const annualIncrease = Math.round(diff * PER_YEAR[cadence] * 100) / 100;
    const pctThreshold = Math.max(DEFAULT_PCT_THRESHOLD, opts.pctThreshold?.(g.normalised) ?? DEFAULT_PCT_THRESHOLD);
    if (!(increasePct > pctThreshold || annualIncrease > annualThreshold)) continue;

    findings.push({
      supplier: newest.supplier || g.supplier,
      supplierNormalised: g.normalised,
      docType: newest.doc_type,
      cadence,
      oldDoc: best,
      newDoc: newest,
      oldAmount,
      newAmount,
      oldDate: best.doc_date!,
      newDate: newest.doc_date!,
      increasePct,
      annualIncrease,
    });
  }
  return findings.sort((a, b) => b.annualIncrease - a.annualIncrease);
}

/** Category for the price_increase_alerts row, from the supplier's wording. */
export function alertCategoryFor(d: PriceDoc): string | null {
  const t = text(d).toLowerCase();
  if (/\b(gas|electric|energy|octopus|ovo|edf|e\.on|british gas|scottish power|utilita)\b/.test(t)) return 'energy';
  if (/\bwater\b/.test(t)) return 'water';
  if (/\b(broadband|fibre|internet|virgin media|talktalk|plusnet|hyperoptic|sky)\b/.test(t)) return 'broadband';
  if (/\b(mobile|vodafone|o2|giffgaff|three|ee)\b/.test(t)) return 'mobile';
  if (/\binsurance\b/.test(t)) return 'insurance';
  if (/\bcouncil tax\b/.test(t)) return 'council_tax';
  return null;
}

// ---------------------------------------------------------------------------
// Dedupe against what the user has already seen
// ---------------------------------------------------------------------------

export interface ExistingRise {
  id: string;
  supplier_normalised: string;
  cadence: string;
  status: 'active' | 'dismissed' | string;
  new_date: string;
  old_document_id: string;
  new_document_id: string;
  price_alert_id: string | null;
}

/** How long a dismissed (or still active) rise covers its supplier. */
export const RISE_MEMORY_DAYS = 365;

/**
 * What to do with a fresh finding, given the rises already recorded:
 *  - the same pair of documents: skip
 *  - a rise for the same supplier and cadence dated in the last 12
 *    months that the user DISMISSED: skip (otherwise next month's bill
 *    would raise the same rise again)
 *  - one that is still ACTIVE: update it to the newer documents rather
 *    than add a second row (and no second alert)
 *  - otherwise: insert
 */
export function priceRiseAction(
  f: Pick<PriceRiseFinding, 'supplierNormalised' | 'cadence' | 'oldDoc' | 'newDoc'>,
  existing: ExistingRise[],
  today: string,
): { kind: 'skip' } | { kind: 'update'; id: string } | { kind: 'insert' } {
  if (existing.some((r) => r.old_document_id === f.oldDoc.id && r.new_document_id === f.newDoc.id)) return { kind: 'skip' };
  const since = addDays(today, -RISE_MEMORY_DAYS);
  const recent = existing.filter(
    (r) => r.cadence === f.cadence && r.new_date >= since && (r.supplier_normalised === f.supplierNormalised || supplierMatches(r.supplier_normalised, f.supplierNormalised)),
  );
  if (recent.some((r) => r.status === 'dismissed')) return { kind: 'skip' };
  const active = recent.find((r) => r.status === 'active');
  return active ? { kind: 'update', id: active.id } : { kind: 'insert' };
}
