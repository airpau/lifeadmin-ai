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
 * Recognise template-send failures that represent an *intentional* skip
 * (template not yet approved) rather than an operational outage.
 */
function isIntentionalTemplateSkip(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /pending Meta resubmission/i.test(msg);
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
  const templateName = 'paybacker_morning_summary';

  // Best-effort variable extraction from the brief.
  let firstName = 'there';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      const raw = (data.full_name || data.email || 'there').toString().trim();
      firstName = raw.split(/\s+/)[0] || 'there';
    }
  } catch {
    // Use the default 'there' — name is not load-bearing.
  }

  // Real "scanned/opportunities" counts — the previous code counted
  // bolded section headers in the brief Markdown which produced
  // misleading numbers like "scanned 9 items, found 0 opportunities"
  // even when the user had genuine inbox findings and open disputes.
  // Pull real counts from the underlying tables so the template message
  // body ("Overnight we scanned {{2}} items and found {{3}} opportunities.
  // Top focus: {{4}}") matches what the brief actually contains.
  const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [findingsRes, disputesRes, emailsRes] = await Promise.all([
    supabase
      .from('email_scan_findings')
      .select('id, urgency, finding_type')
      .eq('user_id', userId)
      .gte('created_at', sinceISO),
    supabase
      .from('disputes')
      .select('id, status, agent_state')
      .eq('user_id', userId),
    supabase
      .from('email_connections')
      .select('emails_scanned')
      .eq('user_id', userId),
  ]);

  type FindingRow = { urgency: string | null; finding_type: string | null };
  const findings = (findingsRes.data ?? []) as FindingRow[];
  const opportunities = findings.length;

  // Lifetime emails_scanned across active connections — best signal we
  // have without a per-day scan log. The template body says "Overnight
  // we scanned N items"; using the total is better than the bogus
  // section-header count it replaces, even if it's not strictly
  // "overnight". When a scan_sessions table lands we can swap to a
  // strict 24h window.
  const emailRows = (emailsRes.data ?? []) as Array<{ emails_scanned: number | null }>;
  const totalEmailsScanned = emailRows.reduce(
    (sum, r) => sum + (Number(r.emails_scanned) || 0),
    0,
  );
  const scannedItems = Math.max(opportunities, totalEmailsScanned);

  // Open dispute count — same rule as the brief body's dispute filter
  // (TERMINAL_DISPUTE_STATUSES in the cron). Used to prioritise the
  // top-focus line so the user's first read isn't "spending recap" when
  // there are unresolved disputes waiting on them.
  const allDisputes = (disputesRes.data ?? []) as Array<{ status: string | null; agent_state: string | null }>;
  const openDisputeCount = allDisputes.filter((d) => {
    const s = (d.agent_state ?? d.status ?? '').toLowerCase();
    if (!s) return false;
    if (/resolv|won|lost|dismiss|withdraw|closed/.test(s)) return false;
    return true;
  }).length;

  const renewalsCount = (markdownBody.match(/\*Upcoming Renewals\*/g) ?? []).length;
  const budgetWarnings = (markdownBody.match(/\*Budget Warnings\*/g) ?? []).length;
  const immediateFindings = findings.filter((f) => f.urgency === 'immediate').length;

  const topFocus = immediateFindings > 0
    ? `${immediateFindings} urgent inbox item${immediateFindings === 1 ? '' : 's'}`
    : openDisputeCount > 0
      ? `${openDisputeCount} open dispute${openDisputeCount === 1 ? '' : 's'}`
      : budgetWarnings > 0
        ? 'budget warnings'
        : renewalsCount > 0
          ? 'upcoming renewals'
          : opportunities > 0
            ? 'new inbox findings'
            : 'spending recap';

  try {
    const result = await sendWhatsAppTemplate({
      to: phone,
      templateName,
      parameters: [
        firstName,
        String(scannedItems),
        String(opportunities),
        topFocus,
      ],
    });
    return {
      status: 'sent',
      channel: 'template',
      providerMessageId: result.providerMessageId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (isIntentionalTemplateSkip(err)) {
      if (inWindowTextError) {
        const textMsg =
          inWindowTextError instanceof Error
            ? inWindowTextError.message
            : String(inWindowTextError);
        console.error(
          `[whatsapp/morning-brief] WhatsApp delivery failed for user ${userId} (in-window text errored, template not approved):`,
          textMsg,
        );
        return { status: 'error', reason: textMsg, channel: 'in_window' };
      }
      console.warn(
        `[whatsapp/morning-brief] WhatsApp template skipped for user ${userId} (not approved):`,
        errMsg,
      );
      return { status: 'skipped', reason: errMsg, channel: 'template' };
    }
    console.error(
      `[whatsapp/morning-brief] WhatsApp template send failed for user ${userId}:`,
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
