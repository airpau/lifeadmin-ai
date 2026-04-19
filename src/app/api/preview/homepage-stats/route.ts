import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/preview/homepage-stats
 *
 * Public, unauthenticated endpoint. Feeds the live figures on the v2
 * marketing homepage preview (`/preview/homepage`):
 *
 *   - savedThisMonth       → hero ticker ("Saved for our members this month")
 *   - avgSavingsPerUser    → stats card 1 ("Average potential savings, /yr")
 *   - subscriptionsTracked → stats card 2 ("Subscriptions tracked")
 *   - foundingMembers      → stats card 3 ("Founding members")
 *
 * Patterns lifted from /api/disputes/stats/route.ts (ISR revalidate = 300,
 * service-role client, defensive zeroed-fallback if env missing).
 */

export const revalidate = 300; // 5 min ISR cache — anonymous visitors won't hammer Supabase

const ZEROED = {
  savedThisMonth: 0,
  avgSavingsPerUser: 0,
  subscriptionsTracked: 0,
  foundingMembers: 0,
  asOf: new Date().toISOString(),
  source: 'fallback' as const,
};

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(ZEROED);
  }

  const supabase = getAdmin();

  // Time windows
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [monthSaved, ninetyDaySaved, subs, founding] = await Promise.all([
    // 1) Saved this calendar month — sum verified_savings.amount_saved
    supabase
      .from('verified_savings')
      .select('amount_saved')
      .gte('created_at', startOfMonth),

    // 2) Rolling 90d savings rows — we annualise per-user client-side below
    supabase
      .from('verified_savings')
      .select('user_id, amount_saved')
      .gte('created_at', ninetyDaysAgo),

    // 3) Subscriptions tracked (excluding user-dismissed rows)
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .is('dismissed_at', null),

    // 4) Active founding members
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('founding_member', true),
  ]);

  // Hero ticker — sum this month
  const savedThisMonth =
    (monthSaved.data ?? []).reduce((sum, r) => sum + Number(r.amount_saved ?? 0), 0);

  // 90-day avg savings annualised.
  // avg per user over 90 days * (365 / 90) → rough "/yr" figure matching the card label.
  const ninetyRows = ninetyDaySaved.data ?? [];
  const byUser = new Map<string, number>();
  for (const r of ninetyRows) {
    const uid = String(r.user_id ?? '');
    if (!uid) continue;
    byUser.set(uid, (byUser.get(uid) ?? 0) + Number(r.amount_saved ?? 0));
  }
  const distinctUsers = byUser.size;
  const sum90 = Array.from(byUser.values()).reduce((a, b) => a + b, 0);
  const avgPerUser90 = distinctUsers > 0 ? sum90 / distinctUsers : 0;
  const avgSavingsPerUser = Math.round(avgPerUser90 * (365 / 90));

  const subscriptionsTracked = subs.count ?? 0;
  const foundingMembers = founding.count ?? 0;

  // If every metric is zero, flag as 'seed' so the UI can still show the
  // "Preview data" note until real users start landing.
  const allZero =
    savedThisMonth === 0 &&
    avgSavingsPerUser === 0 &&
    subscriptionsTracked === 0 &&
    foundingMembers === 0;

  return NextResponse.json({
    savedThisMonth: Math.round(savedThisMonth * 100) / 100,
    avgSavingsPerUser,
    subscriptionsTracked,
    foundingMembers,
    asOf: now.toISOString(),
    source: allZero ? ('seed' as const) : ('live' as const),
  });
}
