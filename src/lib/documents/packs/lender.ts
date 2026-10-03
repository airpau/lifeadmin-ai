/**
 * Pack: mortgage or lender pack.
 *
 * The paperwork a mortgage or remortgage application usually asks for,
 * from the vault, with a clear list of what is still missing:
 *
 *  - bank statements for each of the last three months (required)
 *  - latest payslips, when the vault has them (statements or letters
 *    with payslip wording; optional, the self-employed will not have them)
 *  - proof of address: a utility or council tax bill dated within the
 *    last three months (required; mobile phone bills are not accepted by
 *    most lenders, so they are left out)
 *  - buildings or home insurance policy (required)
 *  - the current mortgage statement (optional, for a remortgage)
 *
 * Never includes identity documents (passport, driving licence and so
 * on): the engine refuses them for every pack, even when added by hand.
 *
 * Recency rules, with `today` in Europe/London:
 *  - "the last three months" are the three calendar months before the
 *    current one. A statement counts for the month of its date; one
 *    dated in the current month counts for the month before, because
 *    statements are issued just after the period they cover.
 *  - "within three months" for proof of address and payslips is 92 days.
 *  - insurance and mortgage statements must be from the last 13 months,
 *    or (insurance) still running by its renewal or expiry date.
 */

import { byDateDesc, daysAgo, docText, monthLabel, monthOf, monthsBefore, packDate } from '@/lib/documents/packs/common';
import type { PackContext, PackDefinition, PackDocument } from '@/lib/documents/packs/types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LenderParams {}

/** Days back that count as "within the last three months". */
export const RECENT_DAYS = 92;
/** Days back for yearly documents (insurance, mortgage statement). */
export const YEARLY_DAYS = 400;

const PAYSLIP_RE = /\b(payslips?|pay slips?|pay advice|salary slips?|wage slips?|earnings statement|pay statement)\b/i;
const NOT_BANK_RE = /\b(credit card|mortgage|loan|pension|isa|investment|savings|share|payslips?|pay slips?|pay advice|salary|wage|energy|gas|electric|water|council tax|broadband|mobile|insurance)\b/i;
const MORTGAGE_RE = /\bmortgage\b/i;
const COUNCIL_TAX_RE = /\bcouncil tax\b/i;
const MOBILE_RE = /\b(mobile|sim only|airtime)\b/i;
const HOME_INSURANCE_RE = /\b(home|buildings?|contents|house|household|property|landlord)\b/i;

export function isPayslip(d: PackDocument): boolean {
  return (d.doc_type === 'statement' || d.doc_type === 'letter') && PAYSLIP_RE.test(docText(d));
}

export function isBankStatement(d: PackDocument): boolean {
  return d.doc_type === 'statement' && !NOT_BANK_RE.test(docText(d));
}

export function isMortgageStatement(d: PackDocument): boolean {
  return d.doc_type === 'statement' && MORTGAGE_RE.test(docText(d)) && !isPayslip(d);
}

/** A utility or council tax bill (not a mobile phone bill). */
export function isProofOfAddress(d: PackDocument): boolean {
  const t = docText(d);
  if (MOBILE_RE.test(t)) return false;
  if (d.doc_type === 'bill') return true;
  return d.doc_type === 'letter' && COUNCIL_TAX_RE.test(t);
}

export function isHomeInsurance(d: PackDocument): boolean {
  return (d.doc_type === 'policy' || d.doc_type === 'certificate') && /insur|policy|cover/i.test(docText(d) + ' ' + d.doc_type) && HOME_INSURANCE_RE.test(docText(d));
}

/** The three calendar months a lender will ask statements for, oldest first. */
export function requiredStatementMonths(today: string): string[] {
  return [monthsBefore(today, 3), monthsBefore(today, 2), monthsBefore(today, 1)];
}

/** Which month a statement counts for (current month counts for the one before). */
export function statementMonth(d: PackDocument, today: string): string {
  const m = monthOf(packDate(d));
  return m === monthOf(today) ? monthsBefore(today, 1) : m;
}

function recent(d: PackDocument, today: string, days: number): boolean {
  const date = packDate(d);
  return date >= daysAgo(today, days) && date <= today;
}

function insuranceCurrent(d: PackDocument, today: string): boolean {
  const ends = [d.renewal_date, d.expiry_date].filter((x): x is string => !!x);
  if (ends.some((e) => e >= today)) return true;
  if (ends.length > 0) return false;
  return recent(d, today, YEARLY_DAYS);
}

