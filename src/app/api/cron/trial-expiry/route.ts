import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const now = new Date().toISOString();

  // Find all users whose trial has lapsed and hasn't been converted or marked expired
  const { data: lapsed, error } = await admin
    .from('profiles')
    .select('id, email, subscription_tier')
    .lt('trial_ends_at', now)
    .is('trial_converted_at', null)
    .is('trial_expired_at', null)
    .not('trial_ends_at', 'is', null);

  if (error) {
    console.error('[trial-expiry] Query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!lapsed || lapsed.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  const ids = lapsed.map((u) => u.id);

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      trial_expired_at: now,
      subscription_tier: 'free',
      updated_at: now,
    })
    .in('id', ids);

  if (updateError) {
    console.error('[trial-expiry] Update error:', updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  console.log(`[trial-expiry] Expired ${lapsed.length} lapsed trial(s):`, ids);
  return NextResponse.json({ expired: lapsed.length });
}
