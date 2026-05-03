/**
 * Telegram + WhatsApp Morning Summary Cron
 *
 * Runs at 7:30am UK time daily. Sends each linked Pro user a morning
 * financial briefing covering yesterday's spending, upcoming renewals,
 * expiring contracts, budget warnings, open disputes, and a money tip.
 *
 * Telegram path: existing fetch to api.telegram.org with TELEGRAM_USER_BOT_TOKEN.
 *
 * WhatsApp path (added 2026-05-03): the same brief body fans out to any
 * user with an active row in `whatsapp_sessions` (independent channel
 * per /dashboard/settings/notifications — a user can have BOTH active).
 * We pick the cheapest valid send mode per the Meta 24h customer-service
 * window:
 *   - inside the window (user messaged us in the last 24h): free-form
 *     text via sendWhatsAppText (no template fee, full Markdown body).
 *   - outside the window: the `paybacker_morning_summary` UTILITY template
 *     IF Meta-approved. If not approved (current state — see
 *     template-registry.ts), we log + skip rather than 4xx Twilio.
 *
 * Same `morning_summary !== false` opt-out from telegram_alert_preferences
 * governs both channels (sole user-facing toggle today). Errors are
 * wrapped per-user so one bad number can't kill the run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';
import { sendWhatsAppText, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { getTemplateSid } from '@/lib/whatsapp/template-sids';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function fmt(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + limit;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + limit / 2) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

const MONEY_TIPS = [
  'Switch your energy tariff before the price cap changes — it could save you hundreds a year.',
  'Review your direct debits quarterly. Companies often sneak in price rises mid-contract.',
  'Use the 14-day cooling-off rule to cancel any financial product you changed your mind about.',
  'Check if your broadband contract has ended — you might be paying loyalty penalty prices.',
  'Set up a standing order to a savings account on payday. Pay yourself first.',
  'Challenge your council tax band for free — 1 in 3 homes are in the wrong band.',
  'Cancel free trials the day you sign up — set a reminder so you don\'t forget.',
  'Ask your insurer for a renewal discount. They almost always have one if you ask.',
  'Round up your spending and save the difference — small amounts compound fast.',
  'Check your credit report for free at ClearScore, Credit Karma, or MSE Credit Club.',
  'Use Section 75 of the Consumer Credit Act for purchases over £100 made by credit card — your card provider is jointly liable.',
  'Switch current accounts for free switching bonuses — some banks offer up to £175.',
  'Haggle your TV and broadband package at renewal. Providers expect it and have retention offers ready.',
  'Review your mobile phone plan — most people are paying for data they never use.',
];

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) return false;
  }
  return true;
}

/**
 * Build the morning brief body for a single user. Returns null when
 * the user has no bank transactions yet (caller should skip).
 *
 * Pure data-shaping over Supabase — same queries the Telegram loop
 * has used since launch, lifted into a reusable helper so the
 * WhatsApp-only loop can produce identical output.
 */
