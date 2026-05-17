import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { computeMrrGbp, getActiveBankConnectionCount } from '@/lib/admin-metrics';

export const runtime = 'nodejs';
// Always recompute — these numbers feed the live admin overview and must
// never be served from an edge / RSC cache. Without this an old MRR /
// total_users snapshot can sit in front of the dashboard for hours after
// a paid sign-up or a test-account delete.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();

  const nowIso = new Date().toISOString();

  // Run all queries in parallel for speed
  const [
    usersResult,
    waitlistResult,
    subscriptionsResult,
    tiersResult,
    complaintsResult,
    bankConnectionsCount,
    agentRunsResult,
    recentSignupsResult,
    transactionsResult,
    merchantRulesResult,
    socialPostsResult,
    mrrSummary,
    foundingMembersResult,
    foundingMembersActiveResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).is('dismissed_at', null),
    supabase.from('profiles').select('subscription_tier, founding_member, founding_member_expires'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter'),
    // See src/lib/admin-metrics.ts — counts every non-deleted, non-revoked
    // connection across providers (TrueLayer + Yapily). Previously filtered
    // status='active' only, which silently hid every TrueLayer row after
    // the Yapily migration bulk-flipped them to 'expired_legacy'.
    getActiveBankConnectionCount(supabase),
    supabase.from('agent_runs').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id, email, full_name, subscription_tier, subscription_status, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }),
    supabase.from('merchant_rules').select('id', { count: 'exact', head: true }),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }),
    computeMrrGbp(supabase),
    // Founding-member counts — the programme uses profiles.founding_member
    // (boolean) + founding_member_expires (timestamptz, 30-day Pro window).
    // Total counts every member who was ever onboarded as founding; active
    // is the subset whose Pro perk hasn't expired. Both are surfaced on
    // the overview so Paul can see at a glance how many founders are
    // still on their free-Pro window.
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('founding_member', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('founding_member', true).or(`founding_member_expires.is.null,founding_member_expires.gt.${nowIso}`),
  ]);

  // Calculate tier breakdown. Counts every profile, defaulting NULL
  // subscription_tier to 'free'. Initialised with the three canonical
  // tiers so the widget renders even when one bucket is empty.
  const tierBreakdown: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) {
    const tier = p.subscription_tier || 'free';
    tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
  }

  return NextResponse.json({
    generated: new Date().toISOString(),
    overview: {
      total_users: usersResult.count || 0,
      waitlist_signups: waitlistResult.count || 0,
      active_subscriptions: subscriptionsResult.count || 0,
      bank_connections: bankConnectionsCount,
      bank_transactions: transactionsResult.count || 0,
      complaints_generated: complaintsResult.count || 0,
      agent_runs: agentRunsResult.count || 0,
      merchant_rules: merchantRulesResult.count || 0,
      social_posts: socialPostsResult.count || 0,
    },
    revenue: {
      mrr: mrrSummary.mrr,
      arr: mrrSummary.arr,
      paying_customers: (tierBreakdown.essential || 0) + (tierBreakdown.pro || 0),
      free_users: tierBreakdown.free || 0,
    },
    mrr_breakdown: mrrSummary.breakdown,
    tier_breakdown: tierBreakdown,
    founding_members: {
      total: foundingMembersResult.count || 0,
      active: foundingMembersActiveResult.count || 0,
    },
    recent_signups: (recentSignupsResult.data || []).map((u: any) => ({
      id: u.id,
      email: u.email,
      name: u.full_name,
      tier: u.subscription_tier || 'free',
      status: u.subscription_status,
      joined: u.created_at,
    })),
  });
}
