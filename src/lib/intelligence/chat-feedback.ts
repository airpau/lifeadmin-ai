/**
 * Phase 2 — recordChatFeedback helper.
 *
 * Called from the inbound webhook when a short reply is classified as
 * 👍/👎 by feedback-classifier. Finds the most recent chat_reply_sent
 * event for this user (within the last hour) and writes the outcome.
 *
 * Mirrors recordAlertEngagement in src/lib/whatsapp/user-bot.ts. We
 * keep it channel-agnostic so Telegram and WhatsApp can share it.
 */

import { createClient } from '@supabase/supabase-js';
import { recordOutcome } from '@/lib/intelligence';
import type { ChatFeedback } from './feedback-classifier';

const LOOKBACK_MINUTES = 60;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function recordChatFeedback(
  userId: string,
  feedback: ChatFeedback,
  rawText?: string,
): Promise<{ matched: boolean; eventId?: string }> {
  if (!feedback) return { matched: false };

  try {
    const supabase = admin();
    if (!supabase) return { matched: false };
    const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

    const { data: rows } = await supabase
      .from('intelligence_events')
      .select('id')
      .eq('user_id', userId)
      .eq('action_kind', 'chat_reply_sent')
      .is('outcome_kind', null)
      .gte('emitted_at', since)
      .order('emitted_at', { ascending: false })
      .limit(1);

    const eventId = (rows ?? [])[0]?.id;
    if (!eventId) return { matched: false };

    await recordOutcome({
      eventId,
      outcomeKind: feedback,
      outcome: {
        feedback_source: 'inbound_chat_reply',
        raw_text: rawText?.slice(0, 200) ?? null,
      },
    });
    return { matched: true, eventId };
  } catch (err) {
    console.warn('[intelligence/chat_feedback] non-fatal:', err);
    return { matched: false };
  }
}
