/**
 * Document packs engine. Pure: no database, no storage, no network.
 *
 * Given a pack definition, the candidate documents the loader pulled from
 * the vault and the user's own choices, it works out:
 *
 *  - the selection: the definition's automatic picks, plus documents the
 *    user added, minus documents the user removed, never including an
 *    identity document, in bundle order
 *  - the checklist: each item found or missing, with which documents
 *    count towards it
 *  - the timeline (dispute evidence only): correspondence and documents
 *    in date order
 *
 * The loader (load.ts) and the builder (build.ts) do the I/O around it.
 */

import { byDateAsc, looksLikeIdDocument, packDate, seqLabel } from '@/lib/documents/packs/common';
import type {
  AnyPackDefinition,
  ChecklistResult,
  ManualChoices,
  PackContext,
  PackDocument,
  TimelineEntry,
} from '@/lib/documents/packs/types';
import { DOC_TYPE_SINGULAR } from '@/lib/documents/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Most documents one pack may hold. */
export const MAX_PACK_DOCUMENTS = 300;
/** Most manual additions or removals stored on one pack. */
export const MAX_MANUAL_CHOICES = 300;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** A clean, de-duplicated list of ids from untrusted input. */
export function uuidList(v: unknown, max = MAX_MANUAL_CHOICES): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!isUuid(x)) continue;
    const id = x.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function parseManualChoices(raw: unknown): ManualChoices {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const added = uuidList(o.added_ids);
  const removed = uuidList(o.removed_ids);
  // An id cannot be both: the later instruction (remove) wins.
  const removedSet = new Set(removed);
  return { added_ids: added.filter((id) => !removedSet.has(id)), removed_ids: removed };
}

export interface SelectionResult {
  selected: PackDocument[];
  /** Documents left out because they look like ID, with the reason. */
  excluded: Array<{ id: string; reason: string }>;
  /** True when the selection was cut to MAX_PACK_DOCUMENTS. */
  truncated: boolean;
}

/**
 * Automatic picks, plus the user's additions, minus the user's removals,
 * minus identity documents, in bundle order.
 *
 * `added` holds the documents the user added by hand (already checked to
 * belong to the user and to be active by the loader).
 */
export function resolveSelection(
  def: AnyPackDefinition,
  candidates: PackDocument[],
  added: PackDocument[],
  manual: ManualChoices,
  ctx: PackContext<unknown>,
): SelectionResult {
  const removed = new Set(manual.removed_ids.map((x) => x.toLowerCase()));
  const byId = new Map<string, PackDocument>();
  for (const d of def.autoSelect(candidates, ctx)) byId.set(d.id.toLowerCase(), d);
  for (const d of added) byId.set(d.id.toLowerCase(), d);

  const excluded: Array<{ id: string; reason: string }> = [];
  const kept: PackDocument[] = [];
  for (const [id, d] of byId) {
    if (removed.has(id)) continue;
    if (d.status && d.status !== 'active') continue;
    if (looksLikeIdDocument(d)) {
      excluded.push({ id: d.id, reason: 'Identity documents are never put in a pack.' });
      continue;
    }
    kept.push(d);
  }
  const sort = def.sort ? (a: PackDocument, b: PackDocument) => def.sort!(a, b, ctx) : byDateAsc;
  kept.sort(sort);
  const truncated = kept.length > MAX_PACK_DOCUMENTS;
  return { selected: truncated ? kept.slice(0, MAX_PACK_DOCUMENTS) : kept, excluded, truncated };
}

/** Found or missing for every checklist item of a definition. */
export function evaluateChecklist(def: AnyPackDefinition, selected: PackDocument[], ctx: PackContext<unknown>): ChecklistResult[] {
  return def.checklist.map((item) => {
    if (item.fromContext) {
      const r = item.fromContext(ctx);
      return {
        key: item.key,
        label: item.label,
        hint: item.hint,
        required: item.required,
        found: r.found,
        count: r.count,
        detail: r.detail ?? null,
        document_ids: [],
      };
    }
    const matching = item.match ? selected.filter((d) => item.match!(d, ctx)) : [];
    const assessed = item.assess ? item.assess(matching, ctx) : { found: matching.length > 0, detail: null };
    return {
      key: item.key,
      label: item.label,
      hint: item.hint,
      required: item.required,
      found: assessed.found,
      count: matching.length,
      detail: assessed.detail ?? null,
      document_ids: matching.map((d) => d.id),
    };
  });
}

/** The items not found, required ones first. Stored as document_packs.missing. */
export function missingItems(checklist: ChecklistResult[]): Array<{ key: string; label: string; hint: string; required: boolean; detail: string | null }> {
  return checklist
    .filter((c) => !c.found)
    .sort((a, b) => Number(b.required) - Number(a.required))
    .map((c) => ({ key: c.key, label: c.label, hint: c.hint, required: c.required, detail: c.detail }));
}

/** True when every required item was found. */
export function checklistComplete(checklist: ChecklistResult[]): boolean {
  return checklist.every((c) => c.found || !c.required);
}

/**
 * Dispute timeline: correspondence (letters sent, replies, notes) and
 * the bundled documents, oldest first. References point at the file
 * numbers in the ZIP ("File 03") and the correspondence exhibits in the
 * index ("Exhibit 2"), matching the Ombudsman escalation pack numbering.
 */
export function buildTimeline(ctx: PackContext<unknown>, selected: PackDocument[], totalFiles: number = selected.length): TimelineEntry[] {
  const entries: Array<TimelineEntry & { sortKey: string }> = [];
  for (const c of ctx.dispute?.correspondence ?? []) {
    const kind: TimelineEntry['kind'] =
      c.entry_type === 'ai_letter' ? 'letter' : c.entry_type === 'user_note' || c.entry_type === 'phone_call' ? 'note' : 'reply';
    const date = c.dated ? c.dated.slice(0, 10) : null;
    entries.push({
      date,
      kind,
      title: c.title ? `${c.label}: ${c.title}` : c.label,
      detail: c.summary || (c.content ? c.content.slice(0, 240) : null),
      ref: `Exhibit ${c.seq}`,
      sortKey: `${date ?? '9999-12-31'} 0 ${String(c.seq).padStart(4, '0')}`,
    });
  }
  selected.forEach((d, i) => {
    const date = packDate(d);
    entries.push({
      date,
      kind: 'document',
      title: `${DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document'}${d.supplier ? ` from ${d.supplier}` : ''}`,
      detail: d.summary || d.filename,
      ref: `File ${seqLabel(i + 1, totalFiles)}`,
      sortKey: `${date} 1 ${String(i).padStart(4, '0')}`,
    });
  });
  entries.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return entries.map(({ sortKey: _s, ...e }) => {
    void _s;
    return e;
  });
}

/** Total size of the selected files, from the stored sizes. */
export function selectionBytes(selected: PackDocument[]): number {
  return selected.reduce((s, d) => s + Math.max(0, Number(d.size_bytes) || 0), 0);
}
