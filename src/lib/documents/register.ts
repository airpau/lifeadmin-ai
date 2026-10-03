/**
 * Accountant register: CSV of a user's documents. Pure.
 *
 * Columns: Date, Type, Supplier, Description, Amount, VAT, Due or expiry,
 * File link. UTF-8 with a byte order mark so Excel shows £ correctly.
 * Cells that start with = + - @ (or a tab or carriage return) are
 * prefixed with an apostrophe so a supplier name can never run as a
 * spreadsheet formula (CSV injection).
 */

import { DOC_TYPE_SINGULAR, type DocType } from '@/lib/documents/types';

export interface RegisterDoc {
  id: string;
  doc_type: DocType;
  supplier: string | null;
  summary: string | null;
  filename: string;
  amount: number | null;
  currency: string | null;
  vat_amount: number | null;
  doc_date: string | null;
  due_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  email_date?: string | null;
  created_at: string;
}

export const REGISTER_HEADERS = ['Date', 'Type', 'Supplier', 'Description', 'Amount', 'VAT', 'Due or expiry', 'File link'];

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function moneyCell(n: number | null, currency: string | null): string {
  if (n === null || n === undefined) return '';
  const fixed = Number(n).toFixed(2);
  return currency && currency !== 'GBP' ? `${fixed} ${currency}` : fixed;
}

/** The date shown in the register: the document's own date, else when it arrived. */
export function registerDate(d: RegisterDoc): string {
  return d.doc_date || (d.email_date ? d.email_date.slice(0, 10) : '') || d.created_at.slice(0, 10);
}

/** The nearest of due, renewal and expiry dates, labelled. */
export function dueOrExpiry(d: RegisterDoc): string {
  const parts: string[] = [];
  if (d.due_date) parts.push(`Due ${d.due_date}`);
  if (d.renewal_date) parts.push(`Renews ${d.renewal_date}`);
  if (d.expiry_date) parts.push(`Expires ${d.expiry_date}`);
  return parts.join('; ');
}

export function buildRegisterCsv(docs: RegisterDoc[], linkFor: (d: RegisterDoc) => string): string {
  const rows = [REGISTER_HEADERS.map(csvCell).join(',')];
  for (const d of docs) {
    rows.push(
      [
        registerDate(d),
        DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document',
        d.supplier ?? '',
        d.summary || d.filename,
        moneyCell(d.amount, d.currency),
        moneyCell(d.vat_amount, d.currency),
        dueOrExpiry(d),
        linkFor(d),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}