type BriefDateContext = {
  now: Date;
  todayStr: string;
  tomorrowStr: string;
  in7DaysStr: string;
  yesterdayStart: Date;
  todayStart: Date;
  tipIndex: number;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;
async function buildMorningBrief(
  supabase: AdminClient,
  userId: string,
  ctx: BriefDateContext,
): Promise<string | null> {
  const { now, todayStr, tomorrowStr, in7DaysStr, yesterdayStart, todayStart, tipIndex } = ctx;

  const { count: txCount } = await supabase
    .from('bank_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (!txCount || txCount === 0) return null;

  const sections: string[] = [];
  sections.push("*Good morning! Here's your daily money briefing:*");

  // ------ 1. Yesterday's spending ------
  const EXCLUDE_CATS = new Set([
    'transfer', 'transfers', 'internal_transfer', 'self_transfer',
    'credit_card_payment', 'credit_card',
    'investment', 'investments', 'savings', 'pension',
    'income', 'fee_refund',
  ]);
  const { data: yesterdayTxRaw } = await supabase
    .from('bank_transactions')
    .select('user_category, amount')
    .eq('user_id', userId)
    .lt('amount', 0)
    .gte('timestamp', yesterdayStart.toISOString())
    .lt('timestamp', todayStart.toISOString());

  const yesterdayTx = ((yesterdayTxRaw ?? []) as Array<{ user_category: string | null; amount: number | string }>).filter(
    (t) => !EXCLUDE_CATS.has(t.user_category ?? ''),
  );

  if (yesterdayTx.length > 0) {
    const total = yesterdayTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const byCategory: Record<string, number> = {};
    for (const t of yesterdayTx) {
      const cat = t.user_category ?? 'Other';
      byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(Number(t.amount));
    }
    const topCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    let spendingSection = `\n\n*Yesterday's Spending*\nTotal: *${fmt(total)}*`;
    if (topCategories.length > 0) {
      spendingSection += '\nTop categories:';
      for (const [cat, amount] of topCategories) {
        spendingSection += `\n  - ${cat}: ${fmt(amount)}`;
      }
    }
    sections.push(spendingSection);
  } else {
    sections.push("\n\n*Yesterday's Spending*\nNo spending recorded yesterday.");
  }

  // ------ 2. Subscriptions renewing today or tomorrow ------
  const { data: renewals } = await supabase
    .from('subscriptions')
    .select('provider_name, amount, billing_cycle, next_billing_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('next_billing_date', todayStr)
    .lte('next_billing_date', tomorrowStr);

  if (renewals && renewals.length > 0) {
    let renewalSection = '\n\n*Upcoming Renewals*';
    for (const sub of renewals as Array<{ provider_name: string; amount: number | string; billing_cycle: string | null; next_billing_date: string }>) {
      const when = sub.next_billing_date === todayStr ? 'Today' : 'Tomorrow';
      renewalSection += `\n  - ${sub.provider_name}: ${fmt(Number(sub.amount))}/${sub.billing_cycle ?? 'month'} (${when})`;
    }
    sections.push(renewalSection);
  }

  // ------ 3. Contracts expiring this week ------
  const { data: expiringContracts } = await supabase
    .from('subscriptions')
    .select('provider_name, contract_end_date, amount, billing_cycle')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('contract_end_date', 'is', null)
    .gte('contract_end_date', todayStr)
    .lte('contract_end_date', in7DaysStr);

  if (expiringContracts && expiringContracts.length > 0) {
    let contractSection = '\n\n*Contracts Expiring This Week*';
    for (const c of expiringContracts as Array<{ provider_name: string; contract_end_date: string }>) {
      contractSection += `\n  - ${c.provider_name}: ends ${fmtDate(c.contract_end_date)}`;
    }
    sections.push(contractSection);
  }

  // ------ 4. Budget status (categories over 80%) ------
  const [budgetsResult, monthSpendingResult] = await Promise.all([
    supabase.from('money_hub_budgets').select('category, monthly_limit').eq('user_id', userId),
    supabase.rpc('get_monthly_spending', {
      p_user_id: userId,
      p_year: now.getFullYear(),
      p_month: now.getMonth() + 1,
    }),
  ]);

  const spentByCategory: Record<string, number> = {};
  for (const row of (monthSpendingResult.data ?? []) as Array<{ category: string; category_total: number | string }>) {
    spentByCategory[row.category] = Number(row.category_total);
  }

  const budgetWarnings: Array<{ category: string; spent: number; limit: number; pct: number }> = [];
  for (const b of (budgetsResult.data ?? []) as Array<{ category: string; monthly_limit: number | string }>) {
    const limit = Number(b.monthly_limit);
    const spentAmt = spentByCategory[b.category] ?? 0;
    const pct = limit > 0 ? (spentAmt / limit) * 100 : 0;
    if (pct >= 80) {
      budgetWarnings.push({ category: b.category, spent: spentAmt, limit, pct });
    }
  }

  if (budgetWarnings.length > 0) {
    budgetWarnings.sort((a, b) => b.pct - a.pct);
    let budgetSection = '\n\n*Budget Warnings*';
    for (const w of budgetWarnings) {
      const emoji = w.pct >= 100 ? '⚠️' : '⏳';
      budgetSection += `\n  ${emoji} ${w.category}: ${fmt(w.spent)} / ${fmt(w.limit)} (${Math.round(w.pct)}%)`;
    }
    sections.push(budgetSection);
  }

  // ------ 5. Unresolved disputes ------
  const { data: openDisputes } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, status')
    .eq('user_id', userId)
    .not('status', 'in', '(resolved,dismissed)');

  if (openDisputes && openDisputes.length > 0) {
    let disputeSection = `\n\n*Open Disputes (${openDisputes.length})*`;
    for (const d of (openDisputes as Array<{ provider_name: string; issue_type: string; status: string }>).slice(0, 3)) {
      disputeSection += `\n  - ${d.provider_name}: ${d.issue_type} (${d.status})`;
    }
    if (openDisputes.length > 3) {
      disputeSection += `\n  _...and ${openDisputes.length - 3} more_`;
    }
    sections.push(disputeSection);
  }

  // ------ 6. Money-saving tip of the day ------
  sections.push(`\n\n💡 *Tip of the Day*\n${MONEY_TIPS[tipIndex]}`);

  return sections.join('');
}

/**
 * Convert the Telegram-flavoured Markdown brief to plain text suitable
 * for WhatsApp's free-form text channel. WhatsApp uses a different
 * (much smaller) Markdown subset and does NOT support `*bold*` the
 * same way — asterisks render literally on most clients. Strip the
 * Markdown markers so the body reads cleanly on either side.
 *
 * We keep the layout and emojis. WhatsApp body limit is 4096 chars;
 * we hard-truncate well below that as a defensive measure (the
 * Telegram body is similarly bounded by splitMessage's 4000-char chunk).
 */
function toWhatsAppPlainText(markdown: string): string {
  const stripped = markdown
    // *bold* -> bold
    .replace(/\*([^*\n]+)\*/g, '$1')
    // _italic_ -> italic (only when it's a standalone wrapper, not mid-word)
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2');
  return stripped.length > 3900 ? `${stripped.slice(0, 3897)}...` : stripped;
}

/**
 * Best-effort 24h customer-service window check: did this user message
 * us in the last 24h? Inside the window we can free-form text (no
 * template fee). Outside, Meta requires a pre-approved template.
 *
 * We use whatsapp_message_log.direction='inbound' as the canonical
 * signal — it's written by the inbound webhook for every Twilio
 * message. Returns false on any DB error so we fall through to the
 * template path (safer to skip than to 4xx Twilio).
 */
async function isInsideWhatsAppServiceWindow(
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
 * the 24h customer-service window:
 *   - inside window: free-form text (cheap, full body, full Markdown
 *     stripped to plain text).
 *   - outside window: paybacker_morning_summary template — IF
 *     Meta-approved. If not approved (current state per
 *     template-registry.ts), log + skip rather than 4xx Twilio.
 *
 * Returns 'sent' on a successful Twilio submit, 'skipped' otherwise.
 * Throws ONLY on unexpected runtime errors — the caller wraps the
 * whole call in try/catch so per-user failures don't kill the run.
 */
async function dispatchWhatsAppMorningBrief(
  supabase: AdminClient,
  userId: string,
  phone: string,
  markdownBody: string,
): Promise<'sent' | 'skipped'> {
  const inWindow = await isInsideWhatsAppServiceWindow(supabase, userId);

  if (inWindow) {
    const body = toWhatsAppPlainText(markdownBody);
    try {
      await sendWhatsAppText({ to: phone, text: body });
      return 'sent';
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[telegram-morning-summary] WhatsApp text send failed for user ${userId}:`,
        errMsg,
      );
      // Fall through to template attempt — Twilio rejects in-window
      // sends with a 63016 if the window has just expired between
      // our check and the send. Trying the template covers that race.
    }
  }

  // Outside the window (or text fallback) — template path.
  const templateName = 'paybacker_morning_summary';
  const sid = await getTemplateSid(templateName);
  if (!sid) {
    console.warn(
      `[telegram-morning-summary] WhatsApp template ${templateName} not yet approved — skipping user ${userId}`,
    );
    return 'skipped';
  }

  // Best-effort variable extraction from the brief. The template body is:
  //   "Morning {{1}}. Overnight we scanned {{2}} items and found {{3}}
  //    opportunities. Top focus: {{4}}. Tap to open today's brief."
  // We have section-count / opportunity-count signals in the brief but
  // the template prefers small numeric variables, not full bodies.
  // Pull the user's first name + a coarse signal so the message is
  // recognisably "their" morning brief.
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

  // Coarse signals derived from the markdown body so the template doesn't
  // hard-code zeroes. The body has section headers we can count.
  const sectionsHit = (markdownBody.match(/\*[A-Z][^*\n]{2,}\*/g) ?? []).length;
  const renewalsCount = (markdownBody.match(/\*Upcoming Renewals\*/g) ?? []).length;
  const budgetWarnings = (markdownBody.match(/\*Budget Warnings\*/g) ?? []).length;
  const opportunities = renewalsCount + budgetWarnings;
  const topFocus = budgetWarnings > 0
    ? 'budget warnings'
    : renewalsCount > 0
      ? 'upcoming renewals'
      : 'spending recap';

  try {
    await sendWhatsAppTemplate({
      to: phone,
      templateName,
      parameters: [
        firstName,
        String(sectionsHit),
        String(opportunities),
        topFocus,
      ],
    });
    return 'sent';
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[telegram-morning-summary] WhatsApp template send failed for user ${userId}:`,
      errMsg,
    );
    return 'skipped';
  }
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });
  }

  const supabase = getAdmin();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  // WhatsApp dispatch counters tracked independently — same body, different
  // channel. See block below the Telegram dispatch inside the per-user loop.
  let whatsappSent = 0;
  let whatsappSkipped = 0;
  const whatsappErrors: string[] = [];

  // -------------------------------------------------------
  // Get all active linked Pro users (Telegram + WhatsApp — channels
  // are independent per /dashboard/settings/notifications).
  // -------------------------------------------------------
  const [{ data: sessions, error: sessErr }, { data: waSessions, error: waSessErr }] =
    await Promise.all([
      supabase
        .from('telegram_sessions')
        .select('user_id, telegram_chat_id')
        .eq('is_active', true),
      supabase
        .from('whatsapp_sessions')
        .select('user_id, whatsapp_phone')
        .eq('is_active', true)
        .is('opted_out_at', null),
    ]);

  if (waSessErr) {
    console.warn('[telegram-morning-summary] whatsapp_sessions load failed:', waSessErr.message);
  }

  if (
    (sessErr || !sessions || sessions.length === 0) &&
    (!waSessions || waSessions.length === 0)
  ) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  const tgSessions = sessions ?? [];
  const wapSessions = waSessions ?? [];
  const userIds = Array.from(
    new Set([...tgSessions.map((s) => s.user_id), ...wapSessions.map((s) => s.user_id)]),
  );
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .in('id', userIds);

  // Eligibility helper covers past_due / unpaid / incomplete (Stripe
  // retry window) so users keep getting alerts during the 7-day grace
  // before auto-demotion. See lib/telegram/eligibility.ts.
  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => isProPocketAgentEligible(p))
      .map((p) => p.id),
  );

  const proSessions = tgSessions.filter((s) => proUserIds.has(s.user_id));
  const proWhatsappSessions = wapSessions.filter((s) => proUserIds.has(s.user_id));

  // Check alert preferences — skip users who disabled morning summary.
  // The same `telegram_alert_preferences.morning_summary` flag governs
  // both Pocket Agent channels today (verified — the settings page writes
  // a single row per user). When per-channel toggles ship, split here.
  const allEligibleUserIds = Array.from(
    new Set([
      ...proSessions.map((s) => s.user_id),
      ...proWhatsappSessions.map((s) => s.user_id),
    ]),
  );
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, morning_summary')
    .in('user_id', allEligibleUserIds);

  const prefMap = new Map((allPrefs ?? []).map(p => [p.user_id, p]));
  const morningSummaryOn = (userId: string): boolean => {
    const pref = prefMap.get(userId);
    return !pref || pref.morning_summary !== false; // default to on
  };
  const eligibleSessions = proSessions.filter((s) => morningSummaryOn(s.user_id));
  const eligibleWhatsappSessions = proWhatsappSessions.filter((s) =>
    morningSummaryOn(s.user_id),
  );

  // Index whatsapp sessions by user_id so the per-user loop can find
  // the matching phone in O(1). Map<user_id, whatsapp_phone>.
  const whatsappByUserId = new Map<string, string>(
    eligibleWhatsappSessions.map((s) => [s.user_id, s.whatsapp_phone]),
  );

  // Track which users got a WhatsApp send via the Telegram loop so the
  // standalone WhatsApp loop (for users with NO Telegram session) doesn't
  // double-dispatch. The DB mutex is supposed to guarantee at most one
  // active row per user, but this cron treats them as independent so
  // belt-and-braces here.
  const whatsappDispatchedUserIds = new Set<string>();

  // -------------------------------------------------------
  // Date helpers
  // -------------------------------------------------------
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Yesterday boundaries (UTC-based, but data is stored consistently)
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStr = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const in7DaysStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Current month boundaries
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Daily rotating tip
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24),
  );
  const tipIndex = dayOfYear % MONEY_TIPS.length;

  // -------------------------------------------------------
  // Process each Pro user
  // -------------------------------------------------------
  const briefCtx: BriefDateContext = {
    now,
    todayStr,
    tomorrowStr,
    in7DaysStr,
    yesterdayStart,
    todayStart,
    tipIndex,
  };
  for (const session of eligibleSessions) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // ------ Build the brief (helper handles "no transactions = null") ------
      const message = await buildMorningBrief(supabase, userId, briefCtx);
      if (!message) {
        skipped++;
        continue;
      }

      // ------ Send via Telegram ------
      const ok = await sendTelegramMessage(token, Number(chatId), message);

      if (ok) {
        sent++;
      } else {
        errors.push(`Failed to send to user ${userId}`);
      }

      // ------ WhatsApp dispatch (independent channel) ------
      // If this user also has an active WhatsApp Pocket Agent session,
      // fan the same body out there too. Wrapped in its own try/catch
      // so a bad number / unapproved template / Twilio outage can't
      // kill the Telegram run for the rest of the user list.
      const waPhone = whatsappByUserId.get(userId);
      if (waPhone) {
        try {
          const waOutcome = await dispatchWhatsAppMorningBrief(
            supabase,
            userId,
            waPhone,
            message,
          );
          if (waOutcome === 'sent') {
            whatsappSent++;
          } else {
            whatsappSkipped++;
          }
        } catch (waErr) {
          const errMsg = waErr instanceof Error ? waErr.message : String(waErr);
          console.error(
            `[telegram-morning-summary] WhatsApp dispatch failed for user ${userId}:`,
            errMsg,
          );
          whatsappErrors.push(`${userId}: ${errMsg}`);
        }
        whatsappDispatchedUserIds.add(userId);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-morning-summary] Error for user ${userId}:`, errMsg);
      errors.push(`${userId}: ${errMsg}`);
    }
  }

  // -------------------------------------------------------
  // WhatsApp-only users (no active Telegram session) — build the
  // brief and dispatch via WhatsApp. Reuses the same Supabase
  // queries from the Telegram loop via buildMorningBrief().
  // -------------------------------------------------------
  const waOnlyUsers = eligibleWhatsappSessions.filter(
    (s) => !whatsappDispatchedUserIds.has(s.user_id),
  );
  for (const session of waOnlyUsers) {
    const { user_id: userId, whatsapp_phone: waPhone } = session;
    try {
      const message = await buildMorningBrief(supabase, userId, briefCtx);
      if (!message) {
        // Either no bank transactions yet, or the helper bailed.
        whatsappSkipped++;
        continue;
      }
      const waOutcome = await dispatchWhatsAppMorningBrief(
        supabase,
        userId,
        waPhone,
        message,
      );
      if (waOutcome === 'sent') {
        whatsappSent++;
      } else {
        whatsappSkipped++;
      }
    } catch (waErr) {
      const errMsg = waErr instanceof Error ? waErr.message : String(waErr);
      console.error(
        `[telegram-morning-summary] WhatsApp-only dispatch failed for user ${userId}:`,
        errMsg,
      );
      whatsappErrors.push(`${userId}: ${errMsg}`);
    }
  }

  console.log(
    `[telegram-morning-summary] Telegram: processed ${proSessions.length} users, sent ${sent}, skipped ${skipped}, errors ${errors.length}. ` +
      `WhatsApp: sent ${whatsappSent}, skipped ${whatsappSkipped}, errors ${whatsappErrors.length}.`,
  );

  // Alert founder if the cron ran with eligible users but sent nothing
  const founderChatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (founderChatId && eligibleSessions.length > 0 && sent === 0 && errors.length > 0) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(founderChatId),
        text: `Morning summary failed: ${errors.slice(0, 3).join('; ')}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    users: proSessions.length,
    sent,
    skipped,
    errors: errors.length,
    whatsappUsers: proWhatsappSessions.length,
    whatsappSent,
    whatsappSkipped,
    whatsappErrors: whatsappErrors.length,
  });
}
