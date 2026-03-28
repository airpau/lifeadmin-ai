import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily contract expiry check.
 * Flags contracts expiring within 30 days.
 * Schedule: Daily at 7am — configured in vercel.json
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let alertsCreated = 0;

  // Find contracts with end_date within 30 days that we haven't already alerted
  const { data: expiring } = await supabase
    .from('contract_extractions')
    .select('id, user_id, provider_name, contract_end_date, contract_type')
    .not('contract_end_date', 'is', null)
    .gte('contract_end_date', now.toISOString().split('T')[0])
    .lte('contract_end_date', thirtyDays.toISOString().split('T')[0]);

  if (!expiring || expiring.length === 0) {
    return NextResponse.json({ ok: true, alertsCreated: 0, reason: 'No expiring contracts' });
  }

  for (const contract of expiring) {
    // Check if we already created an alert for this contract
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', contract.user_id)
      .eq('type', 'contract_expiry')
      .eq('description', `contract-expiry-${contract.id}`)
      .maybeSingle();

    if (existing) continue;

    const daysLeft = Math.floor(
      (new Date(contract.contract_end_date!).getTime() - now.getTime()) / 86400000
    );

    await supabase.from('tasks').insert({
      user_id: contract.user_id,
      type: 'contract_expiry',
      title: `${contract.provider_name || 'Contract'} expires in ${daysLeft} days`,
      description: `contract-expiry-${contract.id}`,
      provider_name: contract.provider_name,
      status: 'pending_review',
    });

    alertsCreated++;
  }

  console.log(`[contract-expiry] Created ${alertsCreated} alerts`);
  return NextResponse.json({ ok: true, alertsCreated });
}
