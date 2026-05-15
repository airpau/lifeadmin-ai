// src/app/api/telegram/audit-actions/route.ts
//
// Callback handler invoked by the existing Telegram webhook when it receives
// a callback_query whose data starts with "audit:". This file is the dispatcher
// for "fix this finding" buttons sent by the daily-audit cron.
//
// Wire-in instructions:
// In your existing Telegram webhook (likely src/app/api/telegram/webhook/route.ts),
// add a branch like:
//
//   if (update.callback_query?.data?.startsWith('audit:')) {
//     return fetch(new URL('/api/telegram/audit-actions', req.url), {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ callback_query: update.callback_query }),
//     });
//   }
//
// Or — preferred — import { handleAuditCallback } and call it inline.

import { NextRequest, NextResponse } from 'next/server';
import { answerCallbackQuery, editTelegramMessage, getSupabaseAdmin } from '@/lib/telegram';

interface CallbackQuery {
  id: string;
  data: string;
  message: { message_id: number; chat: { id: number } };
  from: { id: number };
}

/**
 * Registry of audit action handlers. Each handler:
 *   - receives the matching pending_action payload
 *   - performs the fix (idempotent if possible)
 *   - returns a short status string to echo back to the user
 */
type Handler = (payload: Record<string, unknown>) => Promise<string>;

// Map button data → handler key. Most handlers map 1:1; correction-specific
// buttons embed the correction id in the callback_data (audit:compliance_apply_correction:<uuid>)
function parseAction(callbackData: string): { actionId: string; param?: string } {
  const stripped = callbackData.slice('audit:'.length);
  const colon = stripped.indexOf(':');
  if (colon === -1) return { actionId: stripped };
  return { actionId: stripped.slice(0, colon), param: stripped.slice(colon + 1) };
}

const HANDLERS: Record<string, Handler> = {
  fix_backfill_recovered_gbp: async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('disputes')
      .update({ recovered_amount_gbp: null }) // overwritten by trigger / SQL below
      .is('recovered_amount_gbp', null)
      .gt('money_recovered', 0)
      .in('status', ['resolved_won'])
      .select('id');
    if (error) return `❌ backfill failed: ${error.message}`;
    // Real backfill via SQL since the column is computed from money_recovered + currency
    const { error: sqlError } = await admin.rpc('audit_backfill_recovered_gbp');
    if (sqlError) return `❌ backfill failed: ${sqlError.message}`;
    return `✅ backfilled ${data?.length ?? 0} dispute(s)`;
  },

  fix_reappearing_dismissed_alerts: async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('audit_dismiss_reappearing_alerts');
    if (error) return `❌ dismiss failed: ${error.message}`;
    return `✅ re-dismissed ${data ?? 0} alert(s)`;
  },

  clear_won_dispute_unread_counts: async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('disputes')
      .update({ unread_reply_count: 0 })
      .in('status', ['resolved_won', 'resolved_lost', 'closed'])
      .gt('unread_reply_count', 0)
      .select('id');
    if (error) return `❌ clear failed: ${error.message}`;
    return `✅ cleared unread count on ${data?.length ?? 0} dispute(s)`;
  },

  // ---------- compliance handlers ----------

  // Bulk-ack high-confidence corrections that have no proposed content.
  // Quiets the daily-email noise from "this statute might have changed" alerts
  // where the verifier didn't actually propose a fix.
  compliance_ack_no_content: async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('audit_bulk_ack_no_content_corrections');
    if (error) return `❌ bulk ack failed: ${error.message}`;
    return `✅ acknowledged ${data ?? 0} high-confidence still-current correction(s)`;
  },

  // Apply a single correction by id. Expects payload.correction_id.
  compliance_apply_correction: async (payload) => {
    const correctionId = payload.correction_id as string | undefined;
    if (!correctionId) return '❌ missing correction_id';
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('audit_apply_correction', {
      p_correction_id: correctionId,
    });
    if (error) return `❌ apply failed: ${error.message}`;
    const result = data as { ok: boolean; reason?: string };
    return result.ok ? `✅ correction applied` : `⚠️ skipped (${result.reason})`;
  },

  // Snooze a single correction so it stops appearing in the daily digest.
  compliance_snooze_correction: async (payload) => {
    const correctionId = payload.correction_id as string | undefined;
    if (!correctionId) return '❌ missing correction_id';
    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc('audit_snooze_correction', {
      p_correction_id: correctionId,
    });
    if (error) return `❌ snooze failed: ${error.message}`;
    return `💤 correction snoozed`;
  },
};

export async function POST(req: NextRequest) {
  const { callback_query } = (await req.json()) as { callback_query: CallbackQuery };
  if (!callback_query?.data?.startsWith('audit:')) {
    return NextResponse.json({ skipped: true });
  }

  const admin = getSupabaseAdmin();
  const { actionId, param } = parseAction(callback_query.data);
  const chatId = callback_query.message.chat.id;

  // Handle the two "non-fix" actions inline
  if (actionId === 'snooze') {
    await answerCallbackQuery(admin, callback_query.id, 'Snoozed for 24h');
    return NextResponse.json({ ok: true });
  }
  if (actionId === 'show_details') {
    // TODO: fetch the full DAILY_HANDOFF.md and send it as a follow-up message
    await answerCallbackQuery(admin, callback_query.id, 'Sending details…');
    return NextResponse.json({ ok: true });
  }

  // Correction-specific actions carry the correction_id inline (audit:compliance_apply_correction:<uuid>).
  // For those we synthesise a payload from `param` and skip the pending_actions lookup.
  const inlinePayload =
    param && (actionId === 'compliance_apply_correction' || actionId === 'compliance_snooze_correction')
      ? { correction_id: param }
      : null;

  let payload: Record<string, unknown>;
  let pendingId: string | null = null;
  if (inlinePayload) {
    payload = inlinePayload;
  } else {
    // 1. Look up the pending action to get the payload + verify it's still valid
    const { data: pending, error } = await admin
      .from('telegram_pending_actions')
      .select('id, payload, expires_at')
      .eq('telegram_chat_id', chatId)
      .eq('action_type', actionId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !pending) {
      await answerCallbackQuery(admin, callback_query.id, '⌛ Action expired — re-run audit');
      return NextResponse.json({ ok: false, reason: 'no_pending_action' });
    }
    payload = pending.payload as Record<string, unknown>;
    pendingId = pending.id;
  }

  // 2. Dispatch
  const handler = HANDLERS[actionId];
  if (!handler) {
    await answerCallbackQuery(admin, callback_query.id, '❌ Unknown action');
    return NextResponse.json({ ok: false, reason: 'no_handler' });
  }

  const status = await handler(payload);

  // 3. Edit the original message to show "done"
  await editTelegramMessage(admin, {
    chatId,
    messageId: callback_query.message.message_id,
    text: `${status}\n\n_Action: ${actionId}_`,
  });
  await answerCallbackQuery(admin, callback_query.id, status.slice(0, 200));

  // 4. Consume the pending action (if there was one)
  if (pendingId) {
    await admin.from('telegram_pending_actions').delete().eq('id', pendingId);
  }

  return NextResponse.json({ ok: true, action: actionId, status });
}

