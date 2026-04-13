/**
 * Telegram alert queue helpers
 *
 * queueTelegramAlert  — add a finding to the pending queue (deduped by reference_key)
 * sendBatchedDigest   — read pending items and send as one batched message with
 *                       inline keyboard buttons — no website links, all actions in-bot
 *
 * Used by:
 *   - api/gmail/scan   (instead of fire-and-forget immediate send)
 *   - cron/telegram-price-increase-detection  (non-urgent increases ≤ £20/mo)
 *   - cron/telegram-alerts  (non-urgent detected issues)
 *   - cron/telegram-evening-summary  (flushes queue once per day)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PendingAlertParams {
  userId: string;
  chatId: number;
  alertType: string;
  providerName?: string;
  amount?: number;
  amountChange?: number;
  urgency?: 'urgent' | 'normal' | 'low';
  /** Dedup key — include provider + type + period (e.g. YYYY-MM) so the same
   *  item in a new month gets queued again naturally. */
  referenceKey: string;
  affiliateUrl?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Alert emoji map ────────────────────────────────────────────────────────────

const ALERT_EMOJI: Record<string, string> = {
  price_increase:        '🔴',
  bill_detected:         '🟡',
  upcoming_bill:         '🟡',
  renewal_imminent:      '🟡',
  subscription_detected: '🟢',
  deal_available:        '🟢',
  contract_expiring:     '🔴',
  budget_overrun:        '🔴',
  unused_subscription:   '🔵',
  dispute_response:      '📩',
};

