/**
 * Account Spaces — helpers for loading and filtering by Space.
 *
 * A Space is a named grouping of bank connections. Users can switch
 * between Spaces in the Money Hub to see only the accounts in that
 * group (e.g. "Personal" vs "Business"). Every user has exactly one
 * default Space ("Everything") that includes every connection.
 *
 * The server-side filter semantics: if a Space has an empty
 * connection_ids array, no filter is applied (everything counts).
 * Otherwise, bank_transactions / subscriptions are restricted to rows
 * whose connection_id is in the Space's list.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccountSpace {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  is_default: boolean;
  connection_ids: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Resolve a Space row for a user by ID. Returns the default Space when
 * `spaceId` is undefined. Returns null if the space doesn't exist or
 * belongs to another user (RLS-enforced).
 */
export async function getSpace(
  supabase: SupabaseClient,
  userId: string,
  spaceId?: string | null,
): Promise<AccountSpace | null> {
  if (spaceId) {
    const { data } = await supabase
      .from('account_spaces')
      .select('*')
      .eq('id', spaceId)
      .eq('user_id', userId)
      .maybeSingle();
    return (data as AccountSpace | null) ?? null;
  }
  const { data } = await supabase
    .from('account_spaces')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  return (data as AccountSpace | null) ?? null;
}

export async function listSpaces(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountSpace[]> {
  const { data } = await supabase
    .from('account_spaces')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return (data as AccountSpace[]) ?? [];
}

/**
 * Given a Space, return the list of connection IDs its filter applies
 * to — or `null` meaning "no filter, match everything". Callers can
 * gate their queries with `if (filter === null) { query = query; }
 * else { query = query.in('connection_id', filter); }`.
 */
export function spaceConnectionFilter(space: AccountSpace | null): string[] | null {
  if (!space) return null;
  if (space.connection_ids.length === 0) return null;
  return space.connection_ids;
}

/**
 * Ensure the user has a default Space. Used as a safety net — the
 * migration backfills one for every existing user, but new signups
 * after the migration need one created on first Money Hub load.
 */
export async function ensureDefaultSpace(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountSpace> {
  const existing = await getSpace(supabase, userId);
  if (existing) return existing;
  const { data } = await supabase
    .from('account_spaces')
    .insert({
      user_id: userId,
      name: 'Everything',
      emoji: '🌍',
      is_default: true,
      connection_ids: [],
      sort_order: 0,
    })
    .select('*')
    .single();
  return data as AccountSpace;
}
