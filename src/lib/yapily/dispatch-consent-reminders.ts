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
import { isAtLeastPro } from '@/lib/tier-rank';
import { getEffectiveTier } from '@/lib/plan-limits';
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
 *  reconfirmation banner; /dashboard/connections does not exist and was
 *  a 404 in every WhatsApp reconnect prompt sent before 2026-07-29. */
const RENEW_PATH = '/dashboard/money-hub';
const RENEW_URL = `https://paybacker.co.uk${RENEW_PATH}`;

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
    sentByChannel: { whatsapp: 0, telegram: 0, email: 0 },
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

    // ── One message per connection per day, whatever the channel ──
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

    // ── Which channels does this user actually have? ──
    const [{ data: profile }, { data: waSession }, { data: tgSession }] = await Promise.all([
      supabase
        .from('profiles')
        .select('email, first_name, full_name')
        .eq('id', c.user_id)
        .maybeSingle(),
      supabase
        .from('whatsapp_sessions')
        .select('whatsapp_phone')
        .eq('user_id', c.user_id)
        .eq('is_active', true)
        .is('opted_out_at', null)
        .maybeSingle(),
      supabase
        .from('telegram_sessions')
        .select('telegram_chat_id')
        .eq('user_id', c.user_id)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    // Tier is read here, not assumed from the template registry. The
    // old code called sendWhatsAppTemplate directly, which never reads
    // tier, so the registry's proOnly flag did nothing on this path.
    const tier = await getEffectiveTier(c.user_id);
    const choice = pickReminderChannel({
      tier,
      isPro: isAtLeastPro(tier),
      whatsappPhone: (waSession?.whatsapp_phone as string | null) ?? null,
      telegramChatId: (tgSession?.telegram_chat_id as number | null) ?? null,
      email: (profile?.email as string | null) ?? null,
    });

    if (!choice) {
      record(null, 'user has no email, Telegram or eligible WhatsApp channel', false);
      continue;
    }

    if (opts.dryRun) {
      record(choice.channel, `${choice.reason} (dry run — nothing sent)`, false);
      continue;
    }

    const firstName =
      ((profile?.first_name as string | null) ||
        (profile?.full_name as string | null) ||
        '')
        .toString()
        .trim()
        .split(/\s+/)[0] || '';

    let sent = false;
    try {
      if (choice.channel === 'whatsapp') {
        const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
        const res = await sendWhatsAppTemplate({
          to: waSession!.whatsapp_phone as string,
          templateName: 'paybacker_reconnect_required',
          parameters: [bankName, RENEW_URL],
        });
        // sendWhatsAppTemplate resolves successfully for blocked,
        // deferred and suppressed sends, returning a synthetic
        // providerMessageId. Counting those as delivered is how the old
        // code overstated its WhatsApp numbers AND wrote a
        // notification_log row that permanently suppressed the retry.
        const id = (res as { providerMessageId?: string } | null)?.providerMessageId ?? '';
        sent = !/^(blocked|deferred|suppressed):/.test(id);
        if (!sent) {
          record(choice.channel, `WhatsApp send was ${id.split(':')[0]} — will retry tomorrow`, false);
          continue;
        }
      } else if (choice.channel === 'telegram') {
        const { sendProactiveAlert } = await import('@/lib/telegram/user-bot');
        const label =
          daysLeft > 0
            ? `Your ${bankName} connection expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
            : daysLeft === 0
              ? `Your ${bankName} connection expires today`
              : `Your ${bankName} connection has stopped`;
        await sendProactiveAlert({
          chatId: tgSession!.telegram_chat_id as number,
          issue: {
            id: c.id,
            title: `🔐 ${label}`,
            detail:
              daysLeft >= 0
                ? `UK rules mean we have to ask you to confirm every 90 days. It takes one tap and you will not need to log in to your bank: ${RENEW_URL}`
                : `We have paused reading your ${bankName} transactions until you confirm. One tap restores it, no bank login needed: ${RENEW_URL}`,
            amount_impact: null,
            issue_type: 'consent_renewal',
          },
        });
        sent = true;
      } else {
        const { sendConsentRenewalReminderEmail } = await import(
          '@/lib/email/consent-renewal-reminder'
        );
        sent = await sendConsentRenewalReminderEmail(profile!.email as string, firstName, {
          bankName,
          daysLeft,
        });
        if (!sent) {
          // Don't log — a transient Resend failure should retry
          // tomorrow rather than being suppressed for good.
          record(choice.channel, 'email provider reported failure — will retry tomorrow', false);
          continue;
        }
      }

      await supabase.from('notification_log').insert({
        user_id: c.user_id,
        notification_type: REMINDER_NOTIFICATION_TYPE,
        reference_key: refKey,
      });
      record(choice.channel, choice.reason, true);
    } catch (e) {
      console.warn(
        `[consent-reminders] ${choice.channel} send failed for connection=${c.id}`,
        e,
      );
      record(choice.channel, `send threw: ${e instanceof Error ? e.message : 'unknown'}`, false);
    }
  }

  return result;
}