function fmt(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

// ─── One-line summary for each alert type ──────────────────────────────────────

export function buildAlertLine(a: {
  alert_type: string;
  provider_name: string | null;
  amount: number | null;
  amount_change: number | null;
}): string {
  const emoji = ALERT_EMOJI[a.alert_type] ?? '📋';
  const provider = a.provider_name ?? 'Unknown';

  switch (a.alert_type) {
    case 'price_increase':
      return `${emoji} ${provider} — price increase (+${fmt(a.amount_change ?? 0)}/mo)`;
    case 'bill_detected':
    case 'upcoming_bill':
      return `${emoji} ${provider} — bill arriving soon${a.amount ? ` (${fmt(a.amount)})` : ''}`;
    case 'renewal_imminent':
      return `${emoji} ${provider} — renews soon${a.amount ? ` (${fmt(a.amount)}/mo)` : ''}`;
    case 'subscription_detected':
      return `${emoji} ${provider} — subscription detected${a.amount ? ` (${fmt(a.amount)}/mo)` : ''}`;
    case 'deal_available':
      return `${emoji} ${provider} — cheaper deal${a.amount_change ? `, save ${fmt(Math.abs(a.amount_change))}/mo` : ''}`;
    case 'contract_expiring':
      return `${emoji} ${provider} — contract expiring soon`;
    case 'budget_overrun':
      return `${emoji} ${provider} — budget exceeded by ${fmt(a.amount_change ?? 0)}`;
    case 'unused_subscription':
      return `${emoji} ${provider} — not used in 60+ days (${fmt(a.amount ?? 0)}/mo)`;
    case 'dispute_response':
      return `${emoji} ${provider} — supplier response received`;
    default:
      return `${emoji} ${provider}`;
  }
}

// ─── Inline button rows for each alert type ────────────────────────────────────

type TgButton = { text: string; callback_data?: string; url?: string };

export function buildActionButtons(
  alertId: string,
  alertType: string,
  affiliateUrl: string | null,
  amountChange: number | null,
): TgButton[][] {
  switch (alertType) {
    case 'price_increase':
      return [
        [
          { text: '⚡ Draft dispute letter', callback_data: `palert_draft_${alertId}` },
          { text: '✅ Accept increase',       callback_data: `palert_accept_${alertId}` },
        ],
        [{ text: '🔕 Dismiss', callback_data: `palert_dismiss_${alertId}` }],
      ];

    case 'subscription_detected':
      return [
        [
          { text: '➕ Add to subscriptions', callback_data: `palert_add_sub_${alertId}` },
          { text: '🔕 Dismiss',             callback_data: `palert_dismiss_${alertId}` },
        ],
      ];

    case 'deal_available':
      if (affiliateUrl) {
        return [
          [
            {
              text: `🔗 Switch & save${amountChange ? ` ${fmt(Math.abs(amountChange))}/mo →` : ' →'}`,
              url: affiliateUrl,
            },
            { text: '❓ Tell me more', callback_data: `palert_expand_${alertId}` },
          ],
          [{ text: '🔕 Not interested', callback_data: `palert_dismiss_${alertId}` }],
        ];
      }
      return [
        [
          { text: '❓ Compare deals', callback_data: `palert_expand_${alertId}` },
          { text: '🔕 Dismiss',       callback_data: `palert_dismiss_${alertId}` },
        ],
      ];

    case 'bill_detected':
    case 'upcoming_bill':
    case 'renewal_imminent':
      return [
        [
          { text: '✅ Already paid',   callback_data: `palert_paid_${alertId}` },
          { text: '⚡ Dispute bill',   callback_data: `palert_draft_${alertId}` },
        ],
        [{ text: '🔕 Dismiss', callback_data: `palert_dismiss_${alertId}` }],
      ];

    case 'contract_expiring':
      return [
        [
          { text: '📧 Cancellation email', callback_data: `palert_draft_${alertId}` },
          { text: '🔕 Dismiss',           callback_data: `palert_dismiss_${alertId}` },
        ],
      ];

    case 'dispute_response':
      return [
        [
          { text: '📩 View & respond', callback_data: `palert_expand_${alertId}` },
          { text: '🔕 Dismiss',        callback_data: `palert_dismiss_${alertId}` },
        ],
      ];

    default:
      return [
        [{ text: '🔕 Dismiss', callback_data: `palert_dismiss_${alertId}` }],
      ];
  }
}

// ─── queueTelegramAlert ─────────────────────────────────────────────────────────

/**
 * Add a finding to the pending alert queue.
 * Safe to call multiple times for the same item — deduped by (user_id, reference_key).
 * Returns true if newly queued, false if already queued or on error.
 */
export async function queueTelegramAlert(
  supabase: SupabaseClient,
  params: PendingAlertParams,
): Promise<boolean> {
  const { error } = await supabase
    .from('telegram_pending_alerts')
    .insert({
      user_id:          params.userId,
      telegram_chat_id: params.chatId,
      alert_type:       params.alertType,
      provider_name:    params.providerName ?? null,
      amount:           params.amount ?? null,
      amount_change:    params.amountChange ?? null,
      urgency:          params.urgency ?? 'normal',
      reference_key:    params.referenceKey,
      affiliate_url:    params.affiliateUrl ?? null,
      source_id:        params.sourceId ?? null,
      metadata:         params.metadata ?? null,
    });

  if (error) {
    if (error.code === '23505') return false; // unique constraint = already queued
    console.error('[queueTelegramAlert]', error.message);
    return false;
  }
  return true;
}

// ─── sendBatchedDigest ──────────────────────────────────────────────────────────

/**
 * Flush all pending alerts for a user into a single batched digest message.
 * Marks all flushed alerts as status='sent'.
 * Called by the evening summary cron once per day.
 *
 * Single alert  → direct message with full action buttons.
 * Multiple alerts → numbered list + number buttons to expand each item.
 */
export async function sendBatchedDigest(
  supabase: SupabaseClient,
  chatId: number,
  userId: string,
): Promise<{ sent: boolean; count: number }> {
  const token = process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: false, count: 0 };

  const { data: alerts, error } = await supabase
    .from('telegram_pending_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('queued_at', { ascending: true })
    .limit(10);

  if (error || !alerts || alerts.length === 0) return { sent: false, count: 0 };

  const TGAPI = `https://api.telegram.org/bot${token}`;

  // ── Single alert: send with full action buttons ──────────────────────────────
  if (alerts.length === 1) {
    const a = alerts[0];
    const text = `📋 *Money alert*\n\n${buildAlertLine(a)}`;
    const res = await fetch(`${TGAPI}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:      chatId,
        text,
        parse_mode:   'Markdown',
        reply_markup: { inline_keyboard: buildActionButtons(a.id, a.alert_type, a.affiliate_url, a.amount_change) },
      }),
    }).then(r => r.json() as Promise<{ ok: boolean }>);

    if (res.ok) {
      await supabase
        .from('telegram_pending_alerts')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', a.id);
      return { sent: true, count: 1 };
    }
    return { sent: false, count: 0 };
  }

  // ── Multiple alerts: numbered list + per-item expand buttons ─────────────────
  const lines = alerts.map((a, i) => `${i + 1}. ${buildAlertLine(a)}`);
  const count = alerts.length;
  const text =
    `📋 *Your daily money update*\n\n` +
    `💡 *${count} thing${count !== 1 ? 's' : ''} need your attention:*\n\n` +
    lines.join('\n') +
    `\n\n_Tap a number to handle each item_`;

  // Number buttons grouped 4 per row, then Dismiss all
  const keyboard: TgButton[][] = [];
  for (let i = 0; i < alerts.length; i += 4) {
    keyboard.push(
      alerts.slice(i, Math.min(i + 4, alerts.length)).map((a, j) => ({
        text: String(i + j + 1),
        callback_data: `palert_expand_${a.id}`,
      })),
    );
  }
  keyboard.push([{ text: '🔕 Dismiss all', callback_data: 'palert_dismiss_all' }]);

  const res = await fetch(`${TGAPI}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:      chatId,
      text,
      parse_mode:   'Markdown',
      reply_markup: { inline_keyboard: keyboard },
    }),
  }).then(r => r.json() as Promise<{ ok: boolean }>);

  if (res.ok) {
    await supabase
      .from('telegram_pending_alerts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .in('id', alerts.map(a => a.id));
    return { sent: true, count };
  }
  return { sent: false, count: 0 };
}
