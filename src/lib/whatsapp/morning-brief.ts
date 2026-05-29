/**
 * WhatsApp morning-brief helper.
 *
 * Extracted from `/api/cron/telegram-morning-summary` (2026-05-03) so the
 * "Send test brief to me now" admin button can fire the exact same per-user
 * dispatch logic the daily cron uses. The cron continues to call
 * `dispatchWhatsAppMorningBrief` from this module — so any future tweak
 * to the WhatsApp routing (in-window text vs template fallback) lands in
 * one place.
 *
 * Public exports:
 *   - `dispatchWhatsAppMorningBrief(supabase, userId, phone, markdownBody)`
 *     — sends a pre-built brief body to a single user. Returns
 *     `{ status: 'sent' | 'skipped' | 'error', reason?, channel?, providerMessageId? }`.
 *   - `sendMorningBriefToUser(supabase, userId, options)` — high-level
 *     entry point used by the admin test-send route. Loads the user's
 *     whatsapp session, builds a tiny brief body, and dispatches.
 *   - `toWhatsAppPlainText`, `isInsideWhatsAppServiceWindow` — shared
 *     primitives the cron also needs.
 */

import { sendWhatsAppText, sendWhatsAppTemplate } from '@/lib/whatsapp';

/**
 * Recognise template-send failures that represent an *intentional* skip
 * (template not yet approved / runtime resolver returned no SID) rather
 * than an operational outage. The Twilio provider throws errors whose
 * messages contain "pending Meta resubmission" or "approval_status" when
 * the registry/DB layer deliberately bypasses the send.
 */
