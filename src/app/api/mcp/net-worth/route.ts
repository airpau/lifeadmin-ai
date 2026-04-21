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

  const a = admin();
  const [assetsRes, liabilitiesRes, goalsRes] = await Promise.all([
    a
      .from('money_hub_assets')
      .select('id, name, category, value, currency, notes, updated_at')
      .eq('user_id', auth.userId),
    a
      .from('money_hub_liabilities')
      .select('id, name, category, balance, interest_rate, min_payment, currency, notes, updated_at')
      .eq('user_id', auth.userId),
    a
      .from('money_hub_savings_goals')
      .select('id, name, target_amount, current_amount, target_date, category, created_at')
      .eq('user_id', auth.userId),
  ]);

  const assets = assetsRes.data ?? [];
  const liabilities = liabilitiesRes.data ?? [];
  const goals = goalsRes.data ?? [];

  const totalAssets = assets.reduce((s, r) => s + Number(r.value ?? 0), 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + Number(r.balance ?? 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  return mcpJson({
    as_of: new Date().toISOString(),
    net_worth_gbp: parseFloat(netWorth.toFixed(2)),
    total_assets_gbp: parseFloat(totalAssets.toFixed(2)),
    total_liabilities_gbp: parseFloat(totalLiabilities.toFixed(2)),
    assets,
    liabilities,
    savings_goals: goals.map((g) => {
      const target = Number(g.target_amount ?? 0);
      const current = Number(g.current_amount ?? 0);
      return {
        ...g,
        progress_percentage:
          target > 0 ? parseFloat(((current / target) * 100).toFixed(1)) : 0,
      };
    }),
  });
}
