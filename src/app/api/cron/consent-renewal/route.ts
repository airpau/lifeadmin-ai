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
 * 3. WhatsApp reconnect nudge (Pro users with a linked session)
 * 4. Email reminder for EVERY tier (Yapily build review step 9) — the
 *    WhatsApp template is Pro-only, so free and Essential users previously
 *    got no pre-expiry warning at all and simply found their bank feed had
 *    stopped. Deduped per connection per day via notification_log.
 * 5. Drains the upstream-revoke retry queue (build review step 8) — rows
 *    where DELETE /consents/{id} failed during disconnect, so the consent
 *    may still be live at the bank while our row says 'revoked'.
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
    .select('id, user_id, provider, bank_name, consent_expires_at');

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
    .select('id, user_id, provider, bank_name, consent_expires_at');

  if (expiredError) {
    console.error('Consent renewal: error marking expired:', expiredError);
  }

  const expiredCount = expired?.length || 0;

  // ── Step 3: Buzz WhatsApp Pocket Agent users with paybacker_reconnect_required.
  // Fires once per user-per-connection-per-day via notification_log dedup.
  // Combines both expiring_soon and expired sets — both states need user action.
  // Shared candidate set for both the WhatsApp nudge and the email
  // reminder — every connection that changed state on this run.
  const candidates = [
    ...(expiringSoon ?? []),
    ...(expired ?? []),
  ] as Array<{
    id: string;
    user_id: string;
    provider: string | null;
    bank_name: string | null;
    consent_expires_at: string | null;
  }>;
  const today = now.slice(0, 10);

  let whatsappSent = 0;
  try {
    const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
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

  // ── Step 4: Email reminder — EVERY tier (build review step 9) ──
  // The WhatsApp template above is Pro-only. Email is how a free or
  // Essential user finds out their bank feed is about to stop. Deduped on
  // its own reference_key so it fires independently of the WhatsApp nudge
  // (a Pro user legitimately gets both — different channels, same event).
  let emailsSent = 0;
  try {
    const { sendConsentRenewalReminderEmail } = await import(
      '@/lib/email/consent-renewal-reminder'
    );
    for (const c of candidates) {
      const refKey = `consent_renewal_email_${c.id}_${today}`;
      const { data: already } = await supabase
        .from('notification_log')
        .select('id')
        .eq('reference_key', refKey)
        .limit(1);
      if (already && already.length > 0) continue;

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name, full_name')
        .eq('id', c.user_id)
        .maybeSingle();
      const to = profile?.email as string | undefined;
      if (!to) continue;

      const firstName =
        ((profile?.first_name as string | null) ||
          (profile?.full_name as string | null) ||
          '')
          .toString()
          .trim()
          .split(/\s+/)[0] || '';

      // Whole days remaining; <= 0 flips the copy to "already stopped".
      const daysLeft = c.consent_expires_at
        ? Math.ceil(
            (new Date(c.consent_expires_at).getTime() - Date.now()) / 86_400_000,
          )
        : 0;

      try {
        const ok = await sendConsentRenewalReminderEmail(to, firstName, {
          bankName: c.bank_name || c.provider || 'your bank',
          daysLeft,
        });
        if (!ok) continue;
        // Only log AFTER a confirmed send, so a transient Resend failure
        // gets retried on tomorrow's run instead of being suppressed.
        await supabase.from('notification_log').insert({
          user_id: c.user_id,
          notification_type: 'consent_renewal_email',
          reference_key: refKey,
        });
        emailsSent += 1;
      } catch (e) {
        console.warn(`[consent-renewal] reminder email failed for connection=${c.id}`, e);
      }
    }
  } catch (e) {
    console.warn('[consent-renewal] email dispatch loop failed', e);
  }

  // ── Step 5: Drain the upstream-revoke retry queue (build review step 8) ──
  // These are connections the user disconnected where DELETE /consents/{id}
  // failed. Our row says 'revoked' but the consent may still be live at the
  // bank, which is the compliance problem. Retry until Yapily confirms.
  let revokesRetried = 0;
  let revokesSucceeded = 0;
  try {
    const { deleteConsent } = await import('@/lib/yapily');
    const { data: pendingRevokes } = await supabase
      .from('bank_connections')
      .select('id, yapily_consent_id, revoke_attempts')
      .eq('pending_yapily_revoke', true)
      .not('yapily_consent_id', 'is', null)
      .order('revoke_last_attempt_at', { ascending: true, nullsFirst: true })
      .limit(50);

    for (const row of pendingRevokes ?? []) {
      revokesRetried += 1;
      const attemptedAt = new Date().toISOString();
      const attempts = (row.revoke_attempts as number | null) ?? 0;
      try {
        await deleteConsent(row.yapily_consent_id as string);
        await supabase
          .from('bank_connections')
          .update({
            pending_yapily_revoke: false,
            revoke_attempts: attempts + 1,
            revoke_last_attempt_at: attemptedAt,
            revoke_last_error: null,
          })
          .eq('id', row.id);
        revokesSucceeded += 1;
        console.log(
          `[consent-renewal] upstream revoke finally succeeded for connection=${row.id} after ${attempts + 1} attempt(s)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        await supabase
          .from('bank_connections')
          .update({
            revoke_attempts: attempts + 1,
            revoke_last_attempt_at: attemptedAt,
            revoke_last_error: msg.slice(0, 500),
          })
          .eq('id', row.id);
        // Escalate once it's clearly not transient — a consent still live
        // at the bank a week after the user disconnected needs a human.
        if (attempts + 1 >= 7) {
          console.error(
            `[consent-renewal] ESCALATE: consent ${row.yapily_consent_id} (connection=${row.id}) has failed to revoke ${attempts + 1} times. It may still be live at the bank. Last error: ${msg}`,
          );
        }
      }
    }
  } catch (e) {
    console.warn('[consent-renewal] revoke retry sweep failed', e);
  }

  console.log(
    `Consent renewal: expiring_soon=${expiringSoonCount} expired=${expiredCount} whatsapp_sent=${whatsappSent} emails_sent=${emailsSent} revokes_retried=${revokesRetried} revokes_succeeded=${revokesSucceeded}`
  );

  return NextResponse.json({
    ok: true,
    expiring_soon: expiringSoonCount,
    expired: expiredCount,
    whatsapp_sent: whatsappSent,
    emails_sent: emailsSent,
    revokes_retried: revokesRetried,
    revokes_succeeded: revokesSucceeded,
  });
}
