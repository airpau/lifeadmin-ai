/**
 * Listing and search for the documents vault, shared by the dashboard
 * API and the Claude (MCP) endpoints so both see the same results.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENT_LIST_COLUMNS, isDocType, type DocType, type DocumentRow } from '@/lib/documents/types';
import { validIsoDate } from '@/lib/documents/classify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export interface DocumentFilters {
  type?: DocType | null;
  /** Inclusive YYYY-MM-DD bounds on the document's own date. */
  from?: string | null;
  to?: string | null;
  supplier?: string | null;
  /** Free text across supplier, filename, summary and subject. */
  q?: string | null;
  limit?: number;
  offset?: number;
}

/** Strip characters that have meaning in a PostgREST or() filter. */
export function cleanSearchText(v: string | null | undefined, max = 80): string {
  return (v || '').replace(/[,()*%\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function filtersFromSearchParams(sp: URLSearchParams): DocumentFilters {
  const type = sp.get('type');
  const limit = Number(sp.get('limit') || 50);
  const offset = Number(sp.get('offset') || 0);
  return {
    type: isDocType(type) ? type : null,
    from: validIsoDate(sp.get('from')),
    to: validIsoDate(sp.get('to')),
    supplier: cleanSearchText(sp.get('supplier')) || null,
    q: cleanSearchText(sp.get('q')) || null,
    limit: Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.floor(limit))) : 50,
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
  };
}

export async function listDocuments(
  admin: Admin,
  userId: string,
  f: DocumentFilters,
): Promise<{ rows: DocumentRow[]; total: number; error: string | null }> {
  let query = admin
    .from('documents')
    .select(DOCUMENT_LIST_COLUMNS, { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'active');
  if (f.type) query = query.eq('doc_type', f.type);
  if (f.from) query = query.gte('doc_date', f.from);
  if (f.to) query = query.lte('doc_date', f.to);
  if (f.supplier) query = query.ilike('supplier', `%${f.supplier}%`);
  if (f.q) {
    const like = `%${f.q}%`;
    query = query.or(`supplier.ilike.${like},filename.ilike.${like},summary.ilike.${like},email_subject.ilike.${like}`);
  }
  const limit = f.limit ?? 50;
  const offset = f.offset ?? 0;
  const { data, count, error } = await query
    .order('doc_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  return { rows: (data as unknown as DocumentRow[] | null) ?? [], total: count ?? 0, error: error?.message ?? null };
}

/** One active document owned by the user, with its storage path. */
export async function getOwnedDocument(
  admin: Admin,
  userId: string,
  id: string,
): Promise<(DocumentRow & { storage_path: string | null }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin
    .from('documents')
    .select(`${DOCUMENT_LIST_COLUMNS}, storage_path`)
    .eq('user_id', userId)
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle();
  return (data as unknown as (DocumentRow & { storage_path: string | null }) | null) ?? null;
}
