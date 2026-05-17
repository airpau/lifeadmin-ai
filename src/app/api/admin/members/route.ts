import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
// Always recompute — the admin members list must reflect the current
// auth.users + profiles state immediately after a sign-up / deletion.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Pulls last_sign_in_at + the auth-side email for every profile in one
 * shot via supabase.auth.admin.listUsers. The profiles table doesn't
 * carry last_sign_in_at — it lives on auth.users — so without this
 * lookup the admin dashboard had no way to see whether a member had
 * actually logged in since signing up. Paged at 1000 (the API max);
 * we'll hit that ceiling well before this admin needs paging.
 */
async function buildAuthLookup(
  admin: ReturnType<typeof getAdmin>,
): Promise<Map<string, { email: string | null; last_sign_in_at: string | null }>> {
  const lookup = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
  const perPage = 1000;
  let page = 1;
  // Safety cap so a runaway loop can't burn through the whole admin
  // request — Paybacker's user count is two orders of magnitude under
  // this in 2026 and we'd rather degrade gracefully than hang.
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('[admin/members] auth.admin.listUsers failed:', error.message);
      return lookup;
    }
    const users = data?.users ?? [];
    for (const u of users) {
      lookup.set(u.id, {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    if (users.length < perPage) break;
    page++;
  }
  return lookup;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const memberId = request.nextUrl.searchParams.get('id');

  // If specific member requested, return full details
  if (memberId) {
    const [profile, subscriptions, tasks, agentRuns, bankConnections, bankTxCount, authUser] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', memberId).single(),
      supabase.from('subscriptions').select('*').eq('user_id', memberId).is('dismissed_at', null).order('amount', { ascending: false }),
      supabase.from('tasks').select('id, type, title, status, provider_name, disputed_amount, created_at').eq('user_id', memberId).order('created_at', { ascending: false }).limit(50),
      supabase.from('agent_runs').select('id, agent_type, model_name, status, created_at').eq('user_id', memberId).order('created_at', { ascending: false }).limit(50),
      supabase.from('bank_connections').select('id, status, bank_name, last_synced_at, connected_at').eq('user_id', memberId),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', memberId),
      // Per-user auth lookup so the member-detail panel shows the real
      // email + last_sign_in_at without paginating every user.
      supabase.auth.admin.getUserById(memberId),
    ]);

    const subs = subscriptions.data || [];
    const monthlySpend = subs.reduce((sum: number, s: any) => {
      const amt = parseFloat(s.amount) || 0;
      if (s.billing_cycle === 'yearly') return sum + amt / 12;
      if (s.billing_cycle === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);

    // Estimate API cost based on agent runs
    const runs = agentRuns.data || [];
    const haikuCost = runs.filter((r: any) => r.model_name?.includes('haiku')).length * 0.003;
    const sonnetCost = runs.filter((r: any) => r.model_name?.includes('sonnet')).length * 0.02;
    const estimatedApiCost = parseFloat((haikuCost + sonnetCost).toFixed(4));

    // Merge auth-side fields onto the profile so the UI can read
    // last_sign_in_at and the canonical (auth) email straight off
    // selectedMember.profile.
    const authData = authUser.data?.user;
    const profileMerged = profile.data
      ? {
          ...profile.data,
          email: authData?.email ?? profile.data.email ?? null,
          last_sign_in_at: authData?.last_sign_in_at ?? null,
          auth_created_at: authData?.created_at ?? null,
        }
      : null;

    return NextResponse.json({
      profile: profileMerged,
      stats: {
        total_subscriptions: subs.length,
        monthly_spend: parseFloat(monthlySpend.toFixed(2)),
        total_complaints: (tasks.data || []).filter((t: any) => t.type === 'complaint_letter').length,
        total_cancellation_emails: (tasks.data || []).filter((t: any) => t.type === 'cancellation_email').length,
        total_agent_runs: runs.length,
        bank_transactions: bankTxCount.count || 0,
        estimated_api_cost: estimatedApiCost,
      },
      subscriptions: subs.map((s: any) => ({
        provider: s.provider_name,
        amount: s.amount,
        category: s.category,
        cycle: s.billing_cycle,
        source: s.source,
        status: s.status,
      })),
      tasks: tasks.data || [],
      bank_connections: bankConnections.data || [],
    });
  }

  // List all members
  const { data: members } = await supabase
    .from('profiles')
    .select('id, email, full_name, subscription_tier, subscription_status, created_at, total_money_recovered, total_tasks_completed, founding_member, founding_member_expires')
    .order('created_at', { ascending: false });

  // Auth-side enrichment — pulls last_sign_in_at + the auth-side email
  // for every profile in one paged call. Done up front so the per-user
  // enrichment loop below doesn't issue 51× auth.getUserById round-trips
  // for the same data.
  const authLookup = await buildAuthLookup(supabase);

  // Get per-member stats. The N+1 stat queries below are bounded by the
  // user count (Paybacker has under 100 users in 2026) so we accept the
  // round-trips for now; switch to a single aggregate RPC if/when the
  // table grows past a few hundred.
  const enriched = await Promise.all((members || []).map(async (m: any) => {
    const [subCount, taskCount, txCount] = await Promise.all([
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', m.id).is('dismissed_at', null),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', m.id),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', m.id),
    ]);

    const authInfo = authLookup.get(m.id);

    return {
      ...m,
      // Prefer the auth-side email — profiles.email can drift if a user
      // changes their email via Supabase Auth without us re-syncing the
      // profile row.
      email: authInfo?.email ?? m.email ?? null,
      last_sign_in_at: authInfo?.last_sign_in_at ?? null,
      subscriptions_tracked: subCount.count || 0,
      tasks_created: taskCount.count || 0,
      bank_transactions: txCount.count || 0,
    };
  }));

  return NextResponse.json({ members: enriched });
}
