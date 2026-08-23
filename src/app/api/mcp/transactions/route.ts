// src/app/api/mcp/transactions/route.ts
// MCP: list a user's bank transactions in the canonical Google-Sheets schema.
// Read-only. Auth via Bearer token (@paybacker/mcp).

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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/** Never return a raw provider account id — expose the last 4 chars only.
 *  Must stay identical to maskAccountId() in /api/mcp/accounts, since
 *  callers join the two responses on account_ref. */
function maskAccountId(id: string): string {
  if (!id) return '';
  return `••••${id.slice(-4)}`;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);
  const since = sp.get('since'); // ISO date
  const until = sp.get('until');
  const category = sp.get('category'); // optional filter
  // Restrict to one account, given as the masked ref from /api/mcp/accounts.
  // Without this a caller cannot separate a trading current account from
  // the loans and credit card sitting on the same connection, and cash-flow
  // totals silently mix debt repayments in with operating spend.
  const accountRef = sp.get('account_ref');

  let q = admin()
    .from('bank_transactions')
    .select(
      'transaction_id, stable_tx_hash, account_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring',
    )
    .eq('user_id', auth.userId)
    // Soft-deleted rows (bank-disconnect modal) must not reappear here —
    // /api/mcp/accounts already filters them, this didn't.
    .is('deleted_at', null)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (since) q = q.gte('timestamp', since);
  if (until) q = q.lte('timestamp', until);
  if (category) q = q.or(`user_category.eq.${category},category.eq.${category}`);

  // Resolve a masked account_ref back to the raw provider ids it stands
  // for. The mask is the last 4 characters, so in principle two accounts
  // could collide; we match ALL of them rather than picking one, and tell
  // the caller how many matched so an ambiguous filter is visible rather
  // than silently narrowing their data.
  let matchedAccountIds: string[] | null = null;
  if (accountRef) {
    const tail = accountRef.replace(/[^A-Za-z0-9_-]/g, '').slice(-4);

    const { data: conns } = await admin()
      .from('bank_connections')
      .select('account_ids')
      .eq('user_id', auth.userId)
      .is('deleted_at', null);

    matchedAccountIds = (conns ?? [])
      .flatMap((c) => (Array.isArray(c.account_ids) ? (c.account_ids as string[]) : []))
      .filter((id) => id.slice(-4) === tail);

    if (matchedAccountIds.length === 0) {
      return mcpJson({
        count: 0,
        limit,
        filters: { since, until, category, account_ref: accountRef },
        note: `No account matches account_ref "${accountRef}". Call /api/mcp/accounts to list valid refs.`,
        transactions: [],
      });
    }

    q = q.in('account_id', matchedAccountIds);
  }

  const { data, error } = await q;
  if (error) {
    return mcpJson({ error: error.message }, { status: 500 });
  }

  // Shape matches the CSV/xlsx export so Claude sees a consistent schema.
  const transactions = (data ?? []).map((t) => ({
    date: new Date(t.timestamp).toISOString().split('T')[0], // YYYY-MM-DD
    description: t.description ?? '',
    merchant: t.merchant_name ?? '',
    amount_gbp: Number(t.amount ?? 0),
    category: t.user_category ?? t.category ?? '',
    type: t.income_type ?? (Number(t.amount) > 0 ? 'Income' : 'Expense'),
    recurring: !!t.is_recurring,
    transaction_id: t.transaction_id,
    // Yapily reissues `transaction_id` across calls (the reason the
    // 2026-04-28 upsert rewrite stopped keying on it), so it is NOT a
    // safe idempotency key for anything downstream. stable_tx_hash is
    // the key the DB-level partial UNIQUE index is built on, and is the
    // one an external mirror should dedupe against. Additive field —
    // existing consumers of this shape are unaffected.
    dedupe_key: t.stable_tx_hash ?? null,
    // Which account the line belongs to, masked the same way
    // /api/mcp/accounts masks it, so the two responses join on this.
    // Essential on a connection carrying several accounts: without it a
    // loan repayment and an operating payment are indistinguishable.
    account_ref: t.account_id ? maskAccountId(t.account_id) : null,
  }));

  return mcpJson({
    count: transactions.length,
    limit,
    filters: { since, until, category, account_ref: accountRef },
    ...(matchedAccountIds && matchedAccountIds.length > 1
      ? {
          warning: `account_ref "${accountRef}" matched ${matchedAccountIds.length} accounts; results include all of them.`,
        }
      : {}),
    transactions,
  });
}
