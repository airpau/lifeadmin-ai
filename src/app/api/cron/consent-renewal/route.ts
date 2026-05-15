import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';

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
    .select('id, user_id, bank_name');

  if (expiredError) {
    console.error('Consent renewal: error marking expired:', expiredError);
  }

  const expiredCount = expired?.length || 0;

  // ── Step 3: Fire reconnect alerts to Pocket Agent users whose
  //          consent JUST expired. Telegram + WhatsApp via the unified
  //          dispatcher; email is handled by the existing nudge cron
  //          so we don't double-spam. Each user is notified at most
  //          ONCE per connection per expiry (dedup via notification_log).
  let reconnectAlerts = 0;
  for (const conn of expired ?? []) {
    try {
      // Dedup: if we already fired a reconnect alert for this connection
      // since it was last marked expired, skip.
      const { data: alreadyAlerted } = await supabase
        .from('notification_log')
        .select('id')
        .eq('user_id', conn.user_id)
        .eq('notification_type', 'bank_reconnect_required')
        .eq('reference_key', conn.id)
        .maybeSingle();
      if (alreadyAlerted) continue;

      const providerName = conn.bank_name || 'your bank';
      const reconnectUrl = 'https://paybacker.co.uk/dashboard/money-hub';

      await sendNotification(supabase, {
        userId: conn.user_id,
        event: 'reconnect_required',
        telegram: {
          text:
            `⚠️ *Bank reconnection needed*\n\n` +
            `Your connection to *${providerName}* has expired. ` +
            `Open ${reconnectUrl} → Add bank to reconnect (90-second flow).\n\n` +
            `_We won't be able to sync new transactions until you reconnect._`,
        },
        whatsapp: {
          templateName: 'paybacker_reconnect_required',
          templateParameters: [providerName, reconnectUrl],
        },
        push: {
          title: 'Bank reconnection needed',
          body: `${providerName} consent expired — reconnect to resume sync`,
        },
      });

      await supabase.from('notification_log').insert({
        user_id: conn.user_id,
        notification_type: 'bank_reconnect_required',
        reference_key: conn.id,
      });
      reconnectAlerts++;
    } catch (err) {
      console.error(`[consent-renewal] alert failed for ${conn.id}:`, err);
    }
  }

  console.log(
    `Consent renewal: expiring_soon=${expiringSoonCount} expired=${expiredCount} reconnect_alerts=${reconnectAlerts}`
  );

  return NextResponse.json({
    ok: true,
    expiring_soon: expiringSoonCount,
    expired: expiredCount,
    reconnect_alerts: reconnectAlerts,
  });
}
