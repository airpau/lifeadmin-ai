// src/app/api/mcp/search/route.ts
// MCP: free-text search across a user's transactions.
// Matches against description + merchant_name. Used when Claude is asked
// things like "did I pay Amazon last month?" — it's cheaper to hit this
// than to pull a big transactions page and filter locally.

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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const query = (sp.get('q') ?? '').trim();
  const limit = Math.min(Number(sp.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);
  const since = sp.get('since');
  const until = sp.get('until');

  if (!query) {
    return mcpJson({ error: 'Missing ?q= search query' }, { status: 400 });
  }
  // Escape PostgREST wildcard chars and comma (which would split the or() list)
  const safe = query.replace(/[,*%()]/g, '').slice(0, 80);
  if (!safe) {
    return mcpJson({ error: 'Query reduced to empty after sanitisation' }, { status: 400 });
  }

  let q = admin()
    .from('bank_transactions')
    .select(
      'transaction_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring',
    )
    .eq('user_id', auth.userId)
    .or(`description.ilike.%${safe}%,merchant_name.ilike.%${safe}%`)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (since) q = q.gte('timestamp', since);
  if (until) q = q.lte('timestamp', until);

  const { data, error } = await q;
  if (error) return mcpJson({ error: error.message }, { status: 500 });

  const matches = (data ?? []).map((t) => ({
    date: new Date(t.timestamp).toISOString().split('T')[0],
    description: t.description ?? '',
    merchant: t.merchant_name ?? '',
    amount_gbp: Number(t.amount ?? 0),
    category: t.user_category ?? t.category ?? '',
    type: t.income_type ?? (Number(t.amount) > 0 ? 'Income' : 'Expense'),
    recurring: !!t.is_recurring,
    transaction_id: t.transaction_id,
  }));

  const totalGbp = matches.reduce((s, r) => s + r.amount_gbp, 0);

  return mcpJson({
    query: safe,
    count: matches.length,
    total_amount_gbp: parseFloat(totalGbp.toFixed(2)),
    filters: { since, until, limit },
    matches,
  });
}
