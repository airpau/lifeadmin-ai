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

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);
  const since = sp.get('since'); // ISO date
  const until = sp.get('until');
  const category = sp.get('category'); // optional filter

  let q = admin()
    .from('bank_transactions')
    .select(
      'transaction_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring',
    )
    .eq('user_id', auth.userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (since) q = q.gte('timestamp', since);
  if (until) q = q.lte('timestamp', until);
  if (category) q = q.or(`user_category.eq.${category},category.eq.${category}`);

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
  }));

  return mcpJson({
    count: transactions.length,
    limit,
    filters: { since, until, category },
    transactions,
  });
}
