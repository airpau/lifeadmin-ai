import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPlan } from '@/lib/get-user-plan';
import { TIER_CONFIG } from '@/lib/bank-tier-config';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = await getUserPlan(user.id);
  const tierConfig = TIER_CONFIG[plan.tier];

  const [activeResult, expiredResult] = await Promise.all([
    supabase
      .from('bank_connections')
      .select('id, provider_id, status, last_synced_at, last_manual_sync_at, connected_at, account_ids, bank_name, account_display_names')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('connected_at', { ascending: false }),

    supabase
      .from('bank_connections')
      .select('id, provider_id, status, last_synced_at, connected_at, account_ids, bank_name, account_display_names')
      .eq('user_id', user.id)
      .eq('status', 'expired')
      .order('connected_at', { ascending: false }),
  ]);

  const connections = activeResult.data || [];
  const expired = expiredResult.data || [];
  const connection = connections.length > 0 ? connections[0] : null;

  // For Pro users: include today's manual sync count so the UI can show the daily limit
  let manualSyncsToday = 0;
  if (plan.tier === 'pro') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('bank_sync_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('trigger_type', 'manual')
      .eq('status', 'success')
      .gte('created_at', todayStart.toISOString());

    manualSyncsToday = count ?? 0;
  }

  return NextResponse.json({
    connection,
    connections,
    expired,
    hasExpired: expired.length > 0,
    // Tier context for UI rendering
    tier: plan.tier,
    maxConnections: tierConfig.maxConnections === Infinity ? null : tierConfig.maxConnections,
    manualSyncAllowed: tierConfig.manualSyncAllowed,
    manualSyncDailyLimit: tierConfig.manualSyncDailyLimit,
    manualSyncCooldownHours: tierConfig.manualSyncCooldownHours,
    manualSyncsToday,
  });
}
