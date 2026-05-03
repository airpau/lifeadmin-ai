/**
 * Pocket Agent Morning Summary Cron
 *
 * Runs at 7:30am UK time daily. Sends each linked Pro user a morning
 * financial briefing covering yesterday's spending, upcoming renewals,
 * expiring contracts, budget warnings, open disputes, and a money tip.
 *
 * Channel-agnostic since 2026-05-03: dispatches to BOTH Telegram and
 * WhatsApp when the user has an active session on each channel. The
 * mutex on `whatsapp_sessions` ↔ `telegram_sessions` is a soft guarantee
 * (it can race during a switch), so we treat the channels as
 * independent and de-dup on the server side via per-user iteration.
 *
 * Telegram path: existing direct fetch to api.telegram.org with
 * TELEGRAM_USER_BOT_TOKEN.
 *
 * WhatsApp path: smart 24h-window routing — inside the customer-service
 * window we send the full Markdown brief as free-form text (£0, no
 * marketing fee). Outside the window we fall back to the
 * `paybacker_morning_summary` Meta-approved template (4 vars: name,
 * scanned_count, opportunities_count, top_focus). The template is
 * MARKETING-category, so we honour the marketing opt-in + 24h frequency
 * cap stored on the session row. See `src/lib/whatsapp/template-registry.ts`.
 *
 * Opt-out: same `telegram_alert_preferences.morning_summary` flag governs
 * BOTH channels — there is no separate `whatsapp_alert_preferences`
 * table. If a Pro user has `morning_summary = false`, we skip both
 * dispatches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppText, sendWhatsAppTemplate } from '@/lib/whatsapp';
import { TEMPLATES } from '@/lib/whatsapp/template-registry';

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
  let whatsappSent = 0;
  let whatsappSkipped = 0;
  const errors: string[] = [];
  const whatsappErrors: string[] = [];

  // -------------------------------------------------------
  // Get all active linked Pro users (Telegram + WhatsApp)
  // -------------------------------------------------------
  const [telegramRes, whatsappRes] = await Promise.all([
    supabase
      .from('telegram_sessions')
      .select('user_id, telegram_chat_id')
      .eq('is_active', true),
    supabase
      .from('whatsapp_sessions')
      .select(
        'user_id, whatsapp_phone, last_message_at, marketing_opt_in_at, last_marketing_template_at',
      )
      .eq('is_active', true)
      .is('opted_out_at', null),
  ]);

  const sessions = telegramRes.data ?? [];
  const whatsappSessions = (whatsappRes.data ?? []) as Array<{
    user_id: string;
    whatsapp_phone: string;
    last_message_at: string | null;
    marketing_opt_in_at: string | null;
    last_marketing_template_at: string | null;
  }>;
  const sessErr = telegramRes.error;

  if ((sessErr || sessions.length === 0) && whatsappSessions.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No active sessions',
      sent: 0,
      whatsappSent: 0,
    });
  }

  // Union of user_ids across both channels — a user may be on Telegram
  // only, WhatsApp only, or (briefly during a switch) on both.
  const allUserIds = Array.from(
    new Set([
      ...sessions.map((s) => s.user_id),
      ...whatsappSessions.map((s) => s.user_id),
    ]),
  );

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, subscription_tier, subscription_status, stripe_subscription_id')
    .in('id', allUserIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => {
        const tier = p.subscription_tier;
        const status = p.subscription_status;
        const hasStripe = !!p.stripe_subscription_id;
        return (
          tier === 'pro' &&
          (hasStripe ? ['active', 'trialing'].includes(status ?? '') : status === 'trialing')
        );
      })
      .map((p) => p.id),
  );

  const proSessions = sessions.filter((s) => proUserIds.has(s.user_id));
  const proWhatsappSessions = whatsappSessions.filter((s) => proUserIds.has(s.user_id));

  // Check alert preferences — skip users who disabled morning summary.
  // The same flag governs both channels (no separate whatsapp pref table).
  const eligibleUserIds = Array.from(
    new Set([
      ...proSessions.map((s) => s.user_id),
      ...proWhatsappSessions.map((s) => s.user_id),
    ]),
  );
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, morning_summary')
    .in('user_id', eligibleUserIds);

  const prefMap = new Map((allPrefs ?? []).map(p => [p.user_id, p]));
  const isMorningSummaryEnabled = (userId: string): boolean => {
    const pref = prefMap.get(userId);
    return !pref || pref.morning_summary !== false; // default to on
  };
  const eligibleSessions = proSessions.filter((s) => isMorningSummaryEnabled(s.user_id));
  const whatsappSessionByUserId = new Map(
    proWhatsappSessions
      .filter((s) => isMorningSummaryEnabled(s.user_id))
      .map((s) => [s.user_id, s]),
  );

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
  // Process each Pro user — iterate per-user so the same body is
  // dispatched to both channels when present, with a single set of
  // expensive DB reads.
  // -------------------------------------------------------
  const eligibleTgByUser = new Map(eligibleSessions.map((s) => [s.user_id, s]));
  const allEligibleUserIds = Array.from(
    new Set([...eligibleTgByUser.keys(), ...whatsappSessionByUserId.keys()]),
  );

  for (const userId of allEligibleUserIds) {
    const tgSession = eligibleTgByUser.get(userId) ?? null;
    const waSession = whatsappSessionByUserId.get(userId) ?? null;
    const chatId = tgSession?.telegram_chat_id ?? null;

    try {
      // Check if user has any bank transaction data at all
      const { count: txCount } = await supabase
        .from('bank_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!txCount || txCount === 0) {
        if (tgSession) skipped++;
        if (waSession) whatsappSkipped++;
        continue;
      }

      // Track summary metadata for the WhatsApp template fallback
      // (paybacker_morning_summary requires name / scanned_count /
      // opportunities_count / top_focus). We populate as the body
      // is built so a single pass produces both the long Markdown
      // brief AND the short template variables.
      let opportunitiesCount = 0;
      const focusCandidates: Array<{ priority: number; label: string }> = [];

      const sections: string[] = [];
      sections.push('*Good morning! Here\'s your daily money briefing:*');

      // ------ 1. Yesterday's spending ------
      const EXCLUDE_CATS = new Set(['transfers', 'income']);
      const { data: yesterdayTxRaw } = await supabase
        .from('bank_transactions')
        .select('user_category, amount')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', yesterdayStart.toISOString())
        .lt('timestamp', todayStart.toISOString());

      const yesterdayTx = (yesterdayTxRaw ?? []).filter(
        t => !EXCLUDE_CATS.has(t.user_category ?? ''),
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
        sections.push('\n\n*Yesterday\'s Spending*\nNo spending recorded yesterday.');
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
        for (const sub of renewals) {
          const when = sub.next_billing_date === todayStr ? 'Today' : 'Tomorrow';
          renewalSection += `\n  - ${sub.provider_name}: ${fmt(Number(sub.amount))}/${sub.billing_cycle ?? 'month'} (${when})`;
        }
        sections.push(renewalSection);
        opportunitiesCount += renewals.length;
        focusCandidates.push({
          priority: 2,
          label: `${renewals.length} renewal${renewals.length === 1 ? '' : 's'} this week`,
        });
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
        for (const c of expiringContracts) {
          contractSection += `\n  - ${c.provider_name}: ends ${fmtDate(c.contract_end_date)}`;
        }
        sections.push(contractSection);
        opportunitiesCount += expiringContracts.length;
        focusCandidates.push({
          priority: 3,
          label: `${expiringContracts.length} contract${expiringContracts.length === 1 ? '' : 's'} ending soon`,
        });
      }

      // ------ 4. Budget status (categories over 80%) ------
      const [budgetsResult, monthSpendingResult] = await Promise.all([
        supabase
          .from('money_hub_budgets')
          .select('category, monthly_limit')
          .eq('user_id', userId),
        supabase.rpc('get_monthly_spending', {
          p_user_id: userId,
          p_year: now.getFullYear(),
          p_month: now.getMonth() + 1,
        }),
      ]);

      const spentByCategory: Record<string, number> = {};
      for (const row of monthSpendingResult.data ?? []) {
        spentByCategory[row.category] = Number(row.category_total);
      }

      const budgetWarnings: Array<{ category: string; spent: number; limit: number; pct: number }> =
        [];
      for (const b of budgetsResult.data ?? []) {
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
          const emoji = w.pct >= 100 ? '\u26a0\ufe0f' : '\u23f3';
          budgetSection += `\n  ${emoji} ${w.category}: ${fmt(w.spent)} / ${fmt(w.limit)} (${Math.round(w.pct)}%)`;
        }
        sections.push(budgetSection);
        opportunitiesCount += budgetWarnings.length;
        const top = budgetWarnings[0];
        focusCandidates.push({
          priority: top.pct >= 100 ? 1 : 2,
          label: `${top.category} ${Math.round(top.pct)}% of budget`,
        });
      }

      // ------ 5. Unresolved disputes ------
      const { data: openDisputes } = await supabase
        .from('disputes')
        .select('id, provider_name, issue_type, status')
        .eq('user_id', userId)
        .not('status', 'in', '(resolved,dismissed)');

      if (openDisputes && openDisputes.length > 0) {
        let disputeSection = `\n\n*Open Disputes (${openDisputes.length})*`;
        for (const d of openDisputes.slice(0, 3)) {
          disputeSection += `\n  - ${d.provider_name}: ${d.issue_type} (${d.status})`;
        }
        if (openDisputes.length > 3) {
          disputeSection += `\n  _...and ${openDisputes.length - 3} more_`;
        }
        sections.push(disputeSection);
        opportunitiesCount += openDisputes.length;
        focusCandidates.push({
          priority: 1,
          label: `${openDisputes.length} open dispute${openDisputes.length === 1 ? '' : 's'}`,
        });
      }

      // ------ 6. Money-saving tip of the day ------
      sections.push(`\n\n\ud83d\udca1 *Tip of the Day*\n${MONEY_TIPS[tipIndex]}`);

      // ------ Build and dispatch ------
      const message = sections.join('');

      // Telegram dispatch (when the user has an active TG session).
      if (tgSession && chatId) {
        const ok = await sendTelegramMessage(token, Number(chatId), message);
        if (ok) {
          sent++;
        } else {
          errors.push(`Failed to send to user ${userId}`);
        }
      }

      // WhatsApp dispatch (when the user has an active WA session).
      // Wrapped independently so a Telegram failure doesn't block the
      // WhatsApp send and vice versa.
      if (waSession) {
        try {
          const profile = profileMap.get(userId);
          const firstName =
            (profile as { first_name?: string | null } | undefined)?.first_name || 'there';
          // Top focus = highest-priority section we built for the brief.
          // Priority 1 = budget breach / disputes, 2 = renewals/budget warning,
          // 3 = contracts ending. Falls back to a friendly "all calm" line.
          focusCandidates.sort((a, b) => a.priority - b.priority);
          const topFocus = focusCandidates[0]?.label ?? 'No urgent items today';

          const inWindow =
            !!waSession.last_message_at &&
            Date.now() - new Date(waSession.last_message_at).getTime() < 24 * 60 * 60 * 1000;

          if (inWindow) {
            // Free-form: deliver the same Markdown brief the Telegram
            // user got. WhatsApp renders *bold* identically, so the
            // body needs no transformation. Chunk to stay under the
            // 4096-char WhatsApp limit (same pattern as Telegram).
            const chunks = splitMessage(message);
            let lastSid: string | undefined;
            for (const chunk of chunks) {
              const result = await sendWhatsAppText({
                to: waSession.whatsapp_phone,
                text: chunk,
              });
              lastSid = result.providerMessageId;
            }
            whatsappSent++;
            console.log(
              `[morning-summary/whatsapp] mode=text user=${userId} chunks=${chunks.length} sid=${lastSid}`,
            );
          } else {
            // Outside the 24h customer-service window: fall back to the
            // Meta-approved paybacker_morning_summary template
            // (MARKETING category \u2014 opt-in + 24h freq cap apply).
            const tpl = TEMPLATES.paybacker_morning_summary;
            if (!waSession.marketing_opt_in_at) {
              whatsappSkipped++;
              console.log(
                `[morning-summary/whatsapp] skip user=${userId} reason=no_marketing_opt_in`,
              );
            } else if (
              waSession.last_marketing_template_at &&
              Date.now() - new Date(waSession.last_marketing_template_at).getTime() <
                24 * 60 * 60 * 1000
            ) {
              whatsappSkipped++;
              console.log(
                `[morning-summary/whatsapp] skip user=${userId} reason=marketing_24h_cap`,
              );
            } else if (!tpl.sid || tpl.sid.startsWith('PENDING')) {
              // Defensive \u2014 the registry will hold a real SID once
              // approved, so this is a safety net rather than a live
              // path today (paybacker_morning_summary is approved).
              whatsappSkipped++;
              console.log(
                `[morning-summary/whatsapp] skip user=${userId} reason=template_not_approved`,
              );
            } else {
              const result = await sendWhatsAppTemplate({
                to: waSession.whatsapp_phone,
                templateName: 'paybacker_morning_summary',
                parameters: [
                  firstName,
                  String(txCount),
                  String(opportunitiesCount),
                  topFocus,
                ],
              });
              whatsappSent++;
              console.log(
                `[morning-summary/whatsapp] mode=template user=${userId} sid=${result.providerMessageId}`,
              );
              // Stamp the marketing 24h frequency cap so concurrent
              // crons can't double-charge by both deciding the cap had
              // elapsed.
              await supabase
                .from('whatsapp_sessions')
                .update({ last_marketing_template_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('is_active', true);
            }
          }
        } catch (waErr) {
          const errMsg = waErr instanceof Error ? waErr.message : String(waErr);
          console.error(
            `[morning-summary/whatsapp] Error for user ${userId}:`,
            errMsg,
          );
          whatsappErrors.push(`${userId}: ${errMsg}`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[morning-summary] Error for user ${userId}:`, errMsg);
      errors.push(`${userId}: ${errMsg}`);
    }
  }

  console.log(
    `[morning-summary] users=${allEligibleUserIds.length} ` +
      `tg_sent=${sent} tg_skipped=${skipped} tg_errors=${errors.length} ` +
      `wa_sent=${whatsappSent} wa_skipped=${whatsappSkipped} wa_errors=${whatsappErrors.length}`,
  );

  // Alert founder if the cron ran with eligible users but sent nothing
  const founderChatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (
    founderChatId &&
    allEligibleUserIds.length > 0 &&
    sent === 0 &&
    whatsappSent === 0 &&
    (errors.length > 0 || whatsappErrors.length > 0)
  ) {
    const allErrs = [...errors, ...whatsappErrors];
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(founderChatId),
        text: `Morning summary failed: ${allErrs.slice(0, 3).join('; ')}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    users: allEligibleUserIds.length,
    sent,
    skipped,
    errors: errors.length,
    whatsappSent,
    whatsappSkipped,
    whatsappErrors: whatsappErrors.length,
  });
}
