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
import { dispatchWhatsAppMorningBrief } from '@/lib/whatsapp/morning-brief';

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
    .select('user_category, amount, timestamp, description')
    .eq('user_id', userId)
    .lt('amount', 0)
    .gte('timestamp', yesterdayStart.toISOString())
    .lt('timestamp', todayStart.toISOString());

  type SpendRow = { user_category: string | null; amount: number | string; timestamp: string; description?: string | null };
  let spendRows = ((yesterdayTxRaw ?? []) as SpendRow[]).filter(
    (t) => !EXCLUDE_CATS.has(t.user_category ?? ''),
  );
  let spendLabel = "Yesterday's Spending";
  let fallbackNote = '';

  // Fallback — if yesterday is empty, walk back up to 14 days for the
  // most recent day with debit activity so the brief is never blank
  // when there's data in the account. Common when the user is travelling,
  // when payroll lands on a weekend, or when the bank sync gap means
  // yesterday genuinely has no rows yet.
  if (spendRows.length === 0) {
    const lookbackStart = new Date(yesterdayStart);
    lookbackStart.setDate(lookbackStart.getDate() - 14);
    const { data: recentRaw } = await supabase
      .from('bank_transactions')
      .select('user_category, amount, timestamp, description')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', lookbackStart.toISOString())
      .lt('timestamp', yesterdayStart.toISOString())
      .order('timestamp', { ascending: false })
      .limit(200);

    const recent = ((recentRaw ?? []) as SpendRow[]).filter(
      (t) => !EXCLUDE_CATS.has(t.user_category ?? ''),
    );

    if (recent.length > 0) {
      // Group by day (YYYY-MM-DD) and pick the most recent one with rows.
      const byDay = new Map<string, SpendRow[]>();
      for (const t of recent) {
        const day = String(t.timestamp).slice(0, 10);
        const arr = byDay.get(day) ?? [];
        arr.push(t);
        byDay.set(day, arr);
      }
      const mostRecentDay = Array.from(byDay.keys()).sort().reverse()[0];
      spendRows = byDay.get(mostRecentDay) ?? [];
      const daysAgo = Math.max(
        1,
        Math.round(
          (yesterdayStart.getTime() - new Date(`${mostRecentDay}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
      const friendly = new Date(`${mostRecentDay}T00:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      });
      spendLabel = `Latest Spending (${friendly})`;
      fallbackNote = `\n_No debits yesterday — showing last activity (${daysAgo} day${daysAgo === 1 ? '' : 's'} ago)._`;
    }
  }

  if (spendRows.length > 0) {
    const total = spendRows.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
    const byCategory: Record<string, number> = {};
    for (const t of spendRows) {
      const cat = t.user_category ?? 'Other';
      byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(Number(t.amount));
    }
    const topCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    let spendingSection = `\n\n*${spendLabel}*\nTotal: *${fmt(total)}*`;
    if (topCategories.length > 0) {
      spendingSection += '\nTop categories:';
      for (const [cat, amount] of topCategories) {
        spendingSection += `\n  - ${cat}: ${fmt(amount)}`;
      }
    }
    if (fallbackNote) spendingSection += fallbackNote;
    sections.push(spendingSection);
  } else {
    // No debits anywhere in the last 15 days. Either a brand-new account
    // or — more commonly — a stale bank sync. Show a diagnostic so the
    // user knows the difference between "nothing to report" and
    // "we can't see your data".
    const { data: lastSync } = await supabase
      .from('bank_connections')
      .select('last_synced_at, status')
      .eq('user_id', userId)
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    let line = 'No spending recorded yesterday.';
    if (lastSync) {
      const last = lastSync.last_synced_at ? new Date(lastSync.last_synced_at) : null;
      const ageH = last ? Math.round((Date.now() - last.getTime()) / (1000 * 60 * 60)) : null;
      if (lastSync.status && /expir|revok|fail/i.test(String(lastSync.status))) {
        line = `Bank sync paused (status: ${lastSync.status}). Reconnect at paybacker.co.uk/dashboard/profile to refresh.`;
      } else if (ageH !== null && ageH > 36) {
        line = `No fresh transactions in the last 15 days. Last bank sync ${ageH}h ago — reconnect if your account is active.`;
      }
    }
    sections.push(`\n\n*Yesterday's Spending*\n${line}`);
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
  // Filter to genuinely open disputes — the legacy `(resolved,dismissed)`
  // exclusion missed every `resolved_*` variant (resolved_won /
  // resolved_partial / resolved_lost) plus `closed` and `withdrawn`, so
  // resolved cases were leaking into the "Open Disputes" count and
  // crowding the list. Use a positive whitelist of the agent-state machine's
  // OPEN states instead, falling back to `status` when agent_state is null
  // (legacy rows from before the agent state machine shipped).
  const OPEN_DISPUTE_STATUSES = new Set([
    'open',
    'draft',
    'sent',
    'responded',
    'awaiting_response',
    'awaiting_user_input',
    'escalation_due',
    'escalated',
    'still_open',
    'timeout',
  ]);
  const isOpenDispute = (d: { status: string | null; agent_state: string | null }): boolean => {
    const s = (d.agent_state ?? d.status ?? '').toLowerCase();
    if (!s) return false;
    // Belt-and-braces — any status containing "resolv", "won", "lost",
    // "dismiss", "withdraw", "closed" is closed regardless of whitelist.
    if (/resolv|won|lost|dismiss|withdraw|closed/.test(s)) return false;
    return OPEN_DISPUTE_STATUSES.has(s);
  };

  const { data: allDisputes } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, status, agent_state, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  const openDisputes = (
    (allDisputes ?? []) as Array<{
      provider_name: string;
      issue_type: string;
      status: string | null;
      agent_state: string | null;
      updated_at: string | null;
    }>
  ).filter(isOpenDispute);

  if (openDisputes.length > 0) {
    let disputeSection = `\n\n*Open Disputes (${openDisputes.length})*`;
    // No truncation — listing every open dispute so the user can act on
    // each. If the list grows past the WhatsApp 3900-char cap the
    // `toWhatsAppPlainText` helper will tail-truncate, but Telegram has
    // its own chunked-message support so the full list survives there.
    for (const d of openDisputes) {
      const displayState = d.agent_state ?? d.status ?? 'open';
      const daysAgo = d.updated_at
        ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const ageStr = daysAgo !== null ? ` · ${daysAgo}d since update` : '';
      disputeSection += `\n  - ${d.provider_name}: ${d.issue_type} (${displayState})${ageStr}`;
    }
    sections.push(disputeSection);
  }

  // ------ 6. Inbox findings (new email-scan opportunities, last 48h) ------
  // Surface anything the email scanner has flagged in the last two days —
  // price increases, bills, contract renewals, dispute responses, etc.
  // This is the data behind the WhatsApp template's "scanned/opportunities"
  // line so it needs to be real, not a section-header count.
  const findingsSince = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: recentFindings } = await supabase
    .from('email_scan_findings')
    .select('finding_type, provider, title, urgency, amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', findingsSince)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentFindings && recentFindings.length > 0) {
    const URGENCY_RANK: Record<string, number> = { immediate: 0, soon: 1, routine: 2 };
    const sorted = [...(recentFindings as Array<{ finding_type: string; provider: string | null; title: string; urgency: string | null; amount: number | string | null }>)]
      .sort((a, b) => (URGENCY_RANK[a.urgency ?? 'routine'] ?? 9) - (URGENCY_RANK[b.urgency ?? 'routine'] ?? 9));
    let inboxSection = `\n\n*Inbox Findings (${recentFindings.length} new)*`;
    for (const f of sorted) {
      const tag = f.urgency === 'immediate' ? '🚨 ' : f.urgency === 'soon' ? '⏰ ' : '• ';
      const amountStr = f.amount != null ? ` (${fmt(Number(f.amount))})` : '';
      inboxSection += `\n  ${tag}${f.provider ?? f.finding_type}: ${f.title}${amountStr}`;
    }
    sections.push(inboxSection);
  }

  // ------ 7. Money-saving tip of the day ------
  sections.push(`\n\n💡 *Tip of the Day*\n${MONEY_TIPS[tipIndex]}`);

  return sections.join('');
}

