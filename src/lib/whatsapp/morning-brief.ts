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
 * Curated rotation of UK consumer-finance "Tip of the Day" lines for the
 * morning brief. Kept Meta-safe (no promotional language, no external
 * links) so the UTILITY template stays approved. Rotated by day-of-year
 * so a user sees a different tip each morning across a ~month cycle.
 *
 * Exported so the intraday orchestrator and any future brief surface can
 * reuse the same vetted list rather than forking copy.
 */
export const WHATSAPP_DAILY_TIPS: readonly string[] = [
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
  'Flight delayed 3+ hours? You may be owed up to £520 under UK261. Keep your boarding pass.',
  'Always pay your tax bill on time — HMRC charges interest and penalties from day one.',
  'A delivery arrived broken or late? The retailer, not the courier, is legally responsible.',
  'Out-of-contract on broadband? You are almost certainly overpaying — new-customer prices are lower.',
  'You have 14 days to cancel most things bought online, no reason needed (Consumer Contracts Regs).',
  'Faulty goods? You get a full refund within 30 days under the Consumer Rights Act 2015.',
  'Compare your home and car insurance 3 weeks before renewal — that is when quotes are cheapest.',
  'Gym won\'t let you cancel? A rolling contract can be ended with reasonable notice.',
  'Check old bank accounts for forgotten standing orders and subscriptions you never use.',
  'Parking ticket on private land? It is an invoice, not a fine — you can appeal it.',
  'Energy supplier estimating your bills? Submit a meter reading to pay only what you use.',
  'Overpaid tax through PAYE? You can reclaim up to 4 years back from HMRC.',
  'Bank charged you an unfair fee? Ask for it back — goodwill refunds are common if you ask politely.',
  'Switch current accounts for cash bonuses — banks regularly pay £100–£200 to switch.',
  'Round up your spending into savings automatically — small amounts compound fast.',
  'Mis-sold something? You can complain to the Financial Ombudsman free if the firm says no.',
  'Check if you are due a water bill discount — meters often save single-person households money.',
  'Loyalty rarely pays. Insurers and providers reserve their best prices for new customers.',
  'Keep receipts for big purchases — proof of purchase makes any future dispute far easier.',
  'Set price-drop alerts before big buys — many retailers quietly cut prices within weeks.',
];

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
  // Persist the exact brief so the /dashboard/brief page can show "the full
  // brief" the summary's link points at. Fire-and-forget — never blocks send.
  try {
    await supabase
      .from('daily_brief_log')
      .upsert(
        {
          user_id: userId,
          brief_date: new Date().toISOString().slice(0, 10),
          body_markdown: markdownBody,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,brief_date' },
      );
  } catch (e) {
    console.warn('[morning-brief] persist daily_brief_log failed', (e as Error)?.message ?? e);
  }

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

  // Build the highlights summary from the markdown brief. CRITICAL:
  // Twilio's twilio/text content type for WhatsApp rejects ALL newlines
  // inside ContentVariables values (verified 2026-05-29: a single \n
  // returns error 21656 "Content Variables parameter is invalid"). We
  // must flatten newlines to a separator and strip every other control
  // char too.
  const sanitiseForTemplateVar = (s: string): string => {
    return s
      // Flatten ALL newlines (including \r) to " · " so multi-line
      // structure survives as a visible separator. Twilio rejects raw
      // \n in WhatsApp template variables (21656).
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' · ')
      // Strip control chars except \n and \t — we then handle \t below.
      // eslint-disable-next-line no-control-regex
      .replace(/[ --]/g, '')
      .replace(/\t/g, ' ') // tabs → single space
      .replace(/ {4,}/g, '   ') // collapse 4+ spaces to 3
      .replace(/\n{4,}/g, '\n\n\n') // collapse 4+ newlines to 3
      .trim();
  };
  const highlights = (() => {
    const plain = sanitiseForTemplateVar(toWhatsAppPlainText(markdownBody));
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
  const TIPS = WHATSAPP_DAILY_TIPS;
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

  // 3. Build a useful smoke-test body unless caller supplied an override.
  //    Mirrors what the 7:30am cron produces: specific upcoming renewals
  //    by name + amount + date, active disputes count, and the spend
  //    headline. Paul (2026-05-29) explicitly asked: "could be more
  //    useful by saying what subscriptions are renewing." This is that.
  let body = options.bodyOverride;
  if (!body) {
    try {
      const today = new Date();
      const horizon = new Date();
      horizon.setDate(today.getDate() + 14); // next 14 days
      const todayIso = today.toISOString().slice(0, 10);
      const horizonIso = horizon.toISOString().slice(0, 10);

      const [{ data: subs }, { data: upcoming }, { data: disputes }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('amount, billing_cycle')
          .eq('user_id', userId)
          .eq('status', 'active'),
        supabase
          .from('subscriptions')
          .select('provider_name, amount, next_billing_date')
          .eq('user_id', userId)
          .eq('status', 'active')
          .not('next_billing_date', 'is', null)
          .gte('next_billing_date', todayIso)
          .lte('next_billing_date', horizonIso)
          .order('next_billing_date', { ascending: true })
          .limit(5),
        supabase
          .from('disputes')
          .select('id')
          .eq('user_id', userId)
          // Count genuinely-open disputes only. Exclude every terminal
          // state (mirrors isResolved in src/lib/dispute-helpers.ts) rather
          // than whitelisting a few active labels — a whitelist silently
          // dropped 'open' / 'escalated' rows and undercounted.
          .not(
            'status',
            'in',
            '(resolved,dismissed,resolved_won,resolved_lost,resolved_partial,won,lost,partial,closed,withdrawn,timeout)',
          ),
      ]);

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

      const upcomingList = (upcoming ?? []) as Array<{
        provider_name: string;
        amount: number | string;
        next_billing_date: string;
      }>;
      const renewalLines = upcomingList.map((s) => {
        const d = new Date(s.next_billing_date);
        const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return `${s.provider_name} £${Number(s.amount).toFixed(2)} on ${dateStr}`;
      });
      const renewalsBlurb = renewalLines.length
        ? `Renewing in next 14 days: ${renewalLines.join('; ')}.`
        : 'No renewals in the next 14 days.';

      const disputesCount = (disputes ?? []).length;
      const disputesBlurb = disputesCount
        ? `${disputesCount} open dispute${disputesCount === 1 ? '' : 's'}.`
        : 'No open disputes.';

      // Time-aware greeting so an ad-hoc test send at 3pm doesn't open
      // with "Morning". Hour is the user's wall-clock time per
      // Europe/London — the only timezone Paybacker users currently
      // sit in. If we ever ship internationally, swap this for a
      // per-user timezone lookup.
      const londonHour = Number(
        new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }),
      );
      const greeting =
        londonHour < 12 ? 'Morning' : londonHour < 17 ? 'Afternoon' : 'Evening';
      // Newlines kept here for the IN-WINDOW free-form text branch (which
      // accepts them). The template branch's sanitiser flattens \n to
      // " · " on its way to ContentVariables.
      body =
        `*${greeting} ${firstName}*\n\n` +
        `${renewalsBlurb}\n` +
        `${disputesBlurb}\n` +
        `Active subs ${subList.length} · monthly spend £${totalMonthly.toFixed(2)}.\n\n` +
        `Open paybacker.co.uk/dashboard/brief for the full brief.`;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      body = `*Test morning brief*\n\nThis is a smoke-test send from /dashboard/admin/whatsapp.\n(brief data unavailable: ${errMsg})`;
    }
  }

  // Ad-hoc test send dispatches deliberately AVOID paybacker_morning_summary
  // because that template starts with "Morning {{1}}." (hardcoded by Meta
  // approval) and looks wrong at 3pm. Use the generic pocket_agent_reply
  // template for out-of-window test sends so the body decides its own
  // greeting (e.g. "Afternoon Paul" via the time-aware logic above).
  const phone: string = session.whatsapp_phone;
  const inWindow = await isInsideWhatsAppServiceWindow(supabase, userId);

  if (inWindow) {
    try {
      const result = await sendWhatsAppText({ to: phone, text: body });
      return {
        ok: true,
        status: 'sent',
        channel: 'in_window',
        providerMessageId: result.providerMessageId,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 'error', reason: errMsg, channel: 'in_window' };
    }
  }

  // Out-of-window: wrap the test body in paybacker_pocket_agent_reply.
  // Single var template, no morning constraint. Sanitise newlines for
  // the same Twilio 21656 reason as the morning brief path.
  const sanitised = body
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' · ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  // Cap to fit within the wrapped template body (Meta 1024-char limit,
  // wrapper is "Pocket Agent:\n\n{{1}}\n\n— reply STOP to opt out." ≈ 60 chars).
  const capped = sanitised.length > 950 ? `${sanitised.slice(0, 947)}…` : sanitised;
  try {
    const result = await sendWhatsAppTemplate({
      to: phone,
      templateName: 'paybacker_pocket_agent_reply',
      parameters: [capped],
    });
    return {
      ok: true,
      status: 'sent',
      channel: 'template',
      providerMessageId: result.providerMessageId,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'error', reason: errMsg, channel: 'template' };
  }
}

