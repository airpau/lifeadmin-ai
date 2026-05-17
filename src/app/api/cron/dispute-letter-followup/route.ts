/**
 * Dispute letter follow-up cron.
 *
 * Runs every 30 minutes. Three stages per tick:
 *
 *   1. Auto-expire stale pending_dispute_letters rows (>48h
 *      unresolved). Sends a final "expired" note.
 *
 *   2. 1-hour follow-up nudge for pending drafts:
 *        "📤 Did you send the [provider] letter? Reply SAVE to log
 *         it and start the 14-day clock, DISCARD to drop it, or tell
 *         me what to change."
 *      Stamps followup_sent_at so it only fires once.
 *
 *   3. 14-day stall alert (added 2026-05-17). Finds disputes still in
 *      open / awaiting_user_input / draft with no updated_at movement
 *      for ≥14 days and sends a WhatsApp / Telegram nudge via the
 *      paybacker_dispute_agent_action template. Dedups on
 *      disputes.stall_alert_sent_at — re-alerts at most once per 7
 *      days. Skips test/QA accounts (src/lib/test-accounts.ts).
 *
 * Why this exists: Paul flagged 2026-04-29 that users draft a letter
 * via the bot, copy + email externally, then never come back to say
 * "I've sent it". Stage 3 was added later because the resulting open
 * disputes were silently going cold once the supplier stalled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppText } from '@/lib/whatsapp';
import {
  dispatchPocketAgentAlert,
  listActivePocketAgentSessions,
  type ActiveSession,
} from '@/lib/pocket-agent/dispatch';
import { isTestAccount } from '@/lib/test-accounts';

export const runtime = 'nodejs';
export const maxDuration = 120;

const AGENT_ID = 'dispute-letter-followup';
const EXPIRE_AFTER_HOURS = 48;
// 14-day stall sweep — disputes sitting in 'open' / 'awaiting_user_input'
// / 'draft' for this long without movement get a WhatsApp/Telegram nudge.
// 'open' is on disputes.status; 'awaiting_user_input' and 'draft' are on
// the agent_state column added by 20260501100000_dispute_agent.sql. We
// match on the union of both.
const STALL_THRESHOLD_DAYS = 14;
// Re-alert cadence once a dispute first hits the threshold. Without
// this dedup the cron (runs every 30 min) would WhatsApp the user 48x/day.
const STALL_REALERT_DAYS = 7;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function sendTelegram(chatId: number | string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (res.ok) return true;
    // Retry without Markdown on parse errors
    const retry = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text }),
    });
    return retry.ok;
  } catch (err) {
    console.error('[dispute-letter-followup] Telegram send failed', err);
    return false;
  }
}

interface PendingLetter {
  id: string;
  user_id: string;
  dispute_id: string;
  letter_title: string | null;
  channel: string;
  drafted_at: string;
}

async function getProviderName(supabase: ReturnType<typeof getAdmin>, disputeId: string): Promise<string> {
  const { data } = await supabase
    .from('disputes')
    .select('provider_name')
    .eq('id', disputeId)
    .single();
  return data?.provider_name || 'your supplier';
}

/**
 * Returns true when there is strong evidence the user has already
 * actioned this draft, so the 1-hour "did you send the letter?" nudge
 * would be a confusing duplicate.
 *
 * Bug Paul flagged 2026-05-16: he replied SAVE in WhatsApp, got the
 * "Letter saved to your OneStream dispute timeline" confirmation, and
 * an hour later the cron asked again — because the LLM sometimes
 * replies inline ("Letter saved…") without actually calling the
 * `record_letter_sent` tool, leaving pending_dispute_letters.status
 * stuck on 'pending'. We now check the dispute itself for evidence:
 *
 *   1. A new ai_letter correspondence row inserted after drafted_at,
 *   2. last_letter_sent_at >= drafted_at (set by recordLetterSent),
 *   3. dispute moved past 'open' / 'draft' into awaiting_response,
 *      escalated, or any terminal state (resolved_*, closed,
 *      withdrawn, dismissed, dropped).
 *
 * Any one of these means the user already moved on — don't re-ask.
 */
