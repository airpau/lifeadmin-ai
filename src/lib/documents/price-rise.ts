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
 * bills, worked out from the gaps between its documents: monthly
 * within 20 days, quarterly within 35 days, yearly within 60 days.
 *
 * The yearly cost of the rise: the difference times 12 (monthly), 4
 * (quarterly) or 1 (yearly). A new amount more than three times the old
 * one is treated as two different things rather than a price rise.
 */

import { daysBetween } from '@/lib/documents/dates';
import { normaliseSupplierName, supplierMatches } from '@/lib/documents/packs/supplier-match';
import type { DocType } from '@/lib/documents/types';

export type Cadence = 'monthly' | 'quarterly' | 'annual';

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

/** Billing cadence from the gaps between a supplier's documents. */
export function inferCadence(dates: string[], family: 'bill' | 'policy'): Cadence {
  if (family === 'policy') return 'annual';
  const sorted = [...new Set(dates)].sort();
  if (sorted.length < 2) return 'monthly';
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1], sorted[i]));
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median <= 45) return 'monthly';
  if (median <= 135) return 'quarterly';
  // A gap near a year means yearly; anything in between is most likely
  // monthly bills with some missing, so compare them as monthly.
  return median >= 300 ? 'annual' : 'monthly';
}

export const PERIOD_TOLERANCE_DAYS: Record<Cadence, number> = { monthly: 20, quarterly: 35, annual: 60 };
const PER_YEAR: Record<Cadence, number> = { monthly: 12, quarterly: 4, annual: 1 };

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
