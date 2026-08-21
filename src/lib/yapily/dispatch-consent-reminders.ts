// src/lib/yapily/dispatch-consent-reminders.ts
//
// The reminder send loop, extracted from the cron so the admin harness
// can exercise the identical code path in dry-run mode.
//
// That matters more than usual here. This flow is impossible to
// exercise naturally without waiting 90 days for a real consent to age
// out, which is exactly why it shipped broken and stayed broken: the
// cron ran daily for months and sent one email in its entire life. If
// the only way to test it is in production three months from now, it
// will break again. So the harness and the cron must share this
// function, not merely resemble each other.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  daysUntil,
  pickReminderChannel,
  reminderDeadline,
  reminderReferenceKey,
  reminderStage,
  shouldRemindToday,
  FIRST_REMINDER_DAYS_BEFORE,
  REMINDER_DAYS_AFTER,
  REMINDER_NOTIFICATION_TYPE,
  type ReminderChannel,
} from './consent-reminders';

export interface ReminderCandidate {
  id: string;
  user_id: string;
  provider: string | null;
  bank_name: string | null;
  consent_expires_at: string | null;
  consent_reconfirm_by: string | null;
  yapily_consent_id: string | null;
  status: string;
}

export interface ReminderOutcome {
  connectionId: string;
  userId: string;
  bankName: string;
  daysLeft: number;
  stage: string;
  channel: ReminderChannel | null;
  /** Why that channel, or why nothing was sent. */
  reason: string;
  sent: boolean;
}

export interface ReminderRunResult {
  remindersSent: number;
  remindersSkipped: number;
  sentByChannel: Record<ReminderChannel, number>;
  outcomes: ReminderOutcome[];
}

/** Where the user goes to fix it. Money Hub carries the one-click
 *  reconfirmation banner. */
const RENEW_PATH = '/dashboard/money-hub';

export interface DispatchOptions {
  /** Don't send or log anything; just report what would happen. */
  dryRun?: boolean;
  /** Restrict to one connection — used by the admin harness. */
  connectionId?: string;
  /**
   * Pretend the deadline is this many days away, ignoring the stored
   * date. Harness only: lets us walk a full T-7 → T+3 cycle in seconds
   * instead of waiting three months.
   */
  simulateDaysLeft?: number;
}

