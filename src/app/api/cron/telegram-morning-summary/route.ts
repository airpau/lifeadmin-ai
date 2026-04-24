/**
 * Telegram Morning Summary Cron
 *
 * Runs at 7:30am UK time daily. Sends each linked Pro user a morning
 * financial briefing covering yesterday's spending, upcoming renewals,
 * expiring contracts, budget warnings, open disputes, and a money tip.
 *
 * Uses the Telegram Bot API directly (fetch to api.telegram.org) with
 * the TELEGRAM_USER_BOT_TOKEN.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function fmtGbp(amount: number): string {
  return `£${Math.abs(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMerchant(raw: string): string {
  const trimmed = raw.trim();
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return capped.length > 25 ? capped.slice(0, 25) + '\u2026' : capped;
}

function escapeMd(text: string): string {
  // Escape Telegram MarkdownV1 special chars: _ * ` [
  return text.replace(/([_*`\[])/g, '\\$1');
}

function fmtDisputeStatus(status: string): string {
  const normalised = status.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const map: Record<string, string> = {
    'resolved won': 'resolved (won)',
    'resolvedwon': 'resolved (won)',
    'resolved lost': 'resolved (lost)',
    'resolvedlost': 'resolved (lost)',
    'awaiting response': 'awaiting response',
    'awaitingresponse': 'awaiting response',
    'in progress': 'in progress',
    'inprogress': 'in progress',
  };
  return map[normalised] ?? normalised;
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
  const errors: string[] = [];

  // -------------------------------------------------------
  // Get all active linked Pro users
  // -------------------------------------------------------
  const { data: sessions, error: sessErr } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (sessErr || !sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  const userIds = sessions.map((s) => s.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id')
    .in('id', userIds);

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

  // Check alert preferences — skip users who disabled morning summary
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, morning_summary')
    .in('user_id', proSessions.map(s => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map(p => [p.user_id, p]));
  const eligibleSessions = proSessions.filter(s => {
    const pref = prefMap.get(s.user_id);
    return !pref || pref.morning_summary !== false; // default to on
  });

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
  for (const session of eligibleSessions) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Check if user has any bank transaction data at all
      const { count: txCount } = await supabase
        .from('bank_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!txCount || txCount === 0) {
        skipped++;
        continue;
      }

      const sections: string[] = [];
      sections.push('*Good morning! Here\'s your daily money briefing:*');

      // ------ 1. Yesterday's spending ------
      const EXCLUDE_CATS = new Set(['transfers', 'income', 'internal_transfer']);
      const { data: yesterdayTxRaw } = await supabase
        .from('bank_transactions')
        .select('merchant_name, description, user_category, amount')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', yesterdayStart.toISOString())
        .lt('timestamp', todayStart.toISOString());

      const yesterdayTx = (yesterdayTxRaw ?? []).filter(
        t => !EXCLUDE_CATS.has(t.user_category ?? ''),
      );

      if (yesterdayTx.length > 0) {
        const total = yesterdayTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

        const sorted = [...yesterdayTx].sort(
          (a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)),
        );
        const displayed = sorted.slice(0, 8);
        const remainder = sorted.slice(8);
        const remainderTotal = remainder.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

        let spendingSection = `\n\n*Yesterday's Spending (${fmtGbp(total)})*`;
        for (const t of displayed) {
          const name = escapeMd(fmtMerchant(t.merchant_name?.trim() || t.description?.trim() || 'Unknown'));
          spendingSection += `\n  \u2022 ${name} \u2014 ${fmtGbp(Number(t.amount))}`;
        }
        if (remainder.length > 0) {
          spendingSection += `\n  _\u2026and ${remainder.length} more (${fmtGbp(remainderTotal)})_`;
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
          renewalSection += `\n  - ${escapeMd(sub.provider_name)}: ${fmt(Number(sub.amount))}/${sub.billing_cycle ?? 'month'} (${when})`;
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
        for (const c of expiringContracts) {
          contractSection += `\n  - ${escapeMd(c.provider_name)}: ends ${fmtDate(c.contract_end_date)}`;
        }
        sections.push(contractSection);
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
          budgetSection += `\n  ${emoji} ${escapeMd(w.category)}: ${fmt(w.spent)} / ${fmt(w.limit)} (${Math.round(w.pct)}%)`;
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
        for (const d of openDisputes.slice(0, 3)) {
          disputeSection += `\n  - ${escapeMd(d.provider_name)}: ${escapeMd(d.issue_type)} (${escapeMd(fmtDisputeStatus(d.status))})`;
        }
        if (openDisputes.length > 3) {
          disputeSection += `\n  _...and ${openDisputes.length - 3} more_`;
        }
        sections.push(disputeSection);
      }

      // ------ 6. Money-saving tip of the day ------
      sections.push(`\n\n\ud83d\udca1 *Tip of the Day*\n${MONEY_TIPS[tipIndex]}`);

      // ------ Build and send ------
      const message = sections.join('');
      const ok = await sendTelegramMessage(token, Number(chatId), message);

      if (ok) {
        sent++;
      } else {
        errors.push(`Failed to send to user ${userId}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-morning-summary] Error for user ${userId}:`, errMsg);
      errors.push(`${userId}: ${errMsg}`);
    }
  }

  console.log(
    `[telegram-morning-summary] Processed ${proSessions.length} users, sent ${sent}, skipped ${skipped}, errors ${errors.length}`,
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
  });
}
