import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const memberId = request.nextUrl.searchParams.get('id');

  // If specific member requested, return full details
  if (memberId) {
    const [profile, subscriptions, tasks, agentRuns, bankConnections, bankTxCount] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', memberId).single(),
      supabase.from('subscriptions').select('*').eq('user_id', memberId).is('dismissed_at', null).order('amount', { ascending: false }),
      supabase.from('tasks').select('id, type, title, status, provider_name, disputed_amount, created_at').eq('user_id', memberId).order('created_at', { ascending: false }).limit(50),
      supabase.from('agent_runs').select('id, agent_type, model_name, status, created_at').eq('user_id', memberId).order('created_at', { ascending: false }).limit(50),
      supabase.from('bank_connections').select('id, status, bank_name, last_synced_at, connected_at').eq('user_id', memberId),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', memberId),
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

    return NextResponse.json({
      profile: profile.data,
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
    .select('id, email, full_name, subscription_tier, subscription_status, created_at, total_money_recovered, total_tasks_completed')
    .order('created_at', { ascending: false });

  // Get per-member stats
  const enriched = await Promise.all((members || []).map(async (m: any) => {
    const [subCount, taskCount, txCount] = await Promise.all([
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', m.id).is('dismissed_at', null),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', m.id),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('user_id', m.id),
    ]);

    return {
      ...m,
      subscriptions_tracked: subCount.count || 0,
      tasks_created: taskCount.count || 0,
      bank_transactions: txCount.count || 0,
    };
  }));

  return NextResponse.json({ members: enriched });
}
