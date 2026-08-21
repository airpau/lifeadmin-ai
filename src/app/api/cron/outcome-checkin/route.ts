/**
 * Outcome check-in cron.
 *
 * Runs daily at 09:30 UTC (vercel.json). Users forget to mark disputes
 * as won, so recovered totals (homepage counter, dispute intelligence,
 * personal stats) go stale. This sweep finds disputes that have been
 * open for 14+ days and asks the user, on whatever channels they have
 * connected, whether the provider has replied or paid out.
 *
 * Selection (all via the service-role admin client):
 *   - status IN ('open','in_progress','awaiting_response','escalated','ombudsman')
 *   - created_at older than 14 days
 *   - outcome_checkin_last_at IS NULL OR older than 14 days
 *   - outcome_checkin_count < 3 (lifetime cap per dispute)
 *   - not archived; test/QA accounts excluded (src/lib/test-accounts.ts)
 *   - ordered by provider_first_response_at DESC NULLS LAST so disputes
 *     with recent provider activity (most likely to have resolved) are
 *     chased first when the batch cap bites
 *   - batch capped at 50 per run
 *
 * Delivery goes through the unified dispatcher (sendNotification) with
 * event 'outcome_check' so the user's channel preferences apply. The
 * per-user daily email cap is respected by gating the EMAIL PAYLOAD
 * only — when the cap mutes email, telegram / whatsapp / push still
 * send (same pattern as the price-increases cron).
 *
 * After any successful delivery the dispute is stamped in a single
 * update: outcome_checkin_count + 1 and outcome_checkin_last_at = now.
 * Columns added by 20260820131000_dispute_outcome_checkins.sql.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import { isTestAccount } from '@/lib/test-accounts';

export const runtime = 'nodejs';
export const maxDuration = 120;

const AGENT_ID = 'outcome-checkin';
const CHECKIN_STATUSES = ['open', 'in_progress', 'awaiting_response', 'escalated', 'ombudsman'];
const CHECKIN_AFTER_DAYS = 14;
const MAX_CHECKINS_PER_DISPUTE = 3;
const BATCH_CAP = 50;
const EMAIL_TYPE = 'outcome_checkin_email';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface CheckinDispute {
  id: string;
  user_id: string;
  provider_name: string | null;
  issue_type: string | null;
  dispute_type: string | null;
  disputed_amount: number | null;
  outcome_checkin_count: number;
  provider_first_response_at: string | null;
}

function buildEmailHtml(provider: string, body: string, ctaUrl: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <h2 style="font-size:20px;margin:0 0 12px;">Any news on your ${provider} dispute?</h2>
      <p style="font-size:15px;line-height:1.6;color:#334155;">${body}</p>
      <a href="${ctaUrl}" style="display:inline-block;margin-top:16px;background:#34d399;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Record the outcome</a>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px;">You are receiving this because you have an open dispute in Paybacker. Recording outcomes keeps your recovered total accurate.</p>
    </div>`;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const cutoff = new Date(now.getTime() - CHECKIN_AFTER_DAYS * 86_400_000).toISOString();
  const appUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';

  // Core selection: still-live disputes, 14+ days old, not chased in the
  // last 14 days, fewer than 3 lifetime check-ins. Ordering prefers
  // disputes where the provider has actually responded (most likely to
  // have quietly resolved) without excluding the silent ones.
  const { data: rows, error } = await supabase
    .from('disputes')
    .select(
      'id, user_id, provider_name, issue_type, dispute_type, disputed_amount, outcome_checkin_count, provider_first_response_at',
    )
    .in('status', CHECKIN_STATUSES)
    .lt('created_at', cutoff)
    .or(`outcome_checkin_last_at.is.null,outcome_checkin_last_at.lt.${cutoff}`)
    .lt('outcome_checkin_count', MAX_CHECKINS_PER_DISPUTE)
    .is('archived_at', null)
    .order('provider_first_response_at', { ascending: false, nullsFirst: false })
    .limit(BATCH_CAP);

  if (error) {
    console.error(`[${AGENT_ID}] selection query failed`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (rows ?? []) as CheckinDispute[];

  // Pre-load profile emails so test/QA accounts are filtered in one query.
  const userIds = Array.from(new Set(candidates.map((d) => d.user_id)));
  const emailById = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      emailById.set(p.id as string, (p as { email: string | null }).email);
    }
  }

  let checked = 0;
  let sent = 0;
  let skipped = 0;

  for (const d of candidates) {
    checked++;

    if (isTestAccount(emailById.get(d.user_id))) {
      skipped++;
      continue;
    }

    const provider = d.provider_name || 'your provider';
    const amount = typeof d.disputed_amount === 'number' && d.disputed_amount > 0
      ? d.disputed_amount.toFixed(2)
      : null;
    const title = `Any news on your ${provider} dispute?`;
    const body = amount
      ? `You disputed £${amount} with ${provider}. If they have replied or paid out, record the outcome so your totals stay right. It takes ten seconds.`
      : `Your dispute with ${provider} has been open a while. If they have replied or paid out, record the outcome so your totals stay right. It takes ten seconds.`;
    const ctaPath = `/dashboard/disputes?resolve=${d.id}`;
    const ctaUrl = `${appUrl}${ctaPath}`;

    // WhatsApp action label mirrors the whatsapp-alerts cron: strip
    // "_dispute" / "_complaint" so the approved paybacker_outcome_check
    // template ({{1}} merchant, {{2}} action type) reads naturally.
    const rawType = d.issue_type || d.dispute_type || 'dispute';
    const actionLabel = rawType
      .replace(/_dispute$|_complaint$/i, '')
      .replace(/_/g, ' ')
      .trim() || 'dispute';

    try {
      // Daily email cap: gate the email PAYLOAD, never the whole
      // dispatch — a muted email must not silence telegram/whatsapp/push.
      const rateCheck = await canSendEmail(supabase, d.user_id, EMAIL_TYPE);
      const emailAllowed = rateCheck.allowed;

      const result = await sendNotification(supabase, {
        userId: d.user_id,
        event: 'outcome_check',
        email: emailAllowed
          ? { subject: title, html: buildEmailHtml(provider, body, ctaUrl) }
          : undefined,
        telegram: {
          text:
            `📞 *${title}*\n\n${body}\n\n` +
            `Reply *WON*, *PARTIAL*, *REJECTED*, or *ONGOING* and I will update your case, ` +
            `or record it here: ${ctaUrl}`,
        },
        whatsapp: {
          templateName: 'paybacker_outcome_check',
          templateParameters: [provider, `${actionLabel} dispute`],
        },
        push: {
          title,
          body,
          deepLink: ctaPath,
        },
      });

      if (result.delivered.length > 0) {
        if (result.delivered.includes('email')) {
          await markEmailSent(supabase, d.user_id, EMAIL_TYPE, `Outcome check-in: ${provider}`);
        }
        // Single update: bump the counter and stamp the send time.
        await supabase
          .from('disputes')
          .update({
            outcome_checkin_count: d.outcome_checkin_count + 1,
            outcome_checkin_last_at: now.toISOString(),
          })
          .eq('id', d.id);
        sent++;
      } else {
        // No channel reachable (or all muted) — leave the dispute
        // unstamped so it is retried on the next run.
        skipped++;
      }
    } catch (err) {
      skipped++;
      console.error(`[${AGENT_ID}] dispatch failed for dispute ${d.id}`, err);
    }
  }

  await supabase.from('business_log').insert({
    category: sent > 0 ? 'action' : 'milestone',
    title: 'Dispute outcome check-in sweep',
    content: `Checked ${checked} disputes, sent ${sent} check-ins, skipped ${skipped}.`,
    created_by: AGENT_ID,
  });

  return NextResponse.json({ checked, sent, skipped });
}
