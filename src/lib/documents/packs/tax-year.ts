/**
 * Pack: tax year pack.
 *
 * Every receipt, invoice and bill dated in one UK tax year (6 April to
 * 5 April, the user picks the year), with the accountant register as a
 * CSV (register.ts, with each row pointing at its file in the ZIP) and a
 * summary page of totals by supplier and by type. For self assessment
 * or an accountant.
 *
 * A document's date is its own date, falling back to the date the email
 * arrived (the same rule as the register). Totals are in pounds; any
 * document in another currency is listed but left out of the totals and
 * counted separately, so nothing is silently converted.
 */

import {
  EARLIEST_TAX_YEAR,
  longDate,
  money,
  packDate,
  taxYearLabel,
  taxYearOf,
  taxYearRange,
} from '@/lib/documents/packs/common';
import type { PackDefinition, PackDocument, SummarySection } from '@/lib/documents/packs/types';
import { DOC_TYPE_LABELS, type DocType } from '@/lib/documents/types';

export interface TaxYearParams {
  /** The calendar year the tax year starts in: 2025 means 6 April 2025 to 5 April 2026. */
  tax_year: number;
}

export const TAX_PACK_TYPES: DocType[] = ['receipt', 'invoice', 'bill'];

export function inTaxYear(d: PackDocument, startYear: number): boolean {
  const { from, to } = taxYearRange(startYear);
  const date = packDate(d);
  return date >= from && date <= to;
}

function isGbp(d: PackDocument): boolean {
  return !d.currency || d.currency === 'GBP';
}

/** Totals by supplier (pounds only), biggest first. */
export function totalsBySupplier(docs: PackDocument[]): Array<{ supplier: string; count: number; total: number; vat: number }> {
  const map = new Map<string, { supplier: string; count: number; total: number; vat: number }>();
  for (const d of docs) {
    if (!isGbp(d)) continue;
    const name = (d.supplier || 'Unknown supplier').trim();
    const key = name.toLowerCase();
    const row = map.get(key) ?? { supplier: name, count: 0, total: 0, vat: 0 };
    row.count += 1;
    row.total += Number(d.amount) || 0;
    row.vat += Number(d.vat_amount) || 0;
    map.set(key, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, total: Math.round(r.total * 100) / 100, vat: Math.round(r.vat * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.supplier.localeCompare(b.supplier));
}

/** Totals by document type (pounds only). */
export function totalsByType(docs: PackDocument[]): Array<{ type: DocType; count: number; total: number; vat: number }> {
  return TAX_PACK_TYPES.map((type) => {
    const ofType = docs.filter((d) => d.doc_type === type && isGbp(d));
    return {
      type,
      count: ofType.length,
      total: Math.round(ofType.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100) / 100,
      vat: Math.round(ofType.reduce((s, d) => s + (Number(d.vat_amount) || 0), 0) * 100) / 100,
    };
  });
}

export const taxYearPack: PackDefinition<TaxYearParams> = {
  type: 'tax_year',
  name: 'Tax year pack',
  blurb:
    'Every receipt, invoice and bill from one tax year, 6 April to 5 April, with a spreadsheet register and totals by supplier. Hand it to your accountant or keep it for your self assessment.',
  audience: 'For your self assessment or your accountant',

  parseParams(raw, today) {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const y = typeof o.tax_year === 'number' ? o.tax_year : Number(o.tax_year);
    const latest = taxYearOf(today);
    if (!Number.isInteger(y) || y < EARLIEST_TAX_YEAR || y > latest) {
      return { ok: false, error: `Choose a tax year between ${taxYearLabel(EARLIEST_TAX_YEAR)} and ${taxYearLabel(latest)}.` };
    }
    return { ok: true, params: { tax_year: y } };
  },

  defaultTitle(p) {
    return `Tax year ${taxYearLabel(p.tax_year)}`;
  },

  describeParams(p) {
    const { from, to } = taxYearRange(p.tax_year);
    return `Tax year ${taxYearLabel(p.tax_year)}: ${longDate(from)} to ${longDate(to)}`;
  },

  candidateQuery(p) {
    // The loader matches on the document date, and on the email date for
    // documents without one, so nothing undated in the year is missed.
    const { from, to } = taxYearRange(p.tax_year);
    return { types: TAX_PACK_TYPES, from, to };
  },

  autoSelect(candidates, ctx) {
    return candidates.filter((d) => TAX_PACK_TYPES.includes(d.doc_type) && inTaxYear(d, ctx.params.tax_year));
  },

  checklist: [
    {
      key: 'receipts',
      label: 'Receipts',
      hint: 'Receipts for things you bought. Press Find my documents to pick up any we have not filed yet.',
      required: false,
      match: (d) => d.doc_type === 'receipt',
    },
    {
      key: 'invoices',
      label: 'Invoices',
      hint: 'Invoices you were sent. Upload or import any that came by post.',
      required: false,
      match: (d) => d.doc_type === 'invoice',
    },
    {
      key: 'bills',
      label: 'Bills',
      hint: 'Household bills such as energy, water, broadband and council tax.',
      required: false,
      match: (d) => d.doc_type === 'bill',
    },
    {
      key: 'anything',
      label: 'At least one document in this tax year',
      hint: 'We found nothing dated in this tax year. Check the year, or press Find my documents first.',
      required: true,
      match: () => true,
    },
  ],

  includeRegisterCsv: true,

  summary(selected): SummarySection[] {
    const bySupplier = totalsBySupplier(selected);
    const byType = totalsByType(selected);
    const grand = byType.reduce((s, r) => s + r.total, 0);
    const grandVat = byType.reduce((s, r) => s + r.vat, 0);
    const foreign = selected.filter((d) => !isGbp(d));
    const noAmount = selected.filter((d) => d.amount === null || d.amount === undefined);
    const lines = [
      `${selected.length} document${selected.length === 1 ? '' : 's'}, ${money(grand)} in total, of which VAT ${money(grandVat)}.`,
      noAmount.length ? `${noAmount.length} document${noAmount.length === 1 ? ' has' : 's have'} no amount we could read. Check ${noAmount.length === 1 ? 'it' : 'them'} by hand.` : null,
      foreign.length ? `${foreign.length} document${foreign.length === 1 ? ' is' : 's are'} in another currency and ${foreign.length === 1 ? 'is' : 'are'} not in these totals.` : null,
      'Amounts are as shown on each document. Check them before you rely on them for a tax return.',
    ].filter((x): x is string => !!x);
    return [
      { title: 'Totals', lines },
      {
        title: 'By type',
        table: {
          columns: ['Type', 'Documents', 'Total', 'VAT'],
          rows: byType.map((r) => [DOC_TYPE_LABELS[r.type], String(r.count), money(r.total), money(r.vat)]),
          alignRight: [1, 2, 3],
        },
      },
      {
        title: 'By supplier',
        table: {
          columns: ['Supplier', 'Documents', 'Total', 'VAT'],
          rows: bySupplier.slice(0, 200).map((r) => [r.supplier, String(r.count), money(r.total), money(r.vat)]),
          alignRight: [1, 2, 3],
        },
      },
    ];
  },
};
