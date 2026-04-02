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
 * Daily consent renewal cron — checks for expiring and expired bank consents.
 *
 * Schedule: Daily at 7am — configured in vercel.json
 *
 * 1. Finds active connections expiring within 7 days → marks as 'expiring_soon'
 * 2. Finds active/expiring_soon connections already expired → marks as 'expired'
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date().toISOString();

  // Calculate 7 days from now
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDaysFromNowISO = sevenDaysFromNow.toISOString();

  // ── Step 1: Mark connections expiring within 7 days as 'expiring_soon' ──
  const { data: expiringSoon, error: expiringSoonError } = await supabase
    .from('bank_connections')
    .update({ status: 'expiring_soon', updated_at: now })
    .eq('status', 'active')
    .not('consent_expires_at', 'is', null)
    .lt('consent_expires_at', sevenDaysFromNowISO)
    .gte('consent_expires_at', now)
    .select('id');

  if (expiringSoonError) {
    console.error('Consent renewal: error marking expiring_soon:', expiringSoonError);
  }

  const expiringSoonCount = expiringSoon?.length || 0;

  // ── Step 2: Mark already-expired connections as 'expired' ──
  const { data: expired, error: expiredError } = await supabase
    .from('bank_connections')
    .update({ status: 'expired', updated_at: now })
    .in('status', ['active', 'expiring_soon'])
    .not('consent_expires_at', 'is', null)
    .lt('consent_expires_at', now)
    .select('id');

  if (expiredError) {
    console.error('Consent renewal: error marking expired:', expiredError);
  }

  const expiredCount = expired?.length || 0;

  console.log(
    `Consent renewal: expiring_soon=${expiringSoonCount} expired=${expiredCount}`
  );

  return NextResponse.json({
    ok: true,
    expiring_soon: expiringSoonCount,
    expired: expiredCount,
  });
}
