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
  /** Per-account refs in `"connectionId:providerAccountId"` format.
   *  Use these when a single connection contains both personal
   *  and business accounts and the user wants them in separate
   *  Spaces. Matches are OR-combined with `connection_ids`. */
  account_refs: string[];
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
 * to — or `null` meaning "no filter, match everything". When a Space
 * has account_refs but no connection_ids, returns the distinct
 * connection IDs implied by those refs so the bank_connections query
 * can be narrowed too.
 */
export function spaceConnectionFilter(space: AccountSpace | null): string[] | null {
  if (!space) return null;
  const refs = space.account_refs ?? [];
  const conns = space.connection_ids ?? [];
  if (conns.length === 0 && refs.length === 0) return null;
  const set = new Set<string>(conns);
  for (const ref of refs) {
    const connId = ref.split(':')[0];
    if (connId) set.add(connId);
  }
  return Array.from(set);
}

/**
 * Richer filter for bank_transactions. Returns either null (match all)
 * or a structured filter that callers can translate into a query:
 *
 *   - `connectionIds` = "all accounts in these connections"
 *   - `accountPairs`  = "only this specific account on this connection"
 *
 * At query time, the two are OR-combined. Using this over the simpler
 * spaceConnectionFilter ensures that a ref like "connA:acc1" doesn't
 * accidentally pull in acc2 from connA.
 */
export function spaceTransactionFilter(space: AccountSpace | null):
  | null
  | { connectionIds: string[]; accountPairs: Array<{ connectionId: string; accountId: string }> } {
  if (!space) return null;
  const refs = space.account_refs ?? [];
  const conns = new Set<string>(space.connection_ids ?? []);
  if (conns.size === 0 && refs.length === 0) return null;
  const accountPairs: Array<{ connectionId: string; accountId: string }> = [];
  for (const ref of refs) {
    const [connId, accountId] = ref.split(':');
    if (!connId || !accountId) continue;
    // If the whole connection is already included, skip the narrower ref.
    if (conns.has(connId)) continue;
    accountPairs.push({ connectionId: connId, accountId });
  }
  return { connectionIds: Array.from(conns), accountPairs };
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