export async function dispatchConsentReminders(
  supabase: SupabaseClient,
  now: Date = new Date(),
  opts: DispatchOptions = {},
): Promise<ReminderRunResult> {
  const result: ReminderRunResult = {
    remindersSent: 0,
    remindersSkipped: 0,
    sentByChannel: { email: 0 },
    outcomes: [],
  };

  // Widen the SQL window by a day at each end and do the precise
  // arithmetic in JS. Postgres and the Node process can disagree about
  // "today" across a timezone boundary, and a connection dropping out
  // of the window for one run means a missed reminder we can never
  // replay — the deadline only passes once.
  const windowStart = new Date(now.getTime() - (REMINDER_DAYS_AFTER + 1) * 86_400_000);
  const windowEnd = new Date(now.getTime() + (FIRST_REMINDER_DAYS_BEFORE + 1) * 86_400_000);

  let query = supabase
    .from('bank_connections')
    .select(
      'id, user_id, provider, bank_name, consent_expires_at, consent_reconfirm_by, yapily_consent_id, status',
    )
    .eq('provider', 'yapily')
    .in('status', ['active', 'expiring_soon', 'expired'])
    .is('deleted_at', null)
    .is('archived_at', null);

  if (opts.connectionId) {
    query = query.eq('id', opts.connectionId);
  } else {
    // `or` rather than a single column: reconfirm_by is authoritative
    // where present, expires_at is the fallback for older rows, and a
    // row qualifies on whichever it has.
    query = query.or(
      `and(consent_reconfirm_by.gte.${windowStart.toISOString()},consent_reconfirm_by.lte.${windowEnd.toISOString()}),` +
      `and(consent_reconfirm_by.is.null,consent_expires_at.gte.${windowStart.toISOString()},consent_expires_at.lte.${windowEnd.toISOString()})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('[consent-reminders] candidate fetch failed:', error.message);
    return result;
  }

  const candidates = (data ?? []) as unknown as ReminderCandidate[];

  for (const c of candidates) {
    const bankName = c.bank_name || c.provider || 'your bank';
    const deadline = reminderDeadline(c);

    const daysLeft =
      opts.simulateDaysLeft !== undefined
        ? opts.simulateDaysLeft
        : deadline
          ? daysUntil(deadline, now)
          : Number.NaN;

    const record = (channel: ReminderChannel | null, reason: string, sent: boolean) => {
      result.outcomes.push({
        connectionId: c.id,
        userId: c.user_id,
        bankName,
        daysLeft,
        stage: Number.isFinite(daysLeft) ? reminderStage(daysLeft) : 'unknown',
        channel,
        reason,
        sent,
      });
      if (sent) {
        result.remindersSent++;
        if (channel) result.sentByChannel[channel]++;
      } else {
        result.remindersSkipped++;
      }
    };

    if (!deadline && opts.simulateDaysLeft === undefined) {
      record(null, 'no consent_reconfirm_by or consent_expires_at on this connection', false);
      continue;
    }
    if (!shouldRemindToday(daysLeft)) {
      record(
        null,
        `outside the reminder window (T-${FIRST_REMINDER_DAYS_BEFORE} .. T+${REMINDER_DAYS_AFTER})`,
        false,
      );
      continue;
    }

    // ── One email per connection per day ──
    const refKey = reminderReferenceKey(c.id, now.toISOString());
    if (!opts.dryRun) {
      const { data: already } = await supabase
        .from('notification_log')
        .select('id')
        .eq('reference_key', refKey)
        .limit(1);
      if (already && already.length > 0) {
        record(null, 'already reminded today', false);
        continue;
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, first_name, full_name')
      .eq('id', c.user_id)
      .maybeSingle();

    const choice = pickReminderChannel({
      email: (profile?.email as string | null) ?? null,
    });

    if (!choice) {
      record(null, 'no email address on the profile', false);
      continue;
    }

    if (opts.dryRun) {
      record(choice.channel, `${choice.reason} (dry run, nothing sent)`, false);
      continue;
    }

    const firstName =
      ((profile?.first_name as string | null) ||
        (profile?.full_name as string | null) ||
        '')
        .toString()
        .trim()
        .split(/\s+/)[0] || '';

    // ── Send the email, and always leave an in-app notification ──
    //
    // Two things happen on a reminder day and they are not the same
    // kind of thing. The email is the SEND, deduped to one per
    // connection per day. The in-app notification is a note left for
    // when the user next opens Paybacker; it costs nothing, interrupts
    // nobody, and is the row a mobile push will read once the app
    // exists. Emma does the same, and it is the reason someone who
    // ignores email still finds out.
    const label =
      daysLeft > 0
        ? `Your ${bankName} connection expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
        : daysLeft === 0
          ? `Your ${bankName} connection expires today`
          : `Your ${bankName} connection has stopped`;

    const body =
      daysLeft >= 0
        ? `UK rules mean we have to ask you to confirm every 90 days. It takes one tap and you will not need to log in to your bank.`
        : `We have paused reading your ${bankName} transactions until you confirm. One tap restores it, and you will not need to log in to your bank.`;

    let delivered: { channel: ReminderChannel; reason: string } | null = null;
    const attempts: string[] = [];

    // In-app first, deliberately. If the email provider is down, the
    // user should still find the notice waiting for them in the
    // product rather than nothing at all.
    try {
      await supabase.from('user_notifications').insert({
        user_id: c.user_id,
        type: 'consent_renewal',
        title: label,
        body,
        link_url: RENEW_PATH,
        metadata: {
          connection_id: c.id,
          bank_name: bankName,
          days_left: daysLeft,
          stage: reminderStage(daysLeft),
        },
      });
    } catch (e) {
      // Non-fatal. The email below is the channel we count.
      console.warn(
        `[consent-reminders] in-app notification insert failed for connection=${c.id}`,
        e,
      );
      attempts.push('in-app notification insert failed');
    }

    try {
      const { sendConsentRenewalReminderEmail } = await import(
        '@/lib/email/consent-renewal-reminder'
      );
      const ok = await sendConsentRenewalReminderEmail(
        profile!.email as string,
        firstName,
        { bankName, daysLeft },
      );
      if (ok) {
        delivered = { channel: 'email', reason: choice.reason };
      } else {
        attempts.push('email provider reported failure');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      console.warn(
        `[consent-reminders] email send failed for connection=${c.id}: ${msg}`,
      );
      attempts.push(`email threw: ${msg}`);
    }

    if (!delivered) {
      // Nothing logged, so tomorrow's run tries again from the top.
      record(choice.channel, `email not delivered (${attempts.join('; ')}), retrying tomorrow`, false);
      continue;
    }

    await supabase.from('notification_log').insert({
      user_id: c.user_id,
      notification_type: REMINDER_NOTIFICATION_TYPE,
      reference_key: refKey,
    });
    record(
      delivered.channel,
      attempts.length ? `${delivered.reason} (after: ${attempts.join('; ')})` : delivered.reason,
      true,
    );
  }

  return result;
}
