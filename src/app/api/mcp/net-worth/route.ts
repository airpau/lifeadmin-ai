// src/app/api/mcp/net-worth/route.ts
// MCP: user's net worth snapshot — assets minus liabilities, plus savings goals.
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

  // Column names verified against the live schema (2026-08-16). All
  // three selects previously used invented names (name / value /
  // balance / category / currency / notes / min_payment), so PostgREST
  // returned an error on each. The route never checked those errors, so
  // it silently answered with a £0 net worth instead of 500ing — worse
  // than a hard failure, because the caller couldn't tell it was wrong.
  const a = admin();
  const [assetsRes, liabilitiesRes, goalsRes] = await Promise.all([
    a
      .from('money_hub_assets')
      .select('id, asset_name, asset_type, estimated_value, created_at, updated_at')
      .eq('user_id', auth.userId),
    a
      .from('money_hub_liabilities')
      .select(
        'id, liability_name, liability_type, outstanding_balance, monthly_payment, interest_rate, created_at, updated_at',
      )
      .eq('user_id', auth.userId),
    a
      .from('money_hub_savings_goals')
      .select(
        'id, goal_name, target_amount, current_amount, target_date, emoji, created_at',
      )
      .eq('user_id', auth.userId),
  ]);

  const firstError =
    assetsRes.error ?? liabilitiesRes.error ?? goalsRes.error ?? null;
  if (firstError) {
    return mcpJson({ error: firstError.message }, { status: 500 });
  }

  const assets = assetsRes.data ?? [];
  const liabilities = liabilitiesRes.data ?? [];
  const goals = goalsRes.data ?? [];

  const totalAssets = assets.reduce(
    (s, r) => s + Number(r.estimated_value ?? 0),
    0,
  );
  const totalLiabilities = liabilities.reduce(
    (s, r) => s + Number(r.outstanding_balance ?? 0),
    0,
  );
  const netWorth = totalAssets - totalLiabilities;

  return mcpJson({
    as_of: new Date().toISOString(),
    net_worth_gbp: parseFloat(netWorth.toFixed(2)),
    total_assets_gbp: parseFloat(totalAssets.toFixed(2)),
    total_liabilities_gbp: parseFloat(totalLiabilities.toFixed(2)),
    note:
      'Assets and liabilities are the ones you have recorded in Money Hub. ' +
      'Bank balances are not automatically included.',
    assets: assets.map((r) => ({
      id: r.id,
      name: r.asset_name,
      type: r.asset_type,
      value_gbp: Number(r.estimated_value ?? 0),
      updated_at: r.updated_at,
    })),
    liabilities: liabilities.map((r) => ({
      id: r.id,
      name: r.liability_name,
      type: r.liability_type,
      balance_gbp: Number(r.outstanding_balance ?? 0),
      monthly_payment_gbp:
        r.monthly_payment == null ? null : Number(r.monthly_payment),
      interest_rate: r.interest_rate ?? null,
      updated_at: r.updated_at,
    })),
    savings_goals: goals.map((g) => {
      const target = Number(g.target_amount ?? 0);
      const current = Number(g.current_amount ?? 0);
      return {
        id: g.id,
        name: g.goal_name,
        emoji: g.emoji ?? null,
        target_amount_gbp: target,
        current_amount_gbp: current,
        target_date: g.target_date ?? null,
        progress_percentage:
          target > 0 ? parseFloat(((current / target) * 100).toFixed(1)) : 0,
      };
    }),
  });
}
