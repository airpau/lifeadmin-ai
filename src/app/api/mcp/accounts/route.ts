// src/app/api/mcp/accounts/route.ts
// MCP: list the user's connected bank accounts — institution, account type,
// masked identifier and latest known balance.
// Read-only. Auth via Bearer token (@paybacker/mcp).
//
// NOTE ON SHAPE: accounts live inside `bank_connections` as the parallel
// arrays `account_ids` / `account_display_names`. This route flattens that
// into a per-account list so callers get a stable, account-shaped schema.
//
// BALANCES (changed 23 Aug 2026): where `bank_account_balances` has a row
// for the account, the balance returned is that account's own, and
// `balance_scope` is 'account'. Otherwise it falls back to the
// connection-level figure repeated across every account of the connection,
// and `balance_scope` is 'connection' — the old behaviour.
//
// The distinction matters. A connection can mix a trading current account
// with loans and a credit card, in which case the connection-level number
// is a sum of cash and debt and means nothing. `balance_class` tells the
// caller whether a given account is spendable money or a liability;
// never total a mixed list without checking it.

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
 * Fallback account-type inference from the Yapily display name.
 *
 * Only used when `bank_account_balances` has no row for the account (i.e.
 * the connection has never had balance sync enabled). It is weak by
 * nature: HSBC Business returns the SAME display name for every account on
 * the connection ("JPG OPERATIONS LIMITED"), so all four accounts —
 * current, savings, two loans and a credit card — infer identically.
 *
 * Where a real Yapily accountType has been persisted, prefer it. That is
 * what normaliseStoredType() below is for.
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

/** Map a stored Yapily accountType onto this route's vocabulary. */
function normaliseStoredType(accountType: string | null): string | null {
  if (!accountType) return null;
  const t = accountType.toUpperCase();
  if (/CREDIT[_ ]?CARD|CHARGE[_ ]?CARD/.test(t)) return 'credit_card';
  if (/MORTGAGE/.test(t)) return 'mortgage';
  if (/\bLOAN\b|LENDING/.test(t)) return 'loan';
  if (/\bISA\b/.test(t)) return 'isa';
  if (/SAVING|DEPOSIT/.test(t)) return 'savings';
  if (/CURRENT|CHECKING|TRANSACTION/.test(t)) return 'current';
  return null;
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

  // Per-account balances, where balance sync has ever run for this user.
  // Keyed by the raw Yapily account id, which never leaves this function.
  const { data: perAccountRows } = await a
    .from('bank_account_balances')
    .select(
      'connection_id, account_id, display_name, account_type, usage_type, balance_class, currency, current_balance, available_balance, balance_updated_at',
    )
    .eq('user_id', auth.userId);

  const perAccount = new Map<string, NonNullable<typeof perAccountRows>[number]>();
  for (const row of perAccountRows ?? []) {
    perAccount.set(`${row.connection_id}::${row.account_id}`, row);
  }

  // Flatten connections → accounts.
  const accounts = connections.flatMap((c) => {
    const ids: string[] = Array.isArray(c.account_ids) ? c.account_ids : [];
    const names: string[] = Array.isArray(c.account_display_names)
      ? c.account_display_names
      : [];
    return ids.map((accountId, i) => {
      const stored = perAccount.get(`${c.id}::${accountId}`);
      const hasOwnBalance =
        !!stored && (stored.current_balance != null || stored.available_balance != null);

      return {
      account_id: accountId,
      account_ref: maskAccountId(accountId),
      display_name: names[i] ?? null,
      account_type:
        normaliseStoredType(stored?.account_type ?? null) ??
        inferAccountType(names[i] ?? null, !!c.is_business),
      // 'cash' | 'liability' | 'unknown'. Do NOT sum a mixed list without
      // filtering on this — netting a loan against a current account
      // produces a number that corresponds to nothing.
      balance_class: stored?.balance_class ?? 'unknown',
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
      // 'account' when this account has its own stored balance; otherwise
      // 'connection', meaning the figure below is the connection-level
      // roll-up repeated on every account of that connection.
      balance_scope: hasOwnBalance ? ('account' as const) : ('connection' as const),
      current_balance_gbp: hasOwnBalance
        ? stored!.current_balance == null
          ? null
          : Number(stored!.current_balance)
        : c.current_balance == null
          ? null
          : Number(c.current_balance),
      available_balance_gbp: hasOwnBalance
        ? stored!.available_balance == null
          ? null
          : Number(stored!.available_balance)
        : c.available_balance == null
          ? null
          : Number(c.available_balance),
      balance_updated_at: hasOwnBalance
        ? (stored!.balance_updated_at ?? null)
        : (c.balance_updated_at ?? null),
      };
    });
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
      'Check balance_scope per account: "account" means the balance is that account\'s own; ' +
      '"connection" means it is the connection-level cash roll-up, repeated on every account of ' +
      'that connection. Check balance_class before totalling anything — "liability" accounts ' +
      '(loans, credit cards) are debt, not money, and must not be netted against cash. ' +
      'A null balance means the provider has not returned one since the last sync.',
    accounts: enriched,
  });
}
