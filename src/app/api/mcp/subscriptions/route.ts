// src/app/api/mcp/subscriptions/route.ts
// MCP: list a user's tracked subscriptions and recurring contracts.
// Read-only. Auth via Bearer token.

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

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const includeDismissed = sp.get('include_dismissed') === 'true';

  let q = admin()
    .from('subscriptions')
    .select(
      'id, provider_name, category, amount, currency, billing_cycle, next_billing_date, last_used_date, usage_frequency, status, contract_type, contract_start_date, contract_end_date, auto_renews, early_exit_fee, provider_type, current_tariff, dismissed_at, created_at',
    )
    .eq('user_id', auth.userId)
    .order('amount', { ascending: false });

  if (!includeDismissed) q = q.is('dismissed_at', null);

  const { data, error } = await q;
  if (error) return mcpJson({ error: error.message }, { status: 500 });

  const rows = data ?? [];

  // Monthly-equivalent totals so Claude can answer "what do I spend per month?"
  const monthly = rows.reduce((acc, r) => {
    const amt = Number(r.amount ?? 0);
    if (r.dismissed_at) return acc;
    if (r.billing_cycle === 'monthly') return acc + amt;
    if (r.billing_cycle === 'quarterly') return acc + amt / 3;
    if (r.billing_cycle === 'yearly') return acc + amt / 12;
    if (r.billing_cycle === 'weekly') return acc + amt * 4.333;
    return acc;
  }, 0);

  return mcpJson({
    count: rows.length,
    monthly_total_gbp: parseFloat(monthly.toFixed(2)),
    annual_total_gbp: parseFloat((monthly * 12).toFixed(2)),
    subscriptions: rows,
  });
}
