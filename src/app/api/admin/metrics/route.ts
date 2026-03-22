import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  // Auth check via CRON_SECRET or cookie-based admin check
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Run all queries in parallel for speed
  const [
    usersResult,
    waitlistResult,
    subscriptionsResult,
    tiersResult,
    complaintsResult,
    bankConnectionsResult,
    agentRunsResult,
    recentSignupsResult,
    transactionsResult,
    merchantRulesResult,
    socialPostsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).is('dismissed_at', null),
    supabase.from('profiles').select('subscription_tier'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter'),
    supabase.from('bank_connections').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('agent_runs').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id, email, full_name, subscription_tier, subscription_status, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }),
    supabase.from('merchant_rules').select('id', { count: 'exact', head: true }),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }),
  ]);

  // Calculate tier breakdown
  const tierBreakdown: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) {
    const tier = p.subscription_tier || 'free';
    tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
  }

  // Calculate MRR
  const mrr = (tierBreakdown.essential || 0) * 9.99 + (tierBreakdown.pro || 0) * 19.99;

  return NextResponse.json({
    generated: new Date().toISOString(),
    overview: {
      total_users: usersResult.count || 0,
      waitlist_signups: waitlistResult.count || 0,
      active_subscriptions: subscriptionsResult.count || 0,
      bank_connections: bankConnectionsResult.count || 0,
      bank_transactions: transactionsResult.count || 0,
      complaints_generated: complaintsResult.count || 0,
      agent_runs: agentRunsResult.count || 0,
      merchant_rules: merchantRulesResult.count || 0,
      social_posts: socialPostsResult.count || 0,
    },
    revenue: {
      mrr: parseFloat(mrr.toFixed(2)),
      arr: parseFloat((mrr * 12).toFixed(2)),
      paying_customers: (tierBreakdown.essential || 0) + (tierBreakdown.pro || 0),
      free_users: tierBreakdown.free || 0,
    },
    tier_breakdown: tierBreakdown,
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
