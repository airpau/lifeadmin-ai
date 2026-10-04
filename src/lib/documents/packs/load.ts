/**
 * Document packs: everything that reads the database before the pure
 * engine runs. Candidate documents, the documents the user added by
 * hand, and (dispute evidence) the dispute and its correspondence.
 *
 * Read only. Nothing here writes to disputes or correspondence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENT_LIST_COLUMNS, DOCUMENT_LIST_COLUMNS_STAGE2, isMissingColumnError, withWarrantyDefaults } from '@/lib/documents/types';
import { disputeAttachmentPlan } from '@/lib/documents/packs/common';
import { addDays, londonToday } from '@/lib/documents/dates';
import { buildEvidencePack } from '@/lib/escalation-pack/build';
import {
  buildTimeline,
  evaluateChecklist,
  missingItems,
  parseManualChoices,
  resolveSelection,
  selectionBytes,
  type SelectionResult,
} from '@/lib/documents/packs/engine';
import type {
  AnyPackDefinition,
  CandidateQuery,
  ChecklistResult,
  DisputeContext,
  DisputeCorrespondence,
  ManualChoices,
  PackContext,
  PackDocument,
  TimelineEntry,
} from '@/lib/documents/packs/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

const PACK_DOC_COLUMNS = `${DOCUMENT_LIST_COLUMNS}, storage_path`;
const PACK_DOC_COLUMNS_STAGE2 = `${DOCUMENT_LIST_COLUMNS_STAGE2}, storage_path`;

/** Run a documents read; retry with the stage two columns when the warranty columns are missing. */
async function readDocs(run: (columns: string) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<PackDocument[]> {
  let { data, error } = await run(PACK_DOC_COLUMNS);
  if (isMissingColumnError(error)) {
    ({ data, error } = await run(PACK_DOC_COLUMNS_STAGE2));
    if (error) throw new Error(`Could not load documents: ${error.message}`);
    return withWarrantyDefaults((data as PackDocument[] | null) ?? []) as PackDocument[];
  }
  if (error) throw new Error(`Could not load documents: ${error.message}`);
  return (data as PackDocument[] | null) ?? [];
}
/** Most candidates one pack looks at. */
const MAX_CANDIDATES = 3000;
const PAGE = 1000;

/** Documents matching a definition's candidate query. Active only, the user's own. */
export async function loadCandidates(admin: Admin, userId: string, q: CandidateQuery): Promise<PackDocument[]> {
  if (q.ids && q.types === null && q.from === null && q.to === null) {
    return loadDocsByIds(admin, userId, q.ids);
  }
  const out: PackDocument[] = [];
  for (let offset = 0; offset < MAX_CANDIDATES; offset += PAGE) {
    const rows = await readDocs((columns) => {
      let query = admin.from('documents').select(columns).eq('user_id', userId).eq('status', 'active');
      if (q.types && q.types.length) query = query.in('doc_type', q.types);
      if (q.from || q.to) {
        // The document's own date, else the email date, else when it was
        // filed: the same fallback as the register, so an undated receipt
        // that arrived in the tax year is not missed. Email and filing
        // times are read a day wide either side and the definition then
        // applies the exact UK (Europe/London) date.
        const from = q.from ?? '1990-01-01';
        const to = q.to ?? '2100-12-31';
        const fromTs = `${addDays(from, -1)}T00:00:00Z`;
        const toNext = `${addDays(to, 2)}T00:00:00Z`;
        // Timestamps are quoted: they contain ':', which PostgREST treats
        // as reserved inside or().
        query = query.or(
          [
            `and(doc_date.gte.${from},doc_date.lte.${to})`,
            `and(doc_date.is.null,email_date.gte."${fromTs}",email_date.lt."${toNext}")`,
            `and(doc_date.is.null,email_date.is.null,created_at.gte."${fromTs}",created_at.lt."${toNext}")`,
          ].join(','),
        );
      }
      return query.order('created_at', { ascending: true }).range(offset, offset + PAGE - 1);
    });
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  if (q.ids && q.ids.length) {
    const have = new Set(out.map((d) => d.id));
    out.push(...(await loadDocsByIds(admin, userId, q.ids.filter((id) => !have.has(id)))));
  }
  return out;
}

/** The user's own active documents with these ids (others are ignored). */
export async function loadDocsByIds(admin: Admin, userId: string, ids: string[]): Promise<PackDocument[]> {
  const clean = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (clean.length === 0) return [];
  const out: PackDocument[] = [];
  for (let i = 0; i < clean.length; i += 200) {
    const chunk = clean.slice(i, i + 200);
    out.push(...(await readDocs((columns) => admin.from('documents').select(columns).eq('user_id', userId).eq('status', 'active').in('id', chunk))));
  }
  return out;
}

function attachmentList(v: unknown): DisputeCorrespondence['attachments'] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as { url?: unknown }).url === 'string')
    .slice(0, 20)
    .map((a) => ({
      url: String(a.url),
      filename: typeof a.filename === 'string' ? a.filename : null,
      type: typeof a.type === 'string' ? a.type : null,
      size: typeof a.size === 'number' ? a.size : null,
    }));
}

