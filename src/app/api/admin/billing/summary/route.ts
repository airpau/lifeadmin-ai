import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const FOUNDER_FALLBACK = 'aireypaul@googlemail.com';

function isFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  if ((process.env.FOUNDER_EMAIL || '').trim().toLowerCase() === email.toLowerCase()) return true;
  return email.toLowerCase() === FOUNDER_FALLBACK;
}

interface Row {
  id: number;
  occurred_at: string;
  provider: string;
  model: string | null;
  endpoint: string | null;
  user_id: string | null;
  cost_gbp: string | number;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isFounder(user?.email)) {
    // 404 — don't reveal the page exists.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull last 30 days in one query — we'll bucket in JS.
  const { data: rows30Raw } = await admin
    .from('api_cost_ledger')
    .select('id, occurred_at, provider, model, endpoint, user_id, cost_gbp')
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(50000);

  const rows30 = (rows30Raw || []) as Row[];
  const num = (v: string | number) => (typeof v === 'string' ? parseFloat(v) : v) || 0;

  let monthTotal = 0;
  const byProviderMonth: Record<string, number> = {};
  const byModelMonth: Record<string, number> = {};
  let last30Total = 0;
  const byEndpoint: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let last7Total = 0;

  for (const r of rows30) {
    const cost = num(r.cost_gbp);
    last30Total += cost;
    const day = r.occurred_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + cost;
    if (r.occurred_at >= startOfMonth) {
      monthTotal += cost;
      byProviderMonth[r.provider] = (byProviderMonth[r.provider] || 0) + cost;
      const mk = r.model || '(none)';
      byModelMonth[mk] = (byModelMonth[mk] || 0) + cost;
    }
    if (r.occurred_at >= sevenDaysAgo) {
      last7Total += cost;
    }
    const ek = r.endpoint || '(none)';
    byEndpoint[ek] = (byEndpoint[ek] || 0) + cost;
    if (r.user_id) {
      byUser[r.user_id] = (byUser[r.user_id] || 0) + cost;
    }
  }

  const topEndpoints = Object.entries(byEndpoint)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([endpoint, cost]) => ({ endpoint, cost_gbp: cost }));

  const topUserIds = Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Resolve user emails + tier in one query.
  const userIds = topUserIds.map(([id]) => id);
  let topUsers: Array<{ user_id: string; email: string | null; tier: string | null; cost_gbp: number }> = [];
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, subscription_tier')
      .in('id', userIds);
    const profMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    topUsers = topUserIds.map(([id, cost]) => ({
      user_id: id,
      email: profMap.get(id)?.email ?? null,
      tier: profMap.get(id)?.subscription_tier ?? null,
      cost_gbp: cost,
    }));
  }

  // Per-tier cost: aggregate using the byUser map + profile tiers (last 30d).
  const allUserIds = Object.keys(byUser);
  const perTier: Record<string, number> = { free: 0, essential: 0, pro: 0, unknown: 0 };
  if (allUserIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, subscription_tier')
      .in('id', allUserIds);
    const tierMap = new Map((profiles || []).map((p: any) => [p.id, p.subscription_tier || 'unknown']));
    for (const uid of allUserIds) {
      const tier = (tierMap.get(uid) as string) || 'unknown';
      perTier[tier] = (perTier[tier] || 0) + byUser[uid];
    }
  }

  // Daily trend: fill 30 days zero-padded.
  const dailyTrend: Array<{ date: string; cost_gbp: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dailyTrend.push({ date: d, cost_gbp: byDay[d] || 0 });
  }

  // Projection: monthly run rate from last 7 days.
  const projectedMonth = (last7Total / 7) * 30;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    monthSoFar: {
      total_gbp: monthTotal,
      byProvider: Object.entries(byProviderMonth)
        .sort((a, b) => b[1] - a[1])
        .map(([provider, cost]) => ({ provider, cost_gbp: cost })),
      byModel: Object.entries(byModelMonth)
        .sort((a, b) => b[1] - a[1])
        .map(([model, cost]) => ({ model, cost_gbp: cost })),
    },
    last30Days: { total_gbp: last30Total },
    topEndpoints,
    topUsers,
    perTier,
    dailyTrend,
    projection: { monthlyRunRate_gbp: projectedMonth, basedOnDays: 7 },
  });
}
