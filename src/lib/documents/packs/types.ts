/**
 * Document packs: shared types. Dependency free apart from the vault's
 * own types, so pack definitions stay pure and testable.
 *
 * A pack is a bundle the user builds from their documents vault: an
 * index PDF (cover, checklist of what was found and what is missing, a
 * timeline where it helps, and every document listed with its date,
 * supplier and amount) plus the original files, zipped. See
 * docs/document-packs.md.
 */

import type { DocType, DocumentRow } from '@/lib/documents/types';

export const PACK_TYPES = ['dispute_evidence', 'lender', 'tax_year', 'insurance_claim'] as const;
export type PackType = (typeof PACK_TYPES)[number];

export function isPackType(v: unknown): v is PackType {
  return typeof v === 'string' && (PACK_TYPES as readonly string[]).includes(v);
}

/** A vault document as a pack sees it: the list row plus where the file is. */
export type PackDocument = DocumentRow & { storage_path: string | null };

/** The user's own choices on top of the automatic selection. */
export interface ManualChoices {
  added_ids: string[];
  removed_ids: string[];
}

/** One correspondence entry on a dispute (letters, replies, notes). */
export interface DisputeCorrespondence {
  id: string;
  seq: number;
  entry_type: string;
  label: string;
  title: string | null;
  dated: string | null;
  summary: string | null;
  content: string;
  attachments: Array<{ url: string; filename: string | null; type: string | null; size: number | null }>;
}

export interface DisputeContext {
  id: string;
  provider_name: string | null;
  merchant_normalised: string | null;
  issue_type: string | null;
  issue_summary: string | null;
  disputed_amount: number | null;
  status: string | null;
  created_at: string | null;
  correspondence: DisputeCorrespondence[];
}

/** Everything a definition may look at when selecting and checking. */
export interface PackContext<P> {
  params: P;
  /** Today in Europe/London, YYYY-MM-DD. */
  today: string;
  dispute?: DisputeContext | null;
}

/** What the loader should pull from the vault for this pack. */
export interface CandidateQuery {
  /** null = every type. */
  types: DocType[] | null;
  /** Inclusive YYYY-MM-DD bounds on the document date (fallback: email date). null = open. */
  from: string | null;
  to: string | null;
  /** Documents to fetch by id whatever their type or date (insurance policy, chosen receipts). */
  ids?: string[];
}

export interface ChecklistItemDef<P> {
  key: string;
  /** Consumer-facing label, e.g. "Bank statements for the last 3 months". */
  label: string;
  /** Shown when the item is missing: what to do about it. */
  hint: string;
  required: boolean;
  /** Does this selected document count towards the item? */
  match?: (doc: PackDocument, ctx: PackContext<P>) => boolean;
  /**
   * Optional rule over the matching documents (for example "a statement
   * for each of the last three months"). Default: found when at least
   * one document matches.
   */
  assess?: (matching: PackDocument[], ctx: PackContext<P>) => { found: boolean; detail?: string | null };
  /** For items met by something other than vault documents (dispute letters). */
  fromContext?: (ctx: PackContext<P>) => { found: boolean; count: number; detail?: string | null };
}

export interface ChecklistResult {
  key: string;
  label: string;
  hint: string;
  required: boolean;
  found: boolean;
  count: number;
  detail: string | null;
  document_ids: string[];
}

export interface SummarySection {
  title: string;
  lines?: string[];
  table?: { columns: string[]; rows: string[][]; alignRight?: number[] };
}

export interface TimelineEntry {
  date: string | null;
  kind: 'letter' | 'reply' | 'note' | 'document';
  title: string;
  detail: string | null;
  /** "File 03" or "Exhibit 2" style reference into the bundle. */
  ref: string | null;
}

export type ParseResult<P> = { ok: true; params: P } | { ok: false; error: string };

export interface PackDefinition<P> {
  type: PackType;
  /** Card title, consumer voice. */
  name: string;
  /** One or two sentences on what it is for. */
  blurb: string;
  /** Who it is for, shown on the cover. */
  audience: string;
  parseParams(raw: unknown, today: string): ParseResult<P>;
  defaultTitle(params: P, ctx: PackContext<P>): string;
  /** Short description of the options for the cover, e.g. "Tax year 6 April 2025 to 5 April 2026". */
  describeParams(params: P, ctx: PackContext<P>): string;
  candidateQuery(params: P, today: string): CandidateQuery;
  /** Automatic picks from the candidates (before the user's own choices). */
  autoSelect(candidates: PackDocument[], ctx: PackContext<P>): PackDocument[];
  checklist: ChecklistItemDef<P>[];
  /** Bundle order. Default: oldest first. */
  sort?: (a: PackDocument, b: PackDocument, ctx: PackContext<P>) => number;
  summary?: (selected: PackDocument[], ctx: PackContext<P>) => SummarySection[];
  /** True when the index should carry a timeline (dispute evidence). */
  timeline?: boolean;
  /** Include the CSV register in the ZIP (tax year pack). */
  includeRegisterCsv?: boolean;
  /** A short line printed under the checklist, e.g. what the pack never includes. */
  footnote?: string;
}

/** Erased form used by the registry and engine. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPackDefinition = PackDefinition<any>;
