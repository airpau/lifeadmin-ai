/**
 * Document packs: reading and shaping document_packs rows for the routes,
 * and the plan availability shown on the Packs tab.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentEntitlements, PackBuildQuota } from '@/lib/documents/plan';
import { isPackType, type PackType } from '@/lib/documents/packs/types';
import type { PackPreview } from '@/lib/documents/packs/load';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export const PACK_COLUMNS =
  'id, pack_type, title, params, status, document_ids, missing, checklist, storage_path, size_bytes, file_count, error, generated_at, build_started_at, counted_build_at, created_at, updated_at';

export interface PackRow {
  id: string;
  pack_type: string;
  title: string;
  params: Record<string, unknown>;
  status: 'draft' | 'building' | 'ready' | 'failed';
  document_ids: string[];
  missing: unknown[];
  checklist: unknown[];
  storage_path: string | null;
  size_bytes: number | null;
  file_count: number | null;
  error: string | null;
  generated_at: string | null;
  build_started_at: string | null;
  counted_build_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A 'building' status older than this is a crashed build and may be retried. */
export const BUILD_STALE_SECONDS = 330;

export async function getOwnedPack(admin: Admin, userId: string, id: string): Promise<PackRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin
    .from('document_packs')
    .select(PACK_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as PackRow | null) ?? null;
}

/** The fields a client sees. Never includes the storage path. */
export function publicPack(row: PackRow) {
  const building = row.status === 'building' && !!row.build_started_at && Date.now() - Date.parse(row.build_started_at) < BUILD_STALE_SECONDS * 1000;
  return {
    id: row.id,
    pack_type: isPackType(row.pack_type) ? (row.pack_type as PackType) : row.pack_type,
    title: row.title,
    params: row.params,
    status: row.status === 'building' && !building ? 'failed' : row.status,
    document_ids: row.document_ids,
    document_count: row.document_ids?.length ?? 0,
    missing: row.missing,
    checklist: row.checklist,
    downloadable: row.status === 'ready' && !!row.storage_path,
    size_bytes: row.size_bytes,
    file_count: row.file_count,
    error: row.status === 'building' && !building ? 'The last build did not finish. Please build it again.' : row.error,
    generated_at: row.generated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface PackAvailability {
  canPreview: true;
  canBuild: boolean;
  buildsPerMonth: number | null;
  buildsUsed: number;
  buildsLeft: number | null;
  canShare: boolean;
  priceRiseWatch: boolean;
  warrantyReminders: boolean;
  documentDigest: boolean;
}

/** Pure: what the user's plan allows for packs and the stage three features. */
export function packAvailability(ent: DocumentEntitlements, quota: PackBuildQuota): PackAvailability {
  return {
    canPreview: true,
    canBuild: quota.remaining === null || quota.remaining > 0,
    buildsPerMonth: ent.packBuildsPerMonth,
    buildsUsed: quota.used,
    buildsLeft: quota.remaining,
    canShare: ent.packSharing,
    priceRiseWatch: ent.priceRiseWatch,
    warrantyReminders: ent.warrantyReminders,
    documentDigest: ent.documentDigest,
  };
}

/** The user's choices stored on a pack (params minus the manual lists). */
export function splitParams(params: Record<string, unknown> | null | undefined): { options: Record<string, unknown>; manual: { added_ids: unknown; removed_ids: unknown } } {
  const { added_ids, removed_ids, ...options } = params ?? {};
  return { options, manual: { added_ids, removed_ids } };
}

/** The checklist preview a client sees: no storage paths. */
export function previewBody(p: PackPreview) {
  return {
    title: p.title,
    description: p.description,
    checklist: p.checklist,
    missing: p.missing,
    complete: p.missing.every((m) => !m.required),
    documents: p.selection.selected.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      supplier: d.supplier,
      amount: d.amount,
      currency: d.currency,
      doc_date: d.doc_date,
      email_date: d.email_date,
      filename: d.filename,
      summary: d.summary,
      size_bytes: d.size_bytes,
    })),
    excluded: p.selection.excluded,
    truncated: p.selection.truncated,
    bytes: p.bytes,
    timeline: p.timeline,
    manual: p.manual,
  };
}

/** A user supplied pack title: one line, at most 120 characters. */
export function cleanTitle(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return t || fallback;
}
