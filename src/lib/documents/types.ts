/**
 * Shared types and constants for the documents vault.
 *
 * Kept dependency free so client components, routes and the standalone
 * test scripts can all import it.
 */

export const DOC_TYPES = [
  'receipt',
  'invoice',
  'bill',
  'statement',
  'certificate',
  'policy',
  'contract',
  'letter',
  'other',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);
}

/** Human labels, also used as the Drive subfolder names. */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  receipt: 'Receipts',
  invoice: 'Invoices',
  bill: 'Bills',
  statement: 'Statements',
  certificate: 'Certificates',
  policy: 'Policies',
  contract: 'Contracts',
  letter: 'Letters',
  other: 'Other',
};

/** Singular label for one document. */
export const DOC_TYPE_SINGULAR: Record<DocType, string> = {
  receipt: 'Receipt',
  invoice: 'Invoice',
  bill: 'Bill',
  statement: 'Statement',
  certificate: 'Certificate',
  policy: 'Policy',
  contract: 'Contract',
  letter: 'Letter',
  other: 'Document',
};

export type DocumentSource = 'email' | 'drive' | 'upload';

/** Private storage bucket created by 20261003120000_documents_vault.sql. */
export const DOCUMENTS_BUCKET = 'documents';

/** Largest single file we will download, store or upload: 15 MB. */
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Columns the dashboard and APIs list. Never includes storage internals beyond the path. */
export const DOCUMENT_LIST_COLUMNS =
  'id, source, provider, filename, mime_type, size_bytes, doc_type, supplier, amount, currency, vat_amount, ' +
  'doc_date, due_date, expiry_date, renewal_date, summary, confidence, email_subject, email_from, email_date, ' +
  'drive_link, drive_filed_at, drive_error, todoist_task_id, warranty_until, warranty_note, warranty_todoist_task_id, status, created_at';

export interface DocumentRow {
  id: string;
  source: DocumentSource;
  provider: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  doc_type: DocType;
  supplier: string | null;
  amount: number | null;
  currency: string | null;
  vat_amount: number | null;
  doc_date: string | null;
  due_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  summary: string | null;
  confidence: number;
  email_subject: string | null;
  email_from: string | null;
  email_date: string | null;
  drive_link: string | null;
  drive_filed_at: string | null;
  drive_error: string | null;
  todoist_task_id: string | null;
  /** Last day of a warranty or guarantee (stage three, 20261003130000). */
  warranty_until: string | null;
  warranty_note: string | null;
  warranty_todoist_task_id: string | null;
  status: 'active' | 'deleted';
  created_at: string;
}