async function alreadyHandled(
  supabase: ReturnType<typeof getAdmin>,
  disputeId: string,
  draftedAt: string,
): Promise<boolean> {
  // 1. Look for an ai_letter correspondence row created since the draft.
  const { count: letterCount } = await supabase
    .from('correspondence')
    .select('id', { count: 'exact', head: true })
    .eq('dispute_id', disputeId)
    .eq('entry_type', 'ai_letter')
    .gte('created_at', draftedAt);
  if ((letterCount ?? 0) > 0) return true;

  // 2 + 3. Dispute status / last_letter_sent_at probe.
  const { data: dispute } = await supabase
    .from('disputes')
    .select('status, last_letter_sent_at')
    .eq('id', disputeId)
    .maybeSingle();
  if (!dispute) return false;

  const terminalOrInFlight = new Set([
    'awaiting_response',
    'escalated',
    'resolved_won',
    'resolved_partial',
    'resolved_lost',
    'closed',
    'withdrawn',
    'dismissed',
    'dropped',
    'won',
    'partial',
    'lost',
  ]);
  if (terminalOrInFlight.has(dispute.status ?? '')) return true;

  if (dispute.last_letter_sent_at && new Date(dispute.last_letter_sent_at) >= new Date(draftedAt)) {
    return true;
  }

  return false;
}

