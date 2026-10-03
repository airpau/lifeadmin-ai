/**
 * Pack: dispute evidence bundle.
 *
 * For one of the user's Paybacker disputes: a dated timeline of the
 * letters sent and the company's replies, plus the vault documents from
 * that company (bills, invoices, statements, contracts, receipts), as a
 * bundle suitable for an ombudsman or a small claim.
 *
 * Read only towards the dispute: it never changes the dispute's state,
 * outcome or correspondence. Correspondence is numbered as exhibits in
 * the same order as the Ombudsman escalation pack (oldest first), so the
 * two line up if the user has both.
 *
 * Vault documents are matched on the dispute's company name (supplier
 * fuzzy match, see supplier-match.ts) and the user can add or remove
 * documents by hand.
 */

import { isUuid } from '@/lib/documents/packs/engine';
import { byDateAsc, longDate, money, packDate } from '@/lib/documents/packs/common';
import { documentMatchesSupplier } from '@/lib/documents/packs/supplier-match';
import type { PackContext, PackDefinition, PackDocument } from '@/lib/documents/packs/types';

export interface DisputeEvidenceParams {
  dispute_id: string;
}

function companyName(ctx: PackContext<DisputeEvidenceParams>): string {
  return ctx.dispute?.provider_name || ctx.dispute?.merchant_normalised || 'the company';
}

function fromCompany(d: PackDocument, ctx: PackContext<DisputeEvidenceParams>): boolean {
  return documentMatchesSupplier(d, [ctx.dispute?.provider_name, ctx.dispute?.merchant_normalised]);
}

const LETTER_TYPES = new Set(['ai_letter']);
const REPLY_TYPES = new Set(['company_email', 'company_letter', 'company_response']);

export const disputeEvidencePack: PackDefinition<DisputeEvidenceParams> = {
  type: 'dispute_evidence',
  name: 'Dispute evidence bundle',
  blurb:
    'Everything about one dispute in date order: the letters you sent, what the company said back, and your bills, contracts and receipts from them. Ready to hand to an ombudsman or a small claims court.',
  audience: 'For an ombudsman, a regulator or a small claims court',

  parseParams(raw) {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    if (!isUuid(o.dispute_id)) return { ok: false, error: 'Choose which dispute this bundle is for.' };
    return { ok: true, params: { dispute_id: String(o.dispute_id).toLowerCase() } };
  },

  defaultTitle(_params, ctx) {
    return `Evidence bundle: ${companyName(ctx)}`;
  },

  describeParams(_params, ctx) {
    const d = ctx.dispute;
    if (!d) return 'Dispute';
    const parts = [`Dispute with ${companyName(ctx)}`];
    if (d.created_at) parts.push(`opened ${longDate(d.created_at)}`);
    if (d.disputed_amount) parts.push(`amount in dispute ${money(d.disputed_amount)}`);
    return parts.join(', ');
  },

  // Every type and date: the match on the company name does the narrowing.
  candidateQuery() {
    return { types: null, from: null, to: null };
  },

  autoSelect(candidates, ctx) {
    if (!ctx.dispute) return [];
    return candidates.filter((d) => fromCompany(d, ctx));
  },

  checklist: [
    {
      key: 'letters_sent',
      label: 'The letters you sent the company',
      hint: 'Write your complaint letter from the dispute page, or add a letter you sent yourself to the dispute timeline.',
      required: true,
      fromContext: (ctx) => {
        const n = (ctx.dispute?.correspondence ?? []).filter((c) => LETTER_TYPES.has(c.entry_type)).length;
        return { found: n > 0, count: n };
      },
    },
    {
      key: 'company_replies',
      label: "The company's replies",
      hint: 'Add their emails or letters to the dispute timeline, or link the email thread so replies are picked up for you. If they never replied, that is evidence too: the timeline shows it.',
      required: false,
      fromContext: (ctx) => {
        const n = (ctx.dispute?.correspondence ?? []).filter((c) => REPLY_TYPES.has(c.entry_type)).length;
        return { found: n > 0, count: n };
      },
    },
    {
      key: 'bills_statements',
      label: 'Bills, invoices or statements from the company',
      hint: 'Press Find my documents, or add the relevant bill from your vault by hand.',
      required: true,
      match: (d) => d.doc_type === 'bill' || d.doc_type === 'invoice' || d.doc_type === 'statement',
    },
    {
      key: 'contract_terms',
      label: 'Your contract, policy or terms',
      hint: 'If you have the contract or terms you signed up to, add it. It shows what was agreed.',
      required: false,
      match: (d) => d.doc_type === 'contract' || d.doc_type === 'policy',
    },
    {
      key: 'proof_of_payment',
      label: 'Proof of what you paid',
      hint: 'A receipt or a bank statement showing the payment helps show the money you are asking for back.',
      required: false,
      match: (d) => d.doc_type === 'receipt' || d.doc_type === 'statement',
    },
  ],

  sort: byDateAsc,
  timeline: true,

  summary(selected, ctx) {
    const d = ctx.dispute;
    const corr = d?.correspondence ?? [];
    const lines = [
      `Company: ${companyName(ctx)}`,
      d?.issue_type ? `Type of problem: ${d.issue_type.replace(/_/g, ' ')}` : null,
      d?.disputed_amount ? `Amount in dispute: ${money(d.disputed_amount)}` : null,
      d?.created_at ? `Dispute opened: ${longDate(d.created_at)}` : null,
      `Letters and replies: ${corr.length}`,
      `Documents from the company: ${selected.length}`,
      selected.length ? `Documents dated ${longDate(packDate(selected[0]))} to ${longDate(packDate(selected[selected.length - 1]))}` : null,
    ].filter((x): x is string => !!x);
    const sections = [{ title: 'About this dispute', lines }];
    if (d?.issue_summary) sections.push({ title: 'What went wrong, in your words', lines: [d.issue_summary.slice(0, 1500)] });
    return sections;
  },

  footnote:
    'Paybacker prepared this bundle from your own records. It does not send anything to the company or to an ombudsman: you decide where it goes.',
};
