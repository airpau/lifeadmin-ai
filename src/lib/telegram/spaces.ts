/**
 * Telegram-side helpers for Account Spaces.
 *
 * The bot keeps an "active Space" per chat (telegram_sessions.active_space_id)
 * that mirrors the filter a user has picked on the Money Hub dashboard.
 * When that column is NULL, we fall back to the user's own default Space
 * (profiles.preferred_space_id or the row flagged is_default in
 * account_spaces) so the bot's answers match the dashboard on first use.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AccountSpace,
  getSpace,
  listSpaces,
  spaceTransactionFilter,
} from '@/lib/spaces';

export interface BotSpaceScope {
  /** Resolved Space for the current chat, or null for users without any Spaces row. */
  space: AccountSpace | null;
  /** True when the active scope is the default "Everything" grouping. */
  isDefault: boolean;
  /**
   * Transaction-level filter to apply to bank_transactions queries, or
   * null when the scope is unrestricted. Use applyTxSpaceFilter() to
   * translate this into a PostgREST query modifier.
   */
  txFilter: ReturnType<typeof spaceTransactionFilter>;
  /** Connection IDs the space covers, or null when unrestricted. */
  connectionIds: string[] | null;
}

/**
 * Resolve the Space scope in effect for a user's Telegram session.
 * Priority: session override → user's default Space → null.
 */
export async function loadBotSpace(
  supabase: SupabaseClient,
  userId: string,
): Promise<BotSpaceScope> {
  const [{ data: session }, { data: profile }] = await Promise.all([
    supabase
      .from('telegram_sessions')
      .select('active_space_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('preferred_space_id')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  const spaceId =
    (session?.active_space_id as string | null) ??
    (profile?.preferred_space_id as string | null) ??
    null;

  const space = await getSpace(supabase, userId, spaceId);
  const txFilter = spaceTransactionFilter(space);
  const isDefault = !txFilter; // txFilter is null for "Everything"
  const connectionIds = txFilter
    ? Array.from(
        new Set<string>([
          ...txFilter.connectionIds,
          ...txFilter.accountPairs.map((p) => p.connectionId),
        ]),
      )
    : null;

  return { space, isDefault, txFilter, connectionIds };
}

/**
 * Apply the bot's active space to a PostgREST bank_transactions query.
 * No-op when the scope is unrestricted.
 *
 * Typed as `any` to dodge TS2589 — PostgREST builder types compose
 * deeply enough that a generic `Q extends {...}` constraint forces the
 * compiler past its instantiation limit. Callers handle their own
 * return types downstream.
 */
export function applyTxSpaceFilter(query: any, scope: BotSpaceScope): any {
  const f = scope.txFilter;
  if (!f) return query;
  if (f.accountPairs.length === 0) {
    return query.in('connection_id', f.connectionIds);
  }
  const parts: string[] = [];
  if (f.connectionIds.length > 0) {
    parts.push(`connection_id.in.(${f.connectionIds.join(',')})`);
  }
  for (const { connectionId, accountId } of f.accountPairs) {
    parts.push(`and(connection_id.eq.${connectionId},account_id.eq.${accountId})`);
  }
  return query.or(parts.join(','));
}

/**
 * In-memory test: does a given row belong to the active scope?
 * Used when we've already fetched everything and can't re-query.
 */
export function matchesSpace(
  row: { connection_id?: string | null; account_id?: string | null },
  scope: BotSpaceScope,
): boolean {
  const f = scope.txFilter;
  if (!f) return true;
  const connId = row.connection_id ?? '';
  const acctId = row.account_id ?? '';
  if (f.connectionIds.includes(connId)) return true;
  return f.accountPairs.some(
    (p) => p.connectionId === connId && p.accountId === acctId,
  );
}

/**
 * Fuzzy-match a user-supplied name against the user's Spaces.
 * Handles the obvious aliases ("everything"/"all"/"default") and
 * substring match on the Space name.
 */
export async function resolveSpaceByName(
  supabase: SupabaseClient,
  userId: string,
  query: string,
): Promise<AccountSpace | null | 'AMBIGUOUS'> {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const spaces = await listSpaces(supabase, userId);
  if (spaces.length === 0) return null;

  // "everything" / "all" / "default" → return the default Space
  if (['everything', 'all', 'default', 'any', 'clear', 'reset'].includes(needle)) {
    return spaces.find((s) => s.is_default) ?? spaces[0];
  }

  const exact = spaces.find((s) => s.name.toLowerCase() === needle);
  if (exact) return exact;

  const contains = spaces.filter((s) => s.name.toLowerCase().includes(needle));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) return 'AMBIGUOUS';
  return null;
}

/**
 * Persist the active_space_id on the user's current Telegram session.
 * Pass null to clear the override and fall back to the user's default.
 */
export async function setBotActiveSpace(
  supabase: SupabaseClient,
  userId: string,
  spaceId: string | null,
): Promise<void> {
  await supabase
    .from('telegram_sessions')
    .update({ active_space_id: spaceId })
    .eq('user_id', userId)
    .eq('is_active', true);
}