// `dispatchWhatsAppMorningBrief` (and its helpers `toWhatsAppPlainText`,
// `isInsideWhatsAppServiceWindow`, `isIntentionalTemplateSkip`) were
// extracted to `src/lib/whatsapp/morning-brief.ts` on 2026-05-03 so the
// "Send test brief to me now" admin button at /dashboard/admin/whatsapp
// can fire the exact same per-user dispatch. The cron now imports from
// the lib helper at the top of this file.

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Telegram is OPTIONAL — environments running WhatsApp-only (no
  // Telegram bot token configured) must still be able to fan out the
  // morning brief to active whatsapp_sessions.
  //
  // We deliberately do NOT 4xx/5xx here on missing TELEGRAM_USER_BOT_TOKEN.
  // The Codex P2 finding was that an early 500 would silently block
  // independent WhatsApp dispatch — so the token check is deferred
  // until AFTER session loading and only treated as a problem when
  // there are actually Telegram recipients to send to. If there are
  // zero eligible Telegram sessions, missing token is a no-op.
  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);

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

  // POST-SESSION-LOAD Telegram gate (P2 fix): only treat the missing
  // bot token as a problem when there are actually Telegram recipients
  // to send to. With zero eligible Telegram sessions, missing token is
  // a no-op and the WhatsApp path proceeds independently below.
  const telegramEnabled = Boolean(token);
  if (eligibleSessions.length > 0 && !telegramEnabled) {
    console.warn(
      '[telegram-morning-summary] TELEGRAM_USER_BOT_TOKEN not set despite ' +
        `${eligibleSessions.length} eligible Telegram session(s) — those users ` +
        'will be skipped this run; WhatsApp dispatch continues.',
    );
  }

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
  // The Telegram dispatch loop only runs when the bot token is present.
  // When telegramEnabled is false, users with both Telegram and WhatsApp
  // sessions get picked up by the WhatsApp-only loop below (the
  // whatsappDispatchedUserIds Set stays empty so no user is skipped).
  if (telegramEnabled && token) {
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
            if (waOutcome.status === 'sent') {
              whatsappSent++;
            } else if (waOutcome.status === 'skipped') {
              whatsappSkipped++;
            } else {
              // 'error' — operational failure (Twilio HTTP, network,
              // auth, bad phone format, etc). Surface to on-call.
              whatsappErrors.push(`${userId}: ${waOutcome.reason ?? 'unknown'}`);
            }
          } catch (waErr) {
            // Defensive: dispatchWhatsAppMorningBrief no longer throws,
            // but if anything in the surrounding code (Supabase lookups,
            // etc) does, treat that as an error rather than a skip.
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
      if (waOutcome.status === 'sent') {
        whatsappSent++;
      } else if (waOutcome.status === 'skipped') {
        whatsappSkipped++;
      } else {
        // 'error' — operational failure, push to whatsappErrors so the
        // route's response body and on-call alerting reflect reality.
        whatsappErrors.push(`${userId}: ${waOutcome.reason ?? 'unknown'}`);
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

  // Alert founder if the cron ran with eligible users but sent nothing.
  // Skipped when Telegram isn't configured (no token to call the API with).
  const founderChatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (
    telegramEnabled &&
    token &&
    founderChatId &&
    eligibleSessions.length > 0 &&
    sent === 0 &&
    errors.length > 0
  ) {
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