function latest(docs: PackDocument[], n: number): PackDocument[] {
  return [...docs].sort(byDateDesc).slice(0, n);
}

function bankStatementsForMonths(docs: PackDocument[], today: string): PackDocument[] {
  const months = new Set(requiredStatementMonths(today));
  return docs.filter((d) => isBankStatement(d) && recent(d, today, 130) && months.has(statementMonth(d, today)));
}

export const lenderPack: PackDefinition<LenderParams> = {
  type: 'lender',
  name: 'Mortgage or lender pack',
  blurb:
    'The paperwork a mortgage or remortgage application asks for: three months of bank statements, payslips, proof of address and your home insurance. We show you what is missing before you start.',
  audience: 'For a mortgage lender or broker',

  parseParams() {
    return { ok: true, params: {} };
  },

  defaultTitle(_p, ctx) {
    return `Mortgage pack, ${monthLabel(monthOf(ctx.today))}`;
  },

  describeParams(_p, ctx) {
    const months = requiredStatementMonths(ctx.today);
    return `Bank statements for ${monthLabel(months[0])} to ${monthLabel(months[2])}, proof of address from the last three months`;
  },

  candidateQuery(_p, today) {
    return { types: ['statement', 'letter', 'bill', 'policy', 'certificate'], from: daysAgo(today, YEARLY_DAYS), to: today };
  },

  autoSelect(candidates, ctx) {
    const t = ctx.today;
    const picks = [
      ...bankStatementsForMonths(candidates, t),
      ...latest(candidates.filter((d) => isPayslip(d) && recent(d, t, RECENT_DAYS)), 3),
      ...latest(candidates.filter((d) => isProofOfAddress(d) && recent(d, t, RECENT_DAYS)), 1),
      ...latest(candidates.filter((d) => isHomeInsurance(d) && insuranceCurrent(d, t)), 1),
      ...latest(candidates.filter((d) => isMortgageStatement(d) && recent(d, t, YEARLY_DAYS)), 1),
    ];
    const seen = new Set<string>();
    return picks.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
  },

  checklist: [
    {
      key: 'bank_statements',
      label: 'Bank statements for each of the last three months',
      hint: 'Download them from your banking app as PDFs and add them to your vault, or forward the statement emails to the inbox you connected.',
      required: true,
      match: (d, ctx: PackContext<LenderParams>) => isBankStatement(d) && recent(d, ctx.today, 130),
      assess: (matching, ctx) => {
        const needed = requiredStatementMonths(ctx.today);
        const have = new Set(matching.map((d) => statementMonth(d, ctx.today)));
        const missing = needed.filter((m) => !have.has(m));
        return {
          found: missing.length === 0,
          detail: missing.length ? `No statement found for ${missing.map(monthLabel).join(', ')}.` : `Covers ${needed.map(monthLabel).join(', ')}.`,
        };
      },
    },
    {
      key: 'payslips',
      label: 'Your latest payslips (if you are employed)',
      hint: 'Most lenders ask for your last three payslips. If you are self-employed they will ask for tax calculations instead.',
      required: false,
      match: (d, ctx: PackContext<LenderParams>) => isPayslip(d) && recent(d, ctx.today, RECENT_DAYS),
    },
    {
      key: 'proof_of_address',
      label: 'Proof of address: a utility or council tax bill from the last three months',
      hint: 'A gas, electricity, water, broadband or council tax bill in your name, dated in the last three months. Mobile phone bills are not usually accepted.',
      required: true,
      match: (d, ctx: PackContext<LenderParams>) => isProofOfAddress(d) && recent(d, ctx.today, RECENT_DAYS),
    },
    {
      key: 'home_insurance',
      label: 'Buildings or home insurance policy',
      hint: 'Your current policy schedule. For a new purchase, lenders need buildings cover from the day you exchange.',
      required: true,
      match: (d, ctx: PackContext<LenderParams>) => isHomeInsurance(d) && insuranceCurrent(d, ctx.today),
    },
    {
      key: 'mortgage_statement',
      label: 'Your current mortgage statement (if you are remortgaging)',
      hint: 'Your lender sends an annual mortgage statement. It shows the balance and the rate you are on now.',
      required: false,
      match: (d, ctx: PackContext<LenderParams>) => isMortgageStatement(d) && recent(d, ctx.today, YEARLY_DAYS),
    },
  ],

  footnote:
    'This pack never includes identity documents such as a passport or driving licence. Your lender or broker will check your identity themselves.',
};
