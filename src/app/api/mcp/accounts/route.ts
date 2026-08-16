// src/app/api/mcp/accounts/route.ts
// MCP: list the user's connected bank accounts — institution, account type,
// masked identifier and latest known balance.
// Read-only. Auth via Bearer token (@paybacker/mcp).
//
// NOTE ON SHAPE: Paybacker has no per-account table. Accounts live inside
// `bank_connections` as the parallel arrays `account_ids` /
// `account_display_names`, and balances are stored at connection level
// (`current_balance` / `available_balance`). This route flattens that into a
// per-account list so callers get a stable, account-shaped schema. Balance
// fields are connection-level and are repeated on each account of that
// connection — `balance_scope` tells the caller which it is.

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Never return a raw provider account id — expose the last 4 chars only. */
function maskAccountId(id: string): string {
  if (!id) return '';
  const tail = id.slice(-4);
  return `••••${tail}`;
}

/** hsbcbusiness_uk → "Hsbcbusiness UK" is wrong; keep the raw slug too. */
function prettyInstitution(slug: string | null): string {
  if (!slug) return 'Unknown bank';
  return slug
    .replace(/_uk$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Paybacker doesn't persist an account-type field. Yapily display names carry
 * the signal (e.g. "CREDIT_CARD"), so infer conservatively and fall back to
 * 'unknown' rather than guessing.
 */
function inferAccountType(displayName: string | null, isBusiness: boolean): string {
  const n = (displayName ?? '').toUpperCase();
  if (n.includes('CREDIT_CARD') || n.includes('CREDIT CARD')) return 'credit_card';
  if (n.includes('SAVING')) return 'savings';
  if (n.includes('ISA')) return 'isa';
  if (n.includes('LOAN') || n.includes('MORTGAGE')) return 'loan';
  if (n.includes('CURRENT') || n.includes('CHECKING')) return 'current';
  return isBusiness ? 'business_current' : 'unknown';
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const includeInactive =
    sp.get('include_inactive') === 'true' || sp.get('include_inactive') === '1';

  const a = admin();
  let q = a
    .from('bank_connections')
    .select(
      'id, bank_name, institution_id, provider, status, consent_status, account_ids, account_display_names, current_balance, available_balance, balance_updated_at, is_business, sync_enabled, last_synced_at, connected_at, archived_at, deleted_at',
    )
    .eq('user_id', auth.userId)
    .is('deleted_at', null)
    .order('connected_at', { ascending: false });

  if (!includeInactive) q = q.is('archived_at', null);

  const { data, error } = await q;
  if (error) {
    return mcpJson({ error: error.message }, { status: 500 });
  }

  const connections = data ?? [];

  // Flatten connections → accounts.
  const accounts = connections.flatMap((c) => {
    const ids: string[] = Array.isArray(c.account_ids) ? c.account_ids : [];
    const names: string[] = Array.isArray(c.account_display_names)
      ? c.account_display_names
      : [];
    return ids.map((accountId, i) => ({
      account_id: accountId,
      account_ref: maskAccountId(accountId),
      display_name: names[i] ?? null,
      account_type: inferAccountType(names[i] ?? null, !!c.is_business),
      institution: prettyInstitution(c.bank_name ?? c.institution_id),
      institution_id: c.institution_id ?? c.bank_name ?? null,
      provider: c.provider ?? null,
      is_business: !!c.is_business,
      connection_id: c.id,
      connection_status: c.status ?? null,
      consent_status: c.consent_status ?? null,
      sync_enabled: !!c.sync_enabled,
      last_synced_at: c.last_synced_at ?? null,
      connected_at: c.connected_at ?? null,
      archived: !!c.archived_at,
      // Balances are stored per connection, not per account.
      balance_scope: 'connection' as const,
      current_balance_gbp:
        c.current_balance == null ? null : Number(c.current_balance),
      available_balance_gbp:
        c.available_balance == null ? null : Number(c.available_balance),
      balance_updated_at: c.balance_updated_at ?? null,
    }));
  });

  // Per-account activity — one bounded query per account (accounts are few).
  const activity = await Promise.all(
    accounts.map(async (acc) => {
      const { data: rows, count } = await a
        .from('bank_transactions')
        .select('timestamp', { count: 'exact' })
        .eq('user_id', auth.userId)
        .eq('account_id', acc.account_id)
        .is('deleted_at', null)
        .order('timestamp', { ascending: false })
        .limit(1);
      return {
        transaction_count: count ?? 0,
        last_transaction_at: rows?.[0]?.timestamp ?? null,
      };
    }),
  );

  const enriched = accounts.map((acc, i) => {
    // Drop the raw provider id from the response — masked ref only.
    const { account_id: _rawId, ...safe } = acc;
    return { ...safe, ...activity[i] };
  });

  return mcpJson({
    count: enriched.length,
    connections: connections.length,
    filters: { include_inactive: includeInactive },
    note:
      'Balances are recorded per bank connection, not per account (balance_scope="connection"). ' +
      'null balance means the provider has not returned one since the last sync.',
    accounts: enriched,
  });
}
