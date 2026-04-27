/**
 * Telegram Contract Expiry Cron
 *
 * Runs daily at 8am. Alerts Pro users about contracts expiring in 30/14/7 days.
 * Includes current cost and any matching affiliate deals to show savings potential.
 * Offers to draft a switch letter or cancellation email.
 *
 * Uses the subscriptions table (contract_end_date field) as the source of truth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';

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
    day: 'numeric',
    month: 'short',
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

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<boolean> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) return false;
  }
  return true;
}

const CATEGORY_TO_DEAL: Record<string, string> = {
  broadband: 'broadband',
  mobile: 'mobile',
  energy: 'energy',
  insurance: 'insurance',
  streaming: 'streaming',
};

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const in30DaysStr = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get all active sessions
  const { data: sessions } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // Filter to Pro users (includes onboarding trial users)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .in('id', sessions.map((s) => s.user_id));

  // Eligibility helper handles past_due / unpaid / incomplete (Stripe
  // retry window) so users keep getting alerts during the 7-day grace
  // before auto-demotion. See lib/telegram/eligibility.ts.
  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => isProPocketAgentEligible(p))
      .map((p) => p.id),
  );

  const proSessions = sessions.filter((s) => proUserIds.has(s.user_id));
  if (proSessions.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Check alert preferences
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, proactive_alerts, contract_expiry_alerts')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligible = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    if (!pref) return true;
    return pref.proactive_alerts !== false && pref.contract_expiry_alerts !== false;
  });

  // Pre-load affiliate deals for matching
  const { data: allDeals } = await supabase
    .from('affiliate_deals')
    .select('id, provider_name, category, monthly_price, description, deal_url')
    .eq('is_active', true)
    .order('monthly_price', { ascending: true });

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Contracts expiring in next 30 days
      const { data: expiring } = await supabase
        .from('subscriptions')
        .select('id, provider_name, contract_end_date, amount, billing_cycle, category')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('contract_end_date', 'is', null)
        .gte('contract_end_date', todayStr)
        .lte('contract_end_date', in30DaysStr)
        .order('contract_end_date', { ascending: true });

      if (!expiring || expiring.length === 0) continue;

      // Check notification_log — only alert each contract once per milestone (7, 14, 30 days)
      const sentAlerts = new Set<string>();
      for (const contract of expiring) {
        const endDate = new Date(contract.contract_end_date);
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const milestone = daysLeft <= 7 ? 7 : daysLeft <= 14 ? 14 : 30;
        const refKey = `${contract.id}_${milestone}d`;

        const { data: existing } = await supabase
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'contract_expiry')
          .eq('reference_key', refKey)
          .single();

        if (!existing) sentAlerts.add(refKey);
      }

      // Build alerts for unsent milestones
      for (const contract of expiring) {
        const endDate = new Date(contract.contract_end_date);
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const milestone = daysLeft <= 7 ? 7 : daysLeft <= 14 ? 14 : 30;
        const refKey = `${contract.id}_${milestone}d`;

        if (!sentAlerts.has(refKey)) continue;

        const monthly = contract.billing_cycle === 'yearly'
          ? Number(contract.amount) / 12
          : contract.billing_cycle === 'quarterly'
            ? Number(contract.amount) / 3
            : Number(contract.amount);

        const urgencyEmoji = daysLeft <= 7 ? '🔴' : daysLeft <= 14 ? '🟠' : '🟡';
        const dealCategory = CATEGORY_TO_DEAL[contract.category?.toLowerCase() ?? ''];
        const matchingDeals = dealCategory
          ? (allDeals ?? [])
            .filter((d) => d.category?.toLowerCase() === dealCategory && d.monthly_price < monthly)
            .slice(0, 2)
          : [];

        let message =
          `${urgencyEmoji} *${contract.provider_name}* contract ends in *${daysLeft} days*\n\n` +
          `Current cost: ${fmt(monthly)}/month (${fmt(monthly * 12)}/year)\n` +
          `Ends: ${fmtDate(contract.contract_end_date)}\n`;

        if (matchingDeals.length > 0) {
          const cheapest = matchingDeals[0];
          const annualSaving = (monthly - cheapest.monthly_price) * 12;
          message += `\n💡 *Best alternative found:*\n`;
          message += `${cheapest.provider_name} — ${fmt(cheapest.monthly_price)}/month\n`;
          message += `Potential saving: *${fmt(annualSaving)}/year*\n`;
        }

        message += `\n_Ask me to "draft a switch letter for ${contract.provider_name}" or show all deals_`;

        const ok = await sendTelegramMessage(token, Number(chatId), message);
        if (ok) {
          sent++;
          await supabase.from('notification_log').insert({
            user_id: userId,
            notification_type: 'contract_expiry',
            reference_key: refKey,
          }).select().single();
        } else {
          errors.push(`Failed chat ${chatId}`);
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-contract-expiry] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
