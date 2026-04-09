/**
 * Telegram Proactive Alerts Cron
 *
 * Closed-loop step 1: DETECT and NOTIFY
 *
 * Runs every 6 hours. For each linked Pro user, checks for:
 * 1. Active price increase alerts not yet actioned
 * 2. Contracts expiring within 30 days
 * 3. Budget overruns (category > 100% of monthly limit)
 * 4. Disputes with no response after 14 days (follow-up)
 * 5. Subscriptions renewing within 7 days
 *
 * Pushes actionable Telegram messages with inline keyboard buttons.
 * Deduplicates: each issue is sent at most once per 7 days.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendProactiveAlert } from '@/lib/telegram/user-bot';

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

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const results: Array<{ userId: string; type: string; sent: boolean; reason?: string }> = [];

  // Get all active linked Pro users
  const { data: sessions, error: sessErr } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (sessErr || !sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // Verify each user is still on Pro
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

  for (const session of proSessions) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    // Check for existing active detected_issues to avoid duplicates
    const { data: existingIssues } = await supabase
      .from('detected_issues')
      .select('issue_type, source_id, created_at')
      .eq('user_id', userId)
      .in('status', ['active', 'actioned'])
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const recentTypes = new Set(existingIssues?.map((i) => `${i.issue_type}:${i.source_id}`) ?? []);

    // --------------------------------------------------------
    // 1. Price increase alerts
    // --------------------------------------------------------
    const { data: priceAlerts } = await supabase
      .from('price_increase_alerts')
      .select('id, merchant_name, old_amount, new_amount, increase_pct, annual_impact')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('annual_impact', { ascending: false })
      .limit(3);

    for (const alert of priceAlerts ?? []) {
      const key = `price_increase:${alert.id}`;
      if (recentTypes.has(key)) continue;

      const increase = Number(alert.new_amount) - Number(alert.old_amount);
      const title = `${alert.merchant_name ?? 'A provider'} raised your direct debit`;
      const detail =
        `Your ${alert.merchant_name ?? 'provider'} payment went up by ${fmt(increase)}/month ` +
        `(${fmt(Number(alert.old_amount))} → ${fmt(Number(alert.new_amount))}). ` +
        `That's *${fmt(Number(alert.annual_impact))} more per year.*`;
      const recommendation = null; // Action button handles this — no "Ask me:" fallback needed

      const { data: issue } = await supabase
        .from('detected_issues')
        .insert({
          user_id: userId,
          issue_type: 'price_increase',
          title,
          detail,
          recommendation,
          source_type: 'bank_transaction',
          source_id: alert.id,
          amount_impact: alert.annual_impact,
          telegram_chat_id: chatId,
          status: 'active',
        })
        .select('id')
        .single();

      if (issue) {
        const { ok, messageId } = await sendProactiveAlert({
          chatId: Number(chatId),
          issue: { id: issue.id, title, detail, recommendation, amount_impact: Number(alert.annual_impact), issue_type: 'price_increase' },
        });

        if (ok && messageId) {
          await supabase
            .from('detected_issues')
            .update({ telegram_message_id: messageId, delivered_at: new Date().toISOString() })
            .eq('id', issue.id);
        }
        results.push({ userId, type: 'price_increase', sent: ok });
      }
    }

    // --------------------------------------------------------
    // 2. Contracts expiring within 30 days
    // --------------------------------------------------------
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const { data: expiringContracts } = await supabase
      .from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, contract_end_date, auto_renews, early_exit_fee')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', today)
      .lte('contract_end_date', in30)
      .limit(3);

    for (const contract of expiringContracts ?? []) {
      const key = `contract_expiring:${contract.id}`;
      if (recentTypes.has(key)) continue;

      const endDate = new Date(contract.contract_end_date);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const cycle = contract.billing_cycle ?? 'monthly';
      const annualCost = Number(contract.amount) * (cycle === 'monthly' ? 12 : cycle === 'quarterly' ? 4 : 1);

      const title = `${contract.provider_name} contract ends in ${daysLeft} days`;
      const detail =
        `Your ${contract.provider_name} contract ends on ${fmtDate(contract.contract_end_date)}.` +
        (contract.auto_renews
          ? ` It will *auto-renew* if you don't act. Annual cost: ${fmt(annualCost)}.`
          : ` It will expire. Current cost: ${fmt(annualCost)}/year.`);
      const recommendation =
        daysLeft <= 14
          ? `Now is the best time to switch or negotiate — providers often offer better rates when you're about to leave.`
          : `You have time to compare deals before this renews.`;

      const { data: issue } = await supabase
        .from('detected_issues')
        .insert({
          user_id: userId,
          issue_type: 'contract_expiring',
          title,
          detail,
          recommendation,
          source_type: 'subscription',
          source_id: contract.id,
          amount_impact: annualCost,
          telegram_chat_id: chatId,
          status: 'active',
        })
        .select('id')
        .single();

      if (issue) {
        const { ok, messageId } = await sendProactiveAlert({
          chatId: Number(chatId),
          issue: { id: issue.id, title, detail, recommendation, amount_impact: annualCost, issue_type: 'contract_expiring' },
        });

        if (ok && messageId) {
          await supabase
            .from('detected_issues')
            .update({ telegram_message_id: messageId, delivered_at: new Date().toISOString() })
            .eq('id', issue.id);
        }
        results.push({ userId, type: 'contract_expiring', sent: ok });
      }
    }

    // --------------------------------------------------------
    // 3. Budget overruns (current month)
    // --------------------------------------------------------
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [budgets, transactions] = await Promise.all([
      supabase
        .from('money_hub_budgets')
        .select('category, monthly_limit')
        .eq('user_id', userId),
      supabase
        .from('bank_transactions')
        .select('category, amount')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', monthStart)
        .lt('timestamp', monthEnd),
    ]);

    const spent: Record<string, number> = {};
    for (const t of transactions.data ?? []) {
      const cat = t.category ?? 'Other';
      spent[cat] = (spent[cat] ?? 0) + Math.abs(Number(t.amount));
    }

    for (const budget of budgets.data ?? []) {
      const limit = Number(budget.monthly_limit);
      const spentAmt = spent[budget.category] ?? 0;
      if (spentAmt <= limit) continue;

      const overBy = spentAmt - limit;
      const key = `budget_overrun:${userId}:${budget.category}:${now.getFullYear()}-${now.getMonth()}`;

      // Use category+month as dedup key
      const { data: existingOverrun } = await supabase
        .from('detected_issues')
        .select('id')
        .eq('user_id', userId)
        .eq('issue_type', 'budget_overrun')
        .ilike('title', `%${budget.category}%`)
        .gte('created_at', monthStart)
        .single();

      if (existingOverrun) continue;

      const title = `${budget.category} budget exceeded`;
      const detail = `You've spent ${fmt(spentAmt)} on ${budget.category} this month — *${fmt(overBy)} over your ${fmt(limit)} budget.*`;
      const recommendation = `Ask me to show a breakdown of your ${budget.category} spending, or I can help you identify which subscriptions to cut.`;

      const { data: issue } = await supabase
        .from('detected_issues')
        .insert({
          user_id: userId,
          issue_type: 'budget_overrun',
          title,
          detail,
          recommendation,
          source_type: 'budget',
          amount_impact: overBy * 12,
          telegram_chat_id: chatId,
          status: 'active',
        })
        .select('id')
        .single();

      if (issue) {
        const { ok, messageId } = await sendProactiveAlert({
          chatId: Number(chatId),
          issue: { id: issue.id, title, detail, recommendation, amount_impact: overBy * 12, issue_type: 'budget_overrun' },
        });

        if (ok && messageId) {
          await supabase
            .from('detected_issues')
            .update({ telegram_message_id: messageId, delivered_at: new Date().toISOString() })
            .eq('id', issue.id);
        }
        results.push({ userId, type: 'budget_overrun', sent: ok });
      }
    }

    // --------------------------------------------------------
    // 4. Dispute follow-ups (14-day no response reminder)
    // --------------------------------------------------------
    const { data: followUpIssues } = await supabase
      .from('detected_issues')
      .select('*')
      .eq('user_id', userId)
      .eq('issue_type', 'dispute_no_response')
      .eq('status', 'actioned')
      .not('follow_up_due_at', 'is', null)
      .lte('follow_up_due_at', new Date().toISOString())
      .is('follow_up_sent_at', null)
      .limit(3);

    for (const issue of followUpIssues ?? []) {
      const followUpText = {
        title: `${issue.title} — 14-day deadline passed`,
        detail: `It's been 14 days since your complaint was sent. No response yet means you can escalate to the relevant regulator or ombudsman.`,
        recommendation: `Ask me: "Escalate my complaint" and I'll help you take the next step.`,
      };

      const { ok, messageId } = await sendProactiveAlert({
        chatId: Number(chatId),
        issue: {
          id: issue.id,
          title: followUpText.title,
          detail: followUpText.detail,
          recommendation: followUpText.recommendation,
          amount_impact: null,
          issue_type: issue.issue_type,
        },
        showFollowUpButtons: true,
      });

      if (ok) {
        await supabase
          .from('detected_issues')
          .update({ follow_up_sent_at: new Date().toISOString() })
          .eq('id', issue.id);
        results.push({ userId, type: 'dispute_follow_up', sent: true });
      }
    }

    // --------------------------------------------------------
    // 5. Subscriptions renewing in 7 days
    // --------------------------------------------------------
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const in3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: renewingSoon } = await supabase
      .from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, next_billing_date, auto_renews')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('next_billing_date', today)
      .lte('next_billing_date', in7)
      .limit(5);

    for (const sub of renewingSoon ?? []) {
      const key = `renewal_imminent:${sub.id}`;
      if (recentTypes.has(key)) continue;

      const daysLeft = Math.ceil(
        (new Date(sub.next_billing_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft > 3) continue; // Only alert within 3 days

      const cycle = sub.billing_cycle ?? 'monthly';
      const title = `${sub.provider_name} renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
      const detail = `${fmt(Number(sub.amount))}/${cycle} will be charged on ${fmtDate(sub.next_billing_date)}.`;
      const recommendation = null; // Cancellation email button handles this

      const { data: issue } = await supabase
        .from('detected_issues')
        .insert({
          user_id: userId,
          issue_type: 'renewal_imminent',
          title,
          detail,
          recommendation,
          source_type: 'subscription',
          source_id: sub.id,
          amount_impact: Number(sub.amount) * (cycle === 'monthly' ? 12 : 1),
          telegram_chat_id: chatId,
          status: 'active',
        })
        .select('id')
        .single();

      if (issue) {
        const { ok, messageId } = await sendProactiveAlert({
          chatId: Number(chatId),
          issue: { id: issue.id, title, detail, recommendation, amount_impact: null, issue_type: 'renewal_imminent' },
        });

        if (ok && messageId) {
          await supabase
            .from('detected_issues')
            .update({ telegram_message_id: messageId, delivered_at: new Date().toISOString() })
            .eq('id', issue.id);
        }
        results.push({ userId, type: 'renewal_imminent', sent: ok });
      }
    }
  }

  const sent = results.filter((r) => r.sent).length;
  console.log(`[telegram-alerts] Processed ${proSessions.length} users, sent ${sent} alerts`);

  return NextResponse.json({ ok: true, users: proSessions.length, alerts_sent: sent, results });
}