function buildFollowupCopy(provider: string): string {
  return (
    `📤 Did you send the *${provider}* letter via email?\n\n` +
    `• Reply *SAVE* — I'll log it on your dispute timeline + start the 14-day clock for escalation.\n` +
    `• Reply *DISCARD* — drop the draft, no record kept.\n` +
    `• Or tell me what to change and I'll redraft.`
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const expireBefore = new Date(now.getTime() - EXPIRE_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  // 1. Auto-expire stale drafts (>48h, never resolved). Sends a
  // final "expired" note so the user knows the draft was dropped.
  const { data: expiring } = await supabase
    .from('pending_dispute_letters')
    .update({ status: 'expired', resolved_at: now.toISOString() })
    .eq('status', 'pending')
    .lt('drafted_at', expireBefore)
    .select('id, user_id, dispute_id, letter_title, channel');

  let expired = 0;
  for (const row of expiring ?? []) {
    expired++;
    const provider = await getProviderName(supabase, row.dispute_id);
    const text =
      `⏰ The draft for *${provider}* (${row.letter_title || 'untitled'}) has been dropped after 48 hours with no save/discard reply.\n\n` +
      `If you sent it after all, reply: *I sent the ${provider} letter on [date]* and I'll backfill it.`;
    await dispatchToUser(supabase, row.user_id, row.channel, text);
  }

  // 2. Find drafts due for the 1-hour follow-up.
  const { data: due, error } = await supabase
    .from('pending_dispute_letters')
    .select('id, user_id, dispute_id, letter_title, channel, drafted_at')
    .eq('status', 'pending')
    .lte('followup_due_at', now.toISOString())
    .is('followup_sent_at', null)
    .limit(50);

  if (error) {
    console.error(`[${AGENT_ID}] query failed`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  let autoResolved = 0;
  for (const row of (due as PendingLetter[]) ?? []) {
    // Re-check the dispute right before dispatching — the user may have
    // already SAVED via the bot since this row was queued. Without this
    // probe the LLM-misses-the-tool-call case produces a duplicate
    // "did you send the letter?" message an hour after the inline
    // "Letter saved" confirmation (Paul flagged 2026-05-16, OneStream).
    if (await alreadyHandled(supabase, row.dispute_id, row.drafted_at)) {
      await supabase
        .from('pending_dispute_letters')
        .update({
          status: 'saved',
          resolved_at: now.toISOString(),
          followup_sent_at: now.toISOString(),
        })
        .eq('id', row.id)
        .eq('status', 'pending');
      autoResolved++;
      continue;
    }

    const provider = await getProviderName(supabase, row.dispute_id);
    const text = buildFollowupCopy(provider);
    const ok = await dispatchToUser(supabase, row.user_id, row.channel, text);
    if (ok) {
      await supabase
        .from('pending_dispute_letters')
        .update({ followup_sent_at: now.toISOString() })
        .eq('id', row.id);
      sent++;
    } else {
      skipped++;
    }
  }

  // ── Stage 3: 14-day stall sweep ────────────────────────────────────
  // Finds disputes that have been in open / awaiting_user_input / draft
  // for ≥14 days with no updated_at movement, where we either never
  // sent a stall nudge or sent the last one ≥7 days ago. Re-uses the
  // already-Meta-approved paybacker_dispute_agent_action template via
  // dispatchPocketAgentAlert so we send through WhatsApp even outside
  // the 24h session window (free-form sendWhatsAppText would silently
  // skip there). Telegram users get the rich text path.
  const stallResult = await runStallSweep(supabase);

  await supabase.from('business_log').insert({
    category: sent > 0 || stallResult.alerted > 0 ? 'action' : 'milestone',
    title: 'Dispute letter follow-up sweep',
    content:
      `Sent ${sent} follow-ups, expired ${expired} drafts, ` +
      `auto-resolved ${autoResolved} (already actioned), skipped ${skipped}. ` +
      `Stall sweep: ${stallResult.alerted} alerted, ${stallResult.skippedTest} test, ` +
      `${stallResult.skippedNoSession} no session, ${stallResult.errors} errors.`,
    created_by: AGENT_ID,
  });

  return NextResponse.json({
    ok: true,
    sent,
    expired,
    autoResolved,
    skipped,
    stall: stallResult,
  });
}

interface StalledDispute {
  id: string;
  user_id: string;
  provider_name: string | null;
  merchant_normalised: string | null;
  status: string | null;
  agent_state: string | null;
  updated_at: string;
}

interface StallSweepResult {
  considered: number;
  alerted: number;
  skippedTest: number;
  skippedNoSession: number;
  errors: number;
}

async function runStallSweep(
  supabase: ReturnType<typeof getAdmin>,
): Promise<StallSweepResult> {
  const now = new Date();
  const stalledBefore = new Date(now.getTime() - STALL_THRESHOLD_DAYS * 86_400_000).toISOString();
  const reAlertBefore = new Date(now.getTime() - STALL_REALERT_DAYS * 86_400_000).toISOString();

  // Pull candidates. updated_at must be 14+ days old AND the dispute
  // must be in a stall-prone state: status='open' OR agent_state in
  // ('draft','awaiting_user_input'). The dedup on stall_alert_sent_at
  // is applied in JS because Supabase's .or() doesn't compose neatly
  // with a NULL-or-old check. Row count is bounded by the partial
  // index in 20260517110000_disputes_stall_alert_sent_at.sql.
  const { data: rows, error } = await supabase
    .from('disputes')
    .select(
      'id, user_id, provider_name, merchant_normalised, status, agent_state, updated_at, stall_alert_sent_at, archived_at',
    )
    .or('status.eq.open,agent_state.in.(draft,awaiting_user_input)')
    .lt('updated_at', stalledBefore)
    .is('archived_at', null)
    .limit(200);

  if (error) {
    console.error('[dispute-letter-followup] stall sweep query failed', error.message);
    return { considered: 0, alerted: 0, skippedTest: 0, skippedNoSession: 0, errors: 1 };
  }

  const candidates = (rows ?? []).filter((r) => {
    const stamp = (r as { stall_alert_sent_at: string | null }).stall_alert_sent_at;
    return !stamp || stamp < reAlertBefore;
  }) as StalledDispute[];

  if (candidates.length === 0) {
    return { considered: 0, alerted: 0, skippedTest: 0, skippedNoSession: 0, errors: 0 };
  }

  // Pre-load profile emails so we can filter out QA accounts in one go.
  const userIds = Array.from(new Set(candidates.map((c) => c.user_id)));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds);
  const emailById = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.id as string, (p as { email: string | null }).email]),
  );

  // Pre-load active Pocket Agent sessions so we don't re-query per dispute.
  const sessions = await listActivePocketAgentSessions(supabase);
  const sessionByUser = new Map<string, ActiveSession>(
    sessions.map((s) => [s.user_id, s]),
  );

  let alerted = 0;
  let skippedTest = 0;
  let skippedNoSession = 0;
  let errors = 0;

  for (const d of candidates) {
    // Excluded test/QA accounts — they pollute WhatsApp delivery metrics
    // and Twilio cost. The set lives in src/lib/test-accounts.ts.
    if (isTestAccount(emailById.get(d.user_id))) {
      skippedTest++;
      continue;
    }
    const session = sessionByUser.get(d.user_id);
    if (!session) {
      // User has no Pocket Agent session (no Telegram or WhatsApp wired
      // up). Nothing to send — bail without stamping so we re-check on
      // the next run in case they connect.
      skippedNoSession++;
      continue;
    }

    const daysStalled = Math.floor(
      (Date.now() - new Date(d.updated_at).getTime()) / 86_400_000,
    );
    const merchant = d.provider_name || d.merchant_normalised || 'your dispute';
    const summary =
      `No movement in ${daysStalled} days — chase the supplier or escalate before it goes cold`;
    const cta = 'review and act';
    // Prefer the agent_state label when set (it's more specific —
    // 'draft' vs 'awaiting_user_input') and fall back to status.
    const stateLabel = d.agent_state || d.status || 'open';

    try {
      const result = await dispatchPocketAgentAlert({
        session,
        alertType: 'dispute_agent_action',
        detectedIssueId: d.id,
        telegram: {
          title: `Stalled dispute: ${merchant}`,
          detail:
            `Your ${merchant} dispute has been sitting in *${stateLabel}* for ${daysStalled} days. ` +
            `Suppliers stall hoping you give up — a chase letter or ombudsman escalation usually unblocks it. ` +
            `Open Paybacker to review the next step.`,
          recommendation: cta,
        },
        whatsappVars: {
          merchant,
          action_summary: summary,
          cta,
        },
      });
      if (result.ok) {
        await supabase
          .from('disputes')
          .update({ stall_alert_sent_at: now.toISOString() })
          .eq('id', d.id);
        alerted++;
      } else {
        errors++;
        console.warn('[dispute-letter-followup] stall alert dispatch failed', d.id, result.error);
      }
    } catch (err) {
      errors++;
      console.error('[dispute-letter-followup] stall alert threw', d.id, err);
    }
  }

  return {
    considered: candidates.length,
    alerted,
    skippedTest,
    skippedNoSession,
    errors,
  };
}