function isIntentionalTemplateSkip(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /pending Meta resubmission|approval_status|template not.*approved/i.test(msg);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminClient = any;

export type DispatchChannel = 'in_window' | 'template';
export interface DispatchOutcome {
  status: 'sent' | 'skipped' | 'error';
  reason?: string;
  channel?: DispatchChannel;
  providerMessageId?: string;
}

/**
 * Adapt the Telegram-flavoured Markdown brief for WhatsApp's free-form
 * text channel. WhatsApp DOES render `*bold*`, `_italic_`, `~strike~`,
 * and `` `mono` `` (same single-character delimiters as Telegram, even
 * though Telegram strictly speaking uses MarkdownV1). Earlier versions
 * stripped the markers because we'd misread WhatsApp's spec — the
 * morning brief landed in WhatsApp as unformatted text. We now KEEP
 * the markers so headers render bold on iOS / Android / Web WhatsApp.
 *
 * WhatsApp body limit is 4096 chars; we hard-truncate at 3897 so a
 * trailing "..." still fits cleanly.
 */
export function toWhatsAppPlainText(markdown: string): string {
  // Markdown is preserved verbatim — WhatsApp renders *bold*, _italic_,
  // ~strike~ and `mono` with the same single-char delimiters used by
  // the Telegram brief. The function name stays for backwards
  // compatibility with imports that already exist in tests + admin
  // routes.
  return markdown.length > 3900 ? `${markdown.slice(0, 3897)}...` : markdown;
}

/**
 * Best-effort 24h customer-service window check: did this user message
 * us in the last 24h? Inside the window we can free-form text (no
 * template fee). Outside, Meta requires a pre-approved template.
 */
export async function isInsideWhatsAppServiceWindow(
  supabase: AdminClient,
  userId: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('whatsapp_message_log')
      .select('id')
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .gte('created_at', since)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Send the morning brief to a single WhatsApp user. Smart-routes by
 * the 24h customer-service window (in-window text vs template).
 *
 * Returns:
 *   - 'sent'    on a successful Twilio submit
 *   - 'skipped' for *intentional* skips (e.g. template not approved)
 *   - 'error'   for genuine operational failures (Twilio HTTP, network, …)
 *
 * Never throws — operational errors are converted to `'error'` so the
 * caller's bookkeeping stays simple.
 */
export async function dispatchWhatsAppMorningBrief(
  supabase: AdminClient,
  userId: string,
  phone: string,
  markdownBody: string,
): Promise<DispatchOutcome> {
  const inWindow = await isInsideWhatsAppServiceWindow(supabase, userId);

  let inWindowTextError: unknown | undefined;
  if (inWindow) {
    const body = toWhatsAppPlainText(markdownBody);
    try {
      const result = await sendWhatsAppText({ to: phone, text: body });
      return {
        status: 'sent',
        channel: 'in_window',
        providerMessageId: result.providerMessageId,
      };
    } catch (err) {
      inWindowTextError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[whatsapp/morning-brief] WhatsApp text send failed for user ${userId}:`,
        errMsg,
      );
      // Fall through to template attempt — Twilio rejects in-window
      // sends with a 63016 if the window has just expired between
      // our check and the send. Trying the template covers that race.
    }
  }

  // Outside the window (or text fallback) — template path.
  //
  // 2026-05-29: UN-PAUSED. All 18 Paybacker WhatsApp templates were
  // approved by Meta earlier today (paybacker_morning_summary at
  // approval_status='approved' since 2026-05-29 11:00 UTC). The new
  // template body is self-contained:
  //   "Morning {{1}}. {{2}} Tip of the day: {{3}} Open
  //    paybacker.co.uk/dashboard for the full brief."
  // — 3 vars: name, highlights (multi-line summary), tip.
  //
  // Variable budget per Meta's 1024-char body limit minus framing
  // (≈ 90 static chars): name ≤ 30, highlights ≤ 600, tip ≤ 200.

  // Look up the user's first name for the template.
  let firstName = 'there';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, first_name, email')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const raw = (data.first_name || data.full_name || data.email || 'there')
        .toString()
        .trim();
      firstName = raw.split(/\s+/)[0] || 'there';
    }
  } catch {
    // Name is not load-bearing — fall back to "there".
  }

  // Build the highlights summary from the markdown brief. WhatsApp
  // template variables can contain newlines — Meta renders them as
  // literal line breaks — so we keep multi-line structure but strip
  // the Markdown markers and cap the length.
  const highlights = (() => {
    const plain = toWhatsAppPlainText(markdownBody).trim();
    if (plain.length <= 600) return plain;
    // Truncate at the last full line within the budget so we don't
    // cut mid-sentence.
    const slice = plain.slice(0, 597);
    const lastNl = slice.lastIndexOf('\n');
    return (lastNl > 100 ? slice.slice(0, lastNl) : slice) + '…';
  })();

  // Pick a tip — light rotation by day-of-year so users don't see
  // the same tip every morning. Tips kept short and Meta-safe (no
  // promotional language).
  const TIPS = [
    'Review your direct debits quarterly — companies often sneak in price rises mid-contract.',
    'Cancel free trials the day you sign up — set a reminder so you don\'t forget.',
    'Ask your insurer for a renewal discount. They almost always have one if you ask.',
    'Challenge your council tax band for free — 1 in 3 homes are in the wrong band.',
    'Haggle your TV and broadband package at renewal — retention offers are routine.',
    'Use Section 75 for credit-card purchases over £100 — your card provider is jointly liable.',
    'Check your credit report for free at ClearScore, Credit Karma or MSE Credit Club.',
    'Set up a standing order to a savings account on payday. Pay yourself first.',
    'Switch your energy tariff before the price cap changes — it could save hundreds a year.',
    'Most people pay for mobile data they never use — review your plan.',
  ];
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const tip = TIPS[dayOfYear % TIPS.length];

  try {
    const result = await sendWhatsAppTemplate({
      to: phone,
      templateName: 'paybacker_morning_summary',
      parameters: [firstName, highlights, tip],
    });
    return {
      status: 'sent',
      channel: 'template',
      providerMessageId: result.providerMessageId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // The runtime resolver returns null for any non-approved template
    // and the provider throws an intentional-skip marker — surface that
    // as 'skipped' rather than 'error' so the dispatcher's stats stay
    // meaningful. Otherwise it's a real send failure.
    if (isIntentionalTemplateSkip(err)) {
      console.warn(
        `[whatsapp/morning-brief] Out-of-window template skipped for user ${userId} (resolver returned no approved SID):`,
        errMsg,
      );
      return { status: 'skipped', reason: errMsg, channel: 'template' };
    }
    if (inWindowTextError) {
      const textMsg =
        inWindowTextError instanceof Error
          ? inWindowTextError.message
          : String(inWindowTextError);
      console.error(
        `[whatsapp/morning-brief] In-window text AND template both failed for user ${userId}:`,
        { text: textMsg, template: errMsg },
      );
      return { status: 'error', reason: errMsg, channel: 'template' };
    }
    console.error(
      `[whatsapp/morning-brief] Template send failed for user ${userId}:`,
      errMsg,
    );
    return { status: 'error', reason: errMsg, channel: 'template' };
  }
}

export interface SendMorningBriefOptions {
  /** Override the brief body. Defaults to a tiny smoke-test body. */
  bodyOverride?: string;
}

export interface SendMorningBriefResult {
  ok: boolean;
  status: 'sent' | 'skipped' | 'error';
  reason?: string;
  channel?: DispatchChannel;
  providerMessageId?: string;
}

/**
 * High-level helper used by the admin "Send test brief to me now" button.
 * Loads the user's WhatsApp session, verifies Pro tier, builds a tiny
 * brief body (active subscriptions count + total monthly spend), and
 * dispatches via the same routing logic the cron uses.
 */
export async function sendMorningBriefToUser(
  supabase: AdminClient,
  userId: string,
  options: SendMorningBriefOptions = {},
): Promise<SendMorningBriefResult> {
  // 1. Active WhatsApp session for the user
  const { data: session, error: sessErr } = await supabase
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone, is_active, opted_out_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('opted_out_at', null)
    .maybeSingle();

  if (sessErr) {
    return { ok: false, status: 'error', reason: `whatsapp_sessions load failed: ${sessErr.message}` };
  }
  if (!session) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'No active WhatsApp session for this user (opt in via /dashboard/settings/notifications first)',
    };
  }

  // 2. Pro tier gate (mirrors the cron path)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .eq('id', userId)
    .maybeSingle();

  const { isProPocketAgentEligible } = await import('@/lib/telegram/eligibility');
  if (!profile || !isProPocketAgentEligible(profile)) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'User is not Pro-tier (WhatsApp Pocket Agent is Pro-only)',
    };
  }

  // 3. Build a tiny smoke-test body unless caller supplied an override.
  let body = options.bodyOverride;
  if (!body) {
    try {
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('amount, billing_cycle')
        .eq('user_id', userId)
        .eq('status', 'active');

      const subList = (subs ?? []) as Array<{ amount: number | string; billing_cycle: string | null }>;
      const totalMonthly = subList.reduce((sum, s) => {
        const amt = Number(s.amount) || 0;
        const cycle = (s.billing_cycle ?? 'month').toLowerCase();
        if (cycle.startsWith('year')) return sum + amt / 12;
        if (cycle.startsWith('week')) return sum + amt * 4.345;
        return sum + amt;
      }, 0);
      const firstName = (profile.full_name || profile.email || 'there')
        .toString()
        .trim()
        .split(/\s+/)[0] || 'there';
      body =
        `*Test morning brief — ${firstName}*\n\n` +
        `Active subscriptions: *${subList.length}*\n` +
        `Total monthly spend: *£${totalMonthly.toFixed(2)}*\n\n` +
        `_This is a smoke-test send from /dashboard/admin/whatsapp._`;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      body = `*Test morning brief*\n\nThis is a smoke-test send from /dashboard/admin/whatsapp.\n(brief data unavailable: ${errMsg})`;
    }
  }

  const phone: string = session.whatsapp_phone;
  const outcome = await dispatchWhatsAppMorningBrief(supabase, userId, phone, body);
  return {
    ok: outcome.status === 'sent',
    status: outcome.status,
    reason: outcome.reason,
    channel: outcome.channel,
    providerMessageId: outcome.providerMessageId,
  };
}

