/**
 * Phase 3 — Pocket Agent churn-reason reply classifier.
 *
 * Detects a one-word reply naming a cancellation reason. Fires
 * fire-and-forget from the WhatsApp + Telegram inbound webhooks
 * alongside the existing alert-engagement and chat-feedback hooks.
 *
 * Detection is conservative — ≤ 4 words and an exact match against
 * the four reason aliases. Anything longer is treated as a real
 * message and not as a reason.
 */

import { createClient } from '@supabase/supabase-js';

export type ChurnReason = 'price' | 'feature' | 'competitor' | 'other';

const REASON_LOOKUP: Record<string, ChurnReason> = {
  // canonical
  price: 'price',
  feature: 'feature',
  competitor: 'competitor',
  other: 'other',
  // common aliases
  expensive: 'price',
  'too expensive': 'price',
  cost: 'price',
  features: 'feature',
  missing: 'feature',
  switched: 'competitor',
  alternative: 'competitor',
  'not using': 'other',
  unused: 'other',
};

const MAX_WORDS = 4;

export function classifyChurnReason(text: string): ChurnReason | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_WORDS) return null;
  if (REASON_LOOKUP[trimmed]) return REASON_LOOKUP[trimmed];
  return null;
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const LOOKBACK_HOURS = 48;

/**
 * Attribute a churn reason to the user's most-recent unmeasured
 * churn_prompted event (48-hour window). Also writes a dedicated
 * churn_recorded event for the digest aggregator. Fire-and-forget.
 */
export async function recordChurnReason(
  userId: string,
  reason: ChurnReason,
  rawText?: string,
): Promise<{ matched: boolean }> {
  const sb = admin();
  if (!sb) return { matched: false };
  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const { data: rows } = await sb
      .from('intelligence_events')
      .select('id')
      .eq('user_id', userId)
      .eq('action_kind', 'churn_prompted')
      .is('outcome_kind', null)
      .gte('emitted_at', since)
      .order('emitted_at', { ascending: false })
      .limit(1);
    const event = rows?.[0];
    const now = new Date().toISOString();
    if (event) {
      await sb
        .from('intelligence_events')
        .update({
          outcome_kind: 'churned',
          outcome: { reason, source: 'pocket_agent_reply', raw_text: rawText?.slice(0, 200) ?? null },
          measured_at: now,
        })
        .eq('id', event.id);
    }
    await sb.from('intelligence_events').insert({
      user_id: userId,
      actor: 'user',
      action_kind: 'churn_recorded',
      subject_kind: 'churn',
      subject_id: userId,
      outcome_kind: 'churned',
      outcome: {
        reason,
        source: 'pocket_agent_reply',
        prompt_event_id: event?.id ?? null,
      },
      measured_at: now,
    });
    return { matched: true };
  } catch (err) {
    console.warn('[intelligence/churn_reply] non-fatal:', err);
    return { matched: false };
  }
}
