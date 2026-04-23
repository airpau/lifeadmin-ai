/**
 * Telegram Price Increase Detection Cron
 *
 * Runs daily after bank sync. Compares this month's recurring payment amounts
 * to previous months to detect price rises > £1.
 *
 * Routing:
 *   > £20/mo increase  → send immediately via sendProactiveAlert (creates detected_issue)
 *   ≤ £20/mo increase  → queue to telegram_pending_alerts for the evening digest
 *
 * Uses notification_log to prevent re-alerting the same price increase in the same month.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendProactiveAlert } from '@/lib/telegram/user-bot';
import { queueTelegramAlert } from '@/lib/telegram/queue';

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

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk)\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip trailing space+digit(s) banks append to disambiguate duplicate direct debits
// e.g. "Onestream Broadband 1" → "Onestream Broadband"
function normaliseProviderName(name: string): string {
  return name.replace(/\s+\d+$/, '').trim();
}

// Maximum plausible monthly amount per subscription category.
// Transactions above this ceiling are almost certainly mismatched (e.g. a
// large loan DD sharing a keyword with a broadband sub) and must not be
// treated as a price increase.
const CATEGORY_MAX_AMOUNT: Record<string, number> = {
  streaming:   50,
  broadband:  150,
  mobile:     150,
  fitness:    150,
  software:   200,
  water:      200,
  energy:     500,
  insurance:  400,
  council_tax:400,
  business_rates:3000,
  credit:    1000,
  loans:     2000,
  mortgage:  5000,
};
const DEFAULT_MAX_AMOUNT = 300;

// Only recurring payment categories are valid for price-increase comparison.
// Comparing a DD against a bank transfer or one-off purchase produces false positives.
const RECURRING_TX_CATEGORIES = new Set([
  'DIRECT_DEBIT', 'STANDING_ORDER', 'direct_debit', 'standing_order',
]);

function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter.substring(0, Math.min(shorter.length, 8)));
}


export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();

  // Current month window
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Previous month window
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = thisMonthStart;

  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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

  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => {
        const hasStripe = !!p.stripe_subscription_id;
        const isActivePro = p.subscription_tier === 'pro' &&
          (hasStripe
            ? ['active', 'trialing'].includes(p.subscription_status ?? '')
            : p.subscription_status === 'trialing');
        const isOnboardingTrial = !!p.trial_ends_at &&
          p.trial_ends_at > new Date().toISOString() &&
          !p.trial_converted_at &&
          !p.trial_expired_at;
        return isActivePro || (!hasStripe && isOnboardingTrial);
      })
      .map((p) => p.id),
  );

  const proSessions = sessions.filter((s) => proUserIds.has(s.user_id));
  if (proSessions.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Check alert preferences
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, proactive_alerts, price_increase_alerts')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligible = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    if (!pref) return true;
    return pref.proactive_alerts !== false && pref.price_increase_alerts !== false;
  });

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Get active subscriptions
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('id, provider_name, amount, billing_cycle, category')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('billing_cycle', ['monthly', 'quarterly']);

      if (!subscriptions || subscriptions.length === 0) continue;

      // Get transactions for both months (category included for payment-type guard)
      const [thisMonthRes, prevMonthRes] = await Promise.all([
        supabase
          .from('bank_transactions')
          .select('merchant_name, description, amount, category')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', thisMonthStart)
          .lt('timestamp', thisMonthEnd),
        supabase
          .from('bank_transactions')
          .select('merchant_name, description, amount, category')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', prevMonthStart)
          .lt('timestamp', prevMonthEnd),
      ]);

      const thisTxns = thisMonthRes.data ?? [];
      const prevTxns = prevMonthRes.data ?? [];

      // For each subscription, find matching transactions and compare amounts
      const increases: Array<{
        name: string;
        prevAmount: number;
        newAmount: number;
        increase: number;
        annualIncrease: number;
      }> = [];

      for (const sub of subscriptions) {
        // Only match Direct Debit / Standing Order transactions — comparing a DD
        // against a one-off purchase or bank transfer produces false positives
        const thisSub = thisTxns
          .filter((t) => RECURRING_TX_CATEGORIES.has(t.category ?? '') && namesMatch(sub.provider_name, t.merchant_name || t.description || ''))
          .map((t) => Math.abs(Number(t.amount)));

        const prevSub = prevTxns
          .filter((t) => RECURRING_TX_CATEGORIES.has(t.category ?? '') && namesMatch(sub.provider_name, t.merchant_name || t.description || ''))
          .map((t) => Math.abs(Number(t.amount)));

        // Need at least one match in each month
        if (thisSub.length === 0 || prevSub.length === 0) continue;

        const thisAmt = Math.max(...thisSub);
        const prevAmt = Math.max(...prevSub);
        const increase = thisAmt - prevAmt;

        // Only alert if increase > £1
        if (increase <= 1) continue;

        // Sanity: skip if the new amount exceeds the plausible ceiling for this category.
        // A £480 DD matched to a broadband subscription is a mismatched transaction.
        const maxPlausible = CATEGORY_MAX_AMOUNT[sub.category ?? ''] ?? DEFAULT_MAX_AMOUNT;
        if (thisAmt > maxPlausible) continue;

        // Sanity: skip if the increase is more than 100% (doubling in one month).
        // Legitimate price rises are incremental; a 100%+ jump is a data anomaly.
        if (prevAmt > 0 && increase / prevAmt > 1.0) continue;

        // Normalise away trailing digit suffixes banks use to disambiguate duplicate DDs
        // e.g. "Onestream Broadband 1" → "Onestream Broadband"
        const normName = normaliseProviderName(sub.provider_name);

        // Check we haven't already alerted for this increase this month.
        // Check both the new normalised key AND the legacy raw key so users who
        // received an alert before this deploy (old key format) aren't re-alerted.
        const newKey = `${normName.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;
        const legacyKey = `${sub.provider_name.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;
        const { data: existing } = await supabase
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'price_increase')
          .in('reference_key', [newKey, legacyKey])
          .maybeSingle();

        if (existing) continue;

        const annualIncrease = increase * 12;
        increases.push({ name: normName, prevAmount: prevAmt, newAmount: thisAmt, increase, annualIncrease });
      }

      if (increases.length === 0) continue;

      // Deduplicate by normalised name — multiple subscription rows for the same
      // provider (e.g. "Onestream Broadband 1/2/3") must only produce one alert
      const seenNames = new Set<string>();
      const dedupedIncreases = increases.filter((inc) => {
        const key = inc.name.toLowerCase();
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });

      // Route each increase: > £20/mo → immediate send with inline buttons
      //                       ≤ £20/mo → queue for evening digest
      for (const inc of dedupedIncreases) {
        const refKey = `${inc.name.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;

        if (inc.increase > 20) {
          // Urgent: create a detected_issue so draft_dispute_ handler can find it,
          // then send immediately with inline keyboard
          const title = `${inc.name} raised your direct debit`;
          const detail =
            `Your ${inc.name} payment went up by ${fmt(inc.increase)}/month ` +
            `(${fmt(inc.prevAmount)} → ${fmt(inc.newAmount)}). ` +
            `That's *${fmt(inc.annualIncrease)} more per year.*`;

          const { data: issue } = await supabase
            .from('detected_issues')
            .insert({
              user_id:     userId,
              issue_type:  'price_increase',
              title,
              detail,
              source_type: 'bank_transaction',
              amount_impact: inc.annualIncrease,
              telegram_chat_id: chatId,
              status: 'active',
            })
            .select('id')
            .single();

          if (issue) {
            const { ok, messageId } = await sendProactiveAlert({
              chatId: Number(chatId),
              issue: { id: issue.id, title, detail, recommendation: null, amount_impact: inc.annualIncrease, issue_type: 'price_increase' },
            });

            if (ok) {
              sent++;
              if (messageId) {
                await supabase
                  .from('detected_issues')
                  .update({ telegram_message_id: messageId, delivered_at: new Date().toISOString() })
                  .eq('id', issue.id);
              }
              await supabase.from('notification_log').insert({
                user_id: userId,
                notification_type: 'price_increase',
                reference_key: refKey,
              }).select().single();
            } else {
              errors.push(`Failed chat ${chatId}`);
            }
          }
        } else {
          // Non-urgent: queue for the daily digest
          const queued = await queueTelegramAlert(supabase, {
            userId,
            chatId:      Number(chatId),
            alertType:   'price_increase',
            providerName: inc.name,
            amount:      inc.newAmount,
            amountChange: inc.increase,
            referenceKey: `bankdet_price_${refKey}`,
            metadata:    { source: 'bank_detection', prev_amount: inc.prevAmount, annual_increase: inc.annualIncrease },
          });

          if (queued) {
            sent++;
            await supabase.from('notification_log').insert({
              user_id: userId,
              notification_type: 'price_increase',
              reference_key: refKey,
            }).select().single();
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-price-increase-detection] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