/**
 * One dispute and its correspondence, for the user. Correspondence is
 * read through the Ombudsman escalation pack's own helper, so exhibits
 * are numbered the same way in both. Returns null when the dispute is
 * not the user's.
 */
export async function loadDisputeContext(admin: Admin, userId: string, disputeId: string): Promise<DisputeContext | null> {
  const { data: d } = await admin.from('disputes').select('*').eq('id', disputeId).eq('user_id', userId).maybeSingle();
  if (!d) return null;
  const evidence = await buildEvidencePack(admin, disputeId, userId);
  const { data: rows } = await admin
    .from('correspondence')
    .select('id, attachments, entry_date, created_at')
    .eq('dispute_id', disputeId)
    .eq('user_id', userId)
    .order('entry_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(60);
  const attachments = ((rows ?? []) as Array<{ attachments: unknown }>).map((r) => attachmentList(r.attachments));
  const row = d as Record<string, unknown>;
  return {
    id: String(row.id),
    provider_name: (row.provider_name as string | null) ?? null,
    merchant_normalised: (row.merchant_normalised as string | null) ?? null,
    issue_type: (row.issue_type as string | null) ?? null,
    issue_summary: (row.issue_summary as string | null) ?? null,
    disputed_amount: row.disputed_amount !== null && row.disputed_amount !== undefined ? Number(row.disputed_amount) : null,
    status: (row.status as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    // Both queries use the same order and limit, so position i matches.
    correspondence: evidence.map((e, i) => ({
      id: (rows?.[i] as { id?: string } | undefined)?.id ?? String(e.seq),
      seq: e.seq,
      entry_type: e.entry_type,
      label: e.label,
      title: e.title,
      dated: e.dated,
      summary: e.summary,
      content: e.content,
      attachments: attachments[i] ?? [],
    })),
  };
}

export interface PackPreview<P = unknown> {
  params: P;
  manual: ManualChoices;
  ctx: PackContext<P>;
  selection: SelectionResult;
  checklist: ChecklistResult[];
  missing: ReturnType<typeof missingItems>;
  timeline: TimelineEntry[];
  bytes: number;
  title: string;
  description: string;
}

export type PreviewOutcome<P = unknown> = { ok: true; preview: PackPreview<P> } | { ok: false; status: number; error: string };

/**
 * Validate the options, load what the pack needs and run the engine.
 * No build, no writes: this is the checklist preview available on every
 * plan, and the first step of a build.
 */
export async function previewPack(
  admin: Admin,
  userId: string,
  def: AnyPackDefinition,
  rawParams: unknown,
  rawManual: unknown,
  today: string = londonToday(),
): Promise<PreviewOutcome> {
  const parsed = def.parseParams(rawParams, today);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const params = parsed.params;
  const manual = parseManualChoices(rawManual);

  const ctx: PackContext<unknown> = { params, today, dispute: null };
  if (def.type === 'dispute_evidence') {
    const dispute = await loadDisputeContext(admin, userId, (params as { dispute_id: string }).dispute_id);
    if (!dispute) return { ok: false, status: 404, error: 'That dispute was not found.' };
    ctx.dispute = dispute;
  }

  const candidates = await loadCandidates(admin, userId, def.candidateQuery(params, today));
  const added = await loadDocsByIds(admin, userId, manual.added_ids);
  const selection = resolveSelection(def, candidates, added, manual, ctx);
  const checklist = evaluateChecklist(def, selection.selected, ctx);
  // Correspondence attachments go in too (never ones that look like ID),
  // and count towards the size estimate.
  const attachments = disputeAttachmentPlan(ctx.dispute, userId);
  selection.excluded.push(...attachments.excluded);
  const attachmentCount = attachments.included.length;
  return {
    ok: true,
    preview: {
      params,
      manual,
      ctx,
      selection,
      checklist,
      missing: missingItems(checklist),
      timeline: def.timeline ? buildTimeline(ctx, selection.selected, selection.selected.length + attachmentCount) : [],
      bytes: selectionBytes(selection.selected) + attachments.bytes,
      title: def.defaultTitle(params, ctx),
      description: def.describeParams(params, ctx),
    },
  };
}
