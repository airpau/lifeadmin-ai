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
    .select('id, user_id, provider');

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
    .select('id, user_id, provider');

  if (expiredError) {
    console.error('Consent renewal: error marking expired:', expiredError);
  }

  const expiredCount = expired?.length || 0;

  // ── Step 3: Buzz WhatsApp Pocket Agent users with paybacker_reconnect_required.
  // Fires once per user-per-connection-per-day via notification_log dedup.
  // Combines both expiring_soon and expired sets — both states need user action.
  let whatsappSent = 0;
  try {
    const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
    const candidates = [
      ...(expiringSoon ?? []),
      ...(expired ?? []),
    ] as Array<{ id: string; user_id: string; provider: string | null }>;
    const today = now.slice(0, 10);
    for (const c of candidates) {
      const refKey = `reconnect_required_${c.id}_${today}`;
      const { data: already } = await supabase
        .from('notification_log')
        .select('id')
        .eq('reference_key', refKey)
        .limit(1);
      if (already && already.length > 0) continue;
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('whatsapp_phone')
        .eq('user_id', c.user_id)
        .eq('is_active', true)
        .is('opted_out_at', null)
        .maybeSingle();
      if (!session?.whatsapp_phone) continue;
      const provider = c.provider || 'your bank';
      // /dashboard/connections does not exist — this template pointed
      // users at a 404 for every reconnect prompt we ever sent. Money Hub
      // is where bank connections actually live, and it now carries the
      // one-click renewal banner (build review step 9).
      const url = 'paybacker.co.uk/dashboard/money-hub';
      try {
        await sendWhatsAppTemplate({
          to: session.whatsapp_phone,
          templateName: 'paybacker_reconnect_required',
          parameters: [provider, url],
        });
        await supabase.from('notification_log').insert({
          user_id: c.user_id,
          notification_type: 'reconnect_required',
          reference_key: refKey,
        });
        whatsappSent += 1;
      } catch (e) {
        console.warn('[consent-renewal] reconnect_required send failed', e);
      }
    }
  } catch (e) {
    console.warn('[consent-renewal] WhatsApp dispatch loop failed', e);
  }

  console.log(
    `Consent renewal: expiring_soon=${expiringSoonCount} expired=${expiredCount} whatsapp_sent=${whatsappSent}`
  );

  return NextResponse.json({
    ok: true,
    expiring_soon: expiringSoonCount,
    expired: expiredCount,
    whatsapp_sent: whatsappSent,
  });
}
