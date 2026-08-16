// src/app/api/mcp/budget/route.ts
// MCP: user's budget limits and this-month spending per category.
// Read-only. Auth via Bearer token.
//
// Mirrors the logic in /api/money-hub/budgets but without the runtime
// learning-engine categorisation — MCP callers just want a snapshot, not
// a per-transaction merchant re-classifier.

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';
import { endOfTodayLondonIso } from '@/lib/alerts/future-dated';

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

  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();

  // Column names verified against the live schema (2026-08-16).
  // `money_hub_budgets` has no `alerts_enabled` column — selecting it
  // 500'd every call to this endpoint. The real optional columns are
  // `rollover` and `payday_date`.
  const [budgetsRes, txnsRes] = await Promise.all([
    admin()
      .from('money_hub_budgets')
      .select('id, category, monthly_limit, rollover, payday_date, created_at')
      .eq('user_id', auth.userId),
    admin()
      .from('bank_transactions')
      .select('amount, category, user_category')
      .eq('user_id', auth.userId)
      .is('deleted_at', null)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth)
      // Future-dated rows are SCHEDULED payments (banks return them with
      // is_pending = false), so they haven't been spent yet and must not
      // inflate "spent so far this month".
      .lte('timestamp', endOfTodayLondonIso())
      .limit(10000),
  ]);

  if (budgetsRes.error) return mcpJson({ error: budgetsRes.error.message }, { status: 500 });

  const budgets = budgetsRes.data ?? [];
  const txns = txnsRes.data ?? [];

  // Naive per-category sum — we don't re-run the learning engine here.
  const spendByCat: Record<string, number> = {};
  for (const t of txns) {
    const cat = (t.user_category || t.category || 'other').toLowerCase();
    spendByCat[cat] = (spendByCat[cat] ?? 0) + Math.abs(Number(t.amount ?? 0));
  }

  const enriched = budgets.map((b) => {
    const cat = (b.category || '').toLowerCase();
    const spent = spendByCat[cat] ?? 0;
    const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
    return {
      id: b.id,
      category: b.category,
      monthly_limit_gbp: Number(b.monthly_limit ?? 0),
      spent_gbp: parseFloat(spent.toFixed(2)),
      remaining_gbp: parseFloat((Number(b.monthly_limit ?? 0) - spent).toFixed(2)),
      percentage_used: parseFloat(pct.toFixed(1)),
      status: pct > 100 ? 'over_budget' : pct > 80 ? 'warning' : 'on_track',
      rollover: !!b.rollover,
      payday_date: b.payday_date ?? null,
    };
  });

  const totalLimit = enriched.reduce((s, b) => s + b.monthly_limit_gbp, 0);
  const totalSpent = enriched.reduce((s, b) => s + b.spent_gbp, 0);

  return mcpJson({
    month_start: startOfMonth.split('T')[0],
    total_limit_gbp: parseFloat(totalLimit.toFixed(2)),
    total_spent_gbp: parseFloat(totalSpent.toFixed(2)),
    total_remaining_gbp: parseFloat((totalLimit - totalSpent).toFixed(2)),
    budgets: enriched,
  });
}
