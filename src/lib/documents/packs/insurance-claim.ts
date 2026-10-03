/**
 * Pack: insurance claim pack.
 *
 * The user picks the policy document, describes what happened (free
 * text and an optional date) and picks the receipts or invoices for the
 * items they are claiming for. The bundle has the policy, the receipts
 * as proof of purchase and a claim summary page with the items, dates
 * and the total.
 *
 * Nothing is sent to the insurer. The user submits the claim themselves.
 */

import { isUuid, uuidList } from '@/lib/documents/packs/engine';
import { byDateAsc, longDate, money, packDate } from '@/lib/documents/packs/common';
import type { PackDefinition, PackDocument, SummarySection } from '@/lib/documents/packs/types';
import { DOC_TYPE_SINGULAR } from '@/lib/documents/types';
import { validIsoDate } from '@/lib/documents/classify';

export interface InsuranceClaimParams {
  policy_document_id: string;
  item_ids: string[];
  incident: string;
  incident_date: string | null;
}

export const MAX_CLAIM_ITEMS = 50;
const POLICY_TYPES = new Set(['policy', 'certificate', 'contract']);

function policyOf(selected: PackDocument[], p: InsuranceClaimParams): PackDocument | null {
  return selected.find((d) => d.id.toLowerCase() === p.policy_document_id) ?? null;
}

function itemsOf(selected: PackDocument[], p: InsuranceClaimParams): PackDocument[] {
  const ids = new Set(p.item_ids);
  return selected.filter((d) => ids.has(d.id.toLowerCase()) && d.id.toLowerCase() !== p.policy_document_id);
}

