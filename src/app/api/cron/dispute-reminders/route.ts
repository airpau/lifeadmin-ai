/**
 * Dispute Follow-Up Reminders Cron
 *
 * Runs daily at 9am UTC. For each user with Telegram linked, checks all active
 * disputes and sends nudges based on age:
 *
 * - 14+ days old, no reminder in last 7 days:
 *     "Have you heard back? Here's how to follow up."
 * - 30+ days old, no reminder in last 7 days:
 *     Stronger nudge to escalate to ombudsman/regulator.
 *
 * Deduplicates via disputes.last_reminder_sent — max one reminder per
 * dispute per 7 days. Reminder count is incremented on each send.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendProactiveAlert } from '@/lib/telegram/user-bot';
import { canSendEmail } from '@/lib/email-rate-limit';
import { sendDisputeReminderEmail } from '@/lib/email/dispute-reminders';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ACTIVE_STATUSES = ['open', 'awaiting_response', 'escalated'];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const results: Array<{ userId: string; disputeId: string; type: string; emailSent: boolean; telegramSent: boolean }> = [];

  const cutoff14 = new Date(now.getTime() - FOURTEEN_DAYS_MS).toISOString();

  // Fetch all active disputes that are at least 14 days old, join with profiles
  const { data: disputes, error: disputesErr } = await supabase
    .from('disputes')
    .select(`
      id, user_id, provider_name, status, created_at, last_reminder_sent, reminder_count, disputed_amount,
      profiles:user_id ( id, email, first_name, full_name )
    `)
    .in('status', ACTIVE_STATUSES)
    .lte('created_at', cutoff14)
    .order('created_at', { ascending: true });

  if (disputesErr || !disputes || disputes.length === 0) {
    return NextResponse.json({ ok: true, message: 'No stale disputes found', sent: 0 });
  }

  const userIds = [...new Set(disputes.map((d) => d.user_id))];
  
  // Get Telegram sessions for those users
  const { data: sessions } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .in('user_id', userIds)
    .eq('is_active', true);

  const sessionMap = new Map((sessions || []).map((s) => [s.user_id, Number(s.telegram_chat_id)]));

  for (const dispute of disputes) {
    // Skip if a reminder was sent within the last 7 days
    if (dispute.last_reminder_sent) {
      const lastSent = new Date(dispute.last_reminder_sent).getTime();
      if (now.getTime() - lastSent < SEVEN_DAYS_MS) continue;
    }

    const disputeAgeMs = now.getTime() - new Date(dispute.created_at).getTime();
    const isEscalation = disputeAgeMs >= THIRTY_DAYS_MS;
    const daysOld = Math.floor(disputeAgeMs / (24 * 60 * 60 * 1000));

    const amountStr = dispute.disputed_amount
      ? ` (£${Number(dispute.disputed_amount).toFixed(2)})`
      : '';

    let title: string;
    let detail: string;
    let recommendation: string;

    if (isEscalation) {
      title = `Your ${dispute.provider_name} dispute is ${daysOld} days old — time to escalate`;
      detail =
        `Your dispute with *${dispute.provider_name}*${amountStr} has been open for ${daysOld} days. ` +
        `Under UK consumer law, if a company has not resolved your complaint within 8 weeks you have the right to escalate to the relevant ombudsman or regulator free of charge.`;
      recommendation = `Ask me: "Escalate my ${dispute.provider_name} dispute" and I'll help you draft an ombudsman referral.`;
    } else {
      title = `Follow up on your ${dispute.provider_name} dispute`;
      detail =
        `Your dispute with *${dispute.provider_name}*${amountStr} was filed ${daysOld} days ago. ` +
        `Have you received a response? Most companies must acknowledge complaints within 5 working days.`;
      recommendation = `You can update the status in your dashboard, or ask me: "Help me follow up with ${dispute.provider_name}" for next steps.`;
    }

    let telegramSent = false;
    let emailSent = false;

    // 1. Send Telegram Alert if active session exists
    const chatId = sessionMap.get(dispute.user_id);
    if (chatId) {
      const { data: issue } = await supabase
        .from('detected_issues')
        .insert({
          user_id: dispute.user_id,
          issue_type: isEscalation ? 'dispute_escalation_due' : 'dispute_no_response',
          title,
          detail,
          recommendation,
          source_type: 'dispute',
          source_id: dispute.id,
          amount_impact: dispute.disputed_amount ?? null,
          telegram_chat_id: String(chatId),
          status: 'active',
        })
        .select('id')
        .single();

      if (issue) {
        const { ok, messageId } = await sendProactiveAlert({
          chatId,
          issue: {
            id: issue.id,
            title,
            detail,
            recommendation,
            amount_impact: dispute.disputed_amount ? Number(dispute.disputed_amount) : null,
            issue_type: isEscalation ? 'dispute_escalation_due' : 'dispute_no_response',
          },
          showFollowUpButtons: true,
        });

        if (ok) {
          telegramSent = true;
          if (messageId) {
            await supabase
              .from('detected_issues')
              .update({ telegram_message_id: messageId, delivered_at: now.toISOString() })
              .eq('id', issue.id);
          }
        }
      }
    }

    // 2. Send Email Reminder
    const profile = Array.isArray(dispute.profiles) ? dispute.profiles[0] : dispute.profiles;
    if (profile?.email) {
      const rateCheck = await canSendEmail(supabase, dispute.user_id, 'dispute_reminder_email');
      if (rateCheck.allowed) {
        const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';
        emailSent = await sendDisputeReminderEmail(
          profile.email,
          userName,
          {
            id: dispute.id,
            providerName: dispute.provider_name,
            daysOld,
            amount: dispute.disputed_amount ? Number(dispute.disputed_amount) : null,
          },
          isEscalation
        );

        if (emailSent) {
          await supabase.from('tasks').insert({
            user_id: dispute.user_id,
            type: 'dispute_reminder_email',
            title: `Dispute email: ${isEscalation ? 'escalation' : 'follow_up'} for ${dispute.provider_name}`,
            status: 'completed'
          });
        }
      }
    }

    // 3. Mark processed
    if (telegramSent || emailSent) {
      await supabase
        .from('disputes')
        .update({
          last_reminder_sent: now.toISOString(),
          reminder_count: (dispute.reminder_count ?? 0) + 1,
        })
        .eq('id', dispute.id);
    }

    results.push({
      userId: dispute.user_id,
      disputeId: dispute.id,
      type: isEscalation ? 'escalation' : 'follow_up',
      emailSent,
      telegramSent,
    });
  }

  const successfullySent = results.filter((r) => r.emailSent || r.telegramSent).length;
  console.log(
    `[dispute-reminders] Checked ${disputes.length} stale disputes — sent ${successfullySent} reminders (Email/Telegram)`,
  );

  return NextResponse.json({
    ok: true,
    disputes_checked: disputes.length,
    reminders_sent: successfullySent,
    results,
  });
}