async function dispatchToUser(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  channel: string,
  text: string,
): Promise<boolean> {
  if (channel === 'telegram') {
    const { data: session } = await supabase
      .from('telegram_sessions')
      .select('telegram_chat_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (!session?.telegram_chat_id) return false;
    return sendTelegram(session.telegram_chat_id, text);
  }
  if (channel === 'whatsapp') {
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('whatsapp_phone, last_message_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (!session?.whatsapp_phone) return false;
    // 24h session window check — WhatsApp free-form only works
    // within 24h of the user's last inbound. Outside that window
    // we'd need a Meta-approved template; skip rather than fail.
    if (session.last_message_at) {
      const hoursSince = (Date.now() - new Date(session.last_message_at).getTime()) / 3_600_000;
      if (hoursSince > 24) {
        return false;
      }
    }
    try {
      await sendWhatsAppText({ to: session.whatsapp_phone, text });
      // Log so the bot's history loader sees this outbound on the
      // next inbound — Claude can then interpret SAVE / DISCARD in
      // context.
      await supabase.from('whatsapp_message_log').insert({
        user_id: userId,
        whatsapp_phone: session.whatsapp_phone,
        direction: 'outbound',
        message_type: 'text',
        message_text: text,
        provider: 'twilio',
      });
      return true;
    } catch (err) {
      console.error('[dispute-letter-followup] whatsapp send failed', err);
      return false;
    }
  }
  // chatbot: no proactive push channel — user has to come back to the page
  return false;
}