export const insuranceClaimPack: PackDefinition<InsuranceClaimParams> = {
  type: 'insurance_claim',
  name: 'Insurance claim pack',
  blurb:
    'Making a claim? Pick your policy and the receipts for what was lost, stolen or damaged. We put them together with a claim summary of the items, dates and total, ready for you to send to your insurer.',
  audience: 'For your insurer',

  parseParams(raw, today) {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    if (!isUuid(o.policy_document_id)) return { ok: false, error: 'Choose the policy you are claiming on.' };
    const incident = typeof o.incident === 'string' ? o.incident.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 2000) : '';
    if (incident.length < 3) return { ok: false, error: 'Describe what happened in a few words.' };
    const items = uuidList(o.item_ids, MAX_CLAIM_ITEMS + 1);
    if (items.length > MAX_CLAIM_ITEMS) return { ok: false, error: `You can add up to ${MAX_CLAIM_ITEMS} receipts to one claim.` };
    let incidentDate: string | null = null;
    if (o.incident_date !== undefined && o.incident_date !== null && o.incident_date !== '') {
      incidentDate = validIsoDate(o.incident_date);
      if (!incidentDate || incidentDate > today) return { ok: false, error: 'The incident date must be a real date, not in the future.' };
    }
    const policyId = String(o.policy_document_id).toLowerCase();
    return {
      ok: true,
      params: { policy_document_id: policyId, item_ids: items.filter((id) => id !== policyId), incident, incident_date: incidentDate },
    };
  },

  defaultTitle(p) {
    return p.incident_date ? `Insurance claim, ${longDate(p.incident_date)}` : 'Insurance claim';
  },

  describeParams(p) {
    return `${p.item_ids.length} item${p.item_ids.length === 1 ? '' : 's'} claimed${p.incident_date ? `, incident on ${longDate(p.incident_date)}` : ''}`;
  },

  candidateQuery(p) {
    return { types: null, from: null, to: null, ids: [p.policy_document_id, ...p.item_ids] };
  },

  autoSelect(candidates, ctx) {
    const wanted = new Set([ctx.params.policy_document_id, ...ctx.params.item_ids]);
    return candidates.filter((d) => wanted.has(d.id.toLowerCase()));
  },

  // The policy first, then the receipts oldest first.
  sort(a, b, ctx) {
    const pa = a.id.toLowerCase() === ctx.params.policy_document_id ? 0 : 1;
    const pb = b.id.toLowerCase() === ctx.params.policy_document_id ? 0 : 1;
    return pa - pb || byDateAsc(a, b);
  },

  checklist: [
    {
      key: 'policy',
      label: 'Your insurance policy',
      hint: 'Choose the policy schedule or certificate from your vault. If it is not there, press Find my documents or import it from Google Drive.',
      required: true,
      match: (d, ctx) => d.id.toLowerCase() === ctx.params.policy_document_id,
      assess: (matching, ctx) => {
        const policy = matching[0];
        if (!policy) return { found: false, detail: 'The policy you chose is no longer in your vault.' };
        const ends = [policy.expiry_date, policy.renewal_date].filter((x): x is string => !!x).sort();
        const incident = ctx.params.incident_date;
        if (!POLICY_TYPES.has(policy.doc_type)) {
          return { found: true, detail: `This is filed as a ${DOC_TYPE_SINGULAR[policy.doc_type].toLowerCase()}, not a policy. Check it is the right document.` };
        }
        if (incident && ends.length && ends[ends.length - 1] < incident) {
          return { found: true, detail: 'This policy renewed or ended before the incident date. Check you have the policy that was in force at the time.' };
        }
        return { found: true, detail: null };
      },
    },
    {
      key: 'proof_of_purchase',
      label: 'Proof of purchase for the items you are claiming for',
      hint: 'Pick the receipts or invoices for each item. For anything without a receipt, a bank or card statement showing the payment often helps.',
      required: true,
      match: (d, ctx) => ctx.params.item_ids.includes(d.id.toLowerCase()),
    },
    {
      key: 'incident_date',
      label: 'The date it happened',
      hint: 'Insurers ask for the date of the loss or damage. Add it to the claim details.',
      required: false,
      fromContext: (ctx) => ({ found: !!ctx.params.incident_date, count: ctx.params.incident_date ? 1 : 0 }),
    },
  ],

  summary(selected, ctx): SummarySection[] {
    const p = ctx.params;
    const policy = policyOf(selected, p);
    const items = itemsOf(selected, p).sort(byDateAsc);
    const gbp = items.filter((d) => !d.currency || d.currency === 'GBP');
    const total = gbp.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const unpriced = items.filter((d) => d.amount === null || d.amount === undefined).length;
    const sections: SummarySection[] = [
      {
        title: 'What happened',
        lines: [p.incident_date ? `Date: ${longDate(p.incident_date)}` : 'Date: not given', p.incident],
      },
      {
        title: 'Policy',
        lines: policy
          ? [
              [policy.supplier, policy.summary || policy.filename].filter(Boolean).join(': '),
              [
                policy.doc_date ? `Dated ${longDate(policy.doc_date)}` : null,
                policy.renewal_date ? `renews ${longDate(policy.renewal_date)}` : null,
                policy.expiry_date ? `expires ${longDate(policy.expiry_date)}` : null,
              ]
                .filter(Boolean)
                .join(', '),
            ].filter((x) => !!x)
          : ['The policy you chose is not in your vault any more.'],
      },
      {
        title: 'Items claimed',
        table: {
          columns: ['Bought', 'From', 'Item', 'Price'],
          rows: items.map((d) => [packDate(d), d.supplier || '', (d.summary || d.filename).slice(0, 120), money(d.amount, d.currency)]),
          alignRight: [3],
        },
        lines: [
          `Total of the items with a price in pounds: ${money(total)}.`,
          unpriced ? `${unpriced} item${unpriced === 1 ? ' has' : 's have'} no price we could read. Add the value yourself when you submit.` : '',
          'Insurers often also ask for photos of the damage and, for theft, a crime reference number. Add those when you submit the claim.',
        ].filter(Boolean),
      },
    ];
    return sections;
  },

  footnote: 'Paybacker never sends a claim for you. Check the details and send the pack to your insurer yourself.',
};
