import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchConsentReminders } from '@/lib/yapily/dispatch-consent-reminders';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily consent reminder cron — UK 90-day reconfirmation.
 *
 * Schedule: daily at 07:00 UTC — configured in vercel.json
 *
 * 1. Status maintenance: active → expiring_soon (inside 7 days), and
 *    → expired once the deadline passes. This drives the in-app banner.
 * 2. Reminders: every connection whose deadline is between 7 days away
 *    and 3 days past gets ONE message a day, on ONE channel.
 * 3. Drains the upstream-revoke retry queue (build review step 8) — rows
 *    where DELETE /consents/{id} failed during disconnect, so the consent
 *    may still be live at the bank while our row says 'revoked'.
 *
 * ── Rewritten 2026-08-21 ─────────────────────────────────────────────
 *
 * The reminder half of this cron had never worked. Production evidence:
 * one email sent in the entire history of the system, and that one was
 * the "already stopped" variant. No user had ever received an advance
 * warning.
 *
 * Two structural bugs, both fixed here:
 *
 *   (a) The candidate list was built from the rows returned by the two
 *       status UPDATEs — i.e. only connections whose status CHANGED on
 *       that run. A connection flipped to `expiring_soon` on T-7 could
 *       not be a candidate again until it flipped to `expired` on T-0.
 *       Ceiling: two messages per connection, ever. Step 2 now SELECTs
 *       by deadline, independently of any status change, so the daily
 *       cadence the dedup keys always implied can actually happen.
 *
 *   (b) It sent WhatsApp AND email for the same event on the same day,
 *       via two disjoint dedup keys, with a comment justifying it.
 *       Migle Ivanauskaite (Yapily) asked us to simplify to a single
 *       preferred channel. There is now one key per connection per day
 *       and one channel, chosen by pickReminderChannel.
 *
 * It also now reads Yapily's own `consent_reconfirm_by` in preference
 * to our locally guessed `consent_expires_at`.
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

  // ── Step 2: Send the daily reminder ──────────────────────────────
  //
  // Selected by DEADLINE, not by "did the status change on this run".
  // That distinction is the whole fix — see the header comment.
  const reminderResult = await dispatchConsentReminders(supabase, new Date());
  const { sentByChannel, remindersSent, remindersSkipped } = reminderResult;

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
    `Consent renewal: expiring_soon=${expiringSoonCount} expired=${expiredCount} ` +
    `reminders_sent=${remindersSent} (whatsapp=${sentByChannel.whatsapp} telegram=${sentByChannel.telegram} email=${sentByChannel.email}) ` +
    `skipped=${remindersSkipped} revokes_retried=${revokesRetried} revokes_succeeded=${revokesSucceeded}`
  );

  return NextResponse.json({
    ok: true,
    expiring_soon: expiringSoonCount,
    expired: expiredCount,
    reminders_sent: remindersSent,
    reminders_by_channel: sentByChannel,
    reminders_skipped: remindersSkipped,
    revokes_retried: revokesRetried,
    revokes_succeeded: revokesSucceeded,
  });
}
