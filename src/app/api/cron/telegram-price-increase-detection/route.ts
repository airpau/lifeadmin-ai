/**
 * Telegram Price Increase Detection Cron
 *
 * Runs daily after bank sync. Detects genuine price rises on known subscriptions
 * and alerts the user via Telegram.
 *
 * Detection rules (ALL must pass before any alert is raised):
 *   1. Subscription-first: merchant must exist in subscriptions table
 *      (status: active or pending_cancellation). Food delivery, pharmacies,
 *      shops etc. are blocked unless the user explicitly added them as a sub.
 *   2. DD / SO only: only DIRECT_DEBIT or STANDING_ORDER transactions. Card
 *      payments are variable by nature and must never be flagged.
 *   3. Consistency: the "old price" must have appeared at least twice in prior
 *      months. A single prior transaction is not evidence of a fixed price.
 *   4. Category allowlist: subscription category must be broadband / mobile /
 *      streaming / energy / water / insurance / fitness / software / bills.
 *   5. Billing-cycle alignment: only compare transactions that fall within ±5
 *      days of the merchant's typical billing day-of-month.
 *   6. Bank blocklist: bank and lender names (Santander, Barclays, etc.) are
 *      always excluded — their DDs are loan / mortgage payments, not services.
 *
 * Additional sanity guards:
 *   - Increase > 100% in a single month → data anomaly, skip
 *   - New amount > per-category ceiling → mismatched transaction, skip
 *
 * Routing:
 *   > £20/mo increase  → send immediately via sendProactiveAlert
 *   ≤ £20/mo increase  → queue to telegram_pending_alerts for evening digest
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

// Strip trailing bank-appended digit suffixes that disambiguate duplicate DDs
// e.g. "Onestream Broadband 1" → "Onestream Broadband"
function normaliseProviderName(name: string): string {
  return name.replace(/\s+\d+$/, '').trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter.substring(0, Math.min(shorter.length, 8)));
}

// Rule 4: only these subscription categories are eligible for price-increase detection
const ELIGIBLE_CATEGORIES = new Set([
  'broadband', 'mobile', 'streaming', 'energy', 'utility', 'water',
  'insurance', 'fitness', 'software', 'bills', 'council_tax',
]);

// Rule 6: bank / lender names — their DDs are repayments, not service subscriptions
const BANK_BLOCKLIST: string[] = [
  'santander', 'barclays', 'barclaycard', 'hsbc', 'halifax', 'lloyds',
  'natwest', 'nationwide', 'virgin money', 'metro bank', 'first direct',
  'tesco bank', 'starling', 'monzo', 'revolut', 'tide', 'chase',
  'co-operative bank', 'cooperative bank', 'bank of scotland',
  'royal bank of scotland', 'rbs', 'clydesdale', 'yorkshire bank',
  'tsb', 'danske', 'ulster bank', 'atom bank', 'aldermore',
];

// Per-category absolute ceiling on what counts as a plausible recurring amount
const CATEGORY_MAX_AMOUNT: Record<string, number> = {
  streaming:    50,
  broadband:   150,
  mobile:      150,
  fitness:     150,
  software:    200,
  water:       200,
  energy:      500,
  insurance:   400,
  council_tax: 400,
  credit:     1000,
  loans:      2000,
  mortgage:   5000,
};
const DEFAULT_MAX_AMOUNT = 300;

// Annual multiplier per billing cycle — quarterly subs have 4 payments/year, not 12
const ANNUAL_MULTIPLIER: Record<string, number> = {
  monthly:   12,
  quarterly:  4,
  annual:     1,
  yearly:     1,
};


export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // Keep monthStr as alias used in refKey construction below
  const monthStr = currentMonth;

  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();

  // Get all active sessions
  const { data: sessions } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // Filter to Pro users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id')
    .in('id', sessions.map((s) => s.user_id));

  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => {
        const hasStripe = !!p.stripe_subscription_id;
        return (
          p.subscription_tier === 'pro' &&
          (hasStripe
            ? ['active', 'trialing'].includes(p.subscription_status ?? '')
            : p.subscription_status === 'trialing')
        );
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
      // Rule 1: only subscriptions already tracked by the user are candidates.
      // Include pending_cancellation — users who cancelled still care about
      // overcharges during the notice period.
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('id, provider_name, amount, billing_cycle, category')
        .eq('user_id', userId)
        .in('status', ['active', 'pending_cancellation'])
        .in('billing_cycle', ['monthly', 'quarterly']);

      if (!subscriptions || subscriptions.length === 0) continue;

      // Rule 2: fetch only Direct Debit / Standing Order transactions.
      // Most transactions arrive with category = null (the sync writer does not
      // populate it). The recurring-detection pipeline sets is_recurring = true
      // when it identifies a payment as recurring — this is the practical signal
      // for DD/SO for most users. The .or() filter captures both cases:
      //   • explicit DIRECT_DEBIT / STANDING_ORDER category (if ever set), OR
      //   • is_recurring = true (set by detect-recurring pipeline)
      const { data: allTxns } = await supabase
        .from('bank_transactions')
        .select('merchant_name, description, amount, category, timestamp, is_recurring')
        .eq('user_id', userId)
        .lt('amount', 0)
        .or('category.eq.DIRECT_DEBIT,category.eq.STANDING_ORDER,is_recurring.eq.true')
        .gte('timestamp', sixMonthsAgo)
        .order('timestamp', { ascending: true });

      if (!allTxns || allTxns.length === 0) continue;

      const increases: Array<{
        name: string;
        prevAmount: number;
        newAmount: number;
        increase: number;
        annualIncrease: number;
      }> = [];

      for (const sub of subscriptions) {
        // Rule 4: category allowlist — subscriptions with no category or a category
        // outside the eligible set are not fixed-price services and must be skipped.
        // Null is NOT a pass-through: an uncategorised subscription could be anything.
        if (!sub.category || !ELIGIBLE_CATEGORIES.has(sub.category)) continue;

        // Rule 6: bank blocklist — loan/mortgage DDs must never be flagged
        const subNameNorm = normaliseName(sub.provider_name);
        if (BANK_BLOCKLIST.some((b) => subNameNorm.includes(b))) continue;

        // Find all matching DD / SO transactions for this subscription (Rule 2
        // already enforced at query level above)
        const matchingTxns = allTxns.filter((t) =>
          namesMatch(sub.provider_name, t.merchant_name || t.description || ''),
        );

        // Need at least 3 transactions to establish a consistent price history
        if (matchingTxns.length < 3) continue;

        // Rule 5: determine this merchant's typical billing day-of-month
        const dayFreq = new Map<number, number>();
        for (const tx of matchingTxns) {
          const d = new Date(tx.timestamp).getDate();
          dayFreq.set(d, (dayFreq.get(d) ?? 0) + 1);
        }
        let billingDay = 1;
        let maxFreq = 0;
        for (const [d, freq] of dayFreq) {
          if (freq > maxFreq) { billingDay = d; maxFreq = freq; }
        }

        // Rule 5: group by YYYY-MM keeping only transactions within ±5 days of
        // the typical billing day. This prevents a random purchase on the 15th
        // being compared against a DD on the 1st.
        const byMonth = new Map<string, { amount: number; dayDiff: number }>();
        for (const tx of matchingTxns) {
          const txDay = new Date(tx.timestamp).getDate();
          const month = new Date(tx.timestamp as string).toISOString().slice(0, 7);
          const amt = Math.abs(Number(tx.amount));

          // Wrap-around diff handles billing days near month boundaries
          const rawDiff = Math.abs(txDay - billingDay);
          const dayDiff = Math.min(rawDiff, 31 - rawDiff);
          if (dayDiff > 5) continue;

          const existing = byMonth.get(month);
          if (!existing || dayDiff < existing.dayDiff) {
            byMonth.set(month, { amount: amt, dayDiff });
          }
        }

        // Must have payment data across at least 3 distinct months
        if (byMonth.size < 3) continue;

        const monthEntries = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const latestEntry = monthEntries[monthEntries.length - 1];

        // Only process if the most recent aligned payment is in the current month
        if (latestEntry[0] !== currentMonth) continue;

        const latestAmt = latestEntry[1].amount;
        const priorEntries = monthEntries.slice(0, -1);

        // Rule 3: find the modal (most frequent) amount across prior months.
        // It must appear at least twice — one prior transaction is not evidence
        // of a stable fixed price.
        const amtFreq = new Map<number, number>();
        for (const [, { amount }] of priorEntries) {
          const rounded = Math.round(amount * 100) / 100;
          amtFreq.set(rounded, (amtFreq.get(rounded) ?? 0) + 1);
        }

        let oldPrice = 0;
        let oldPriceCount = 0;
        for (const [amt, count] of amtFreq) {
          if (count > oldPriceCount) { oldPrice = amt; oldPriceCount = count; }
        }

        // Require at least 2 months at the old price
        if (oldPriceCount < 2) continue;

        const increase = Math.round((latestAmt - oldPrice) * 100) / 100;

        // Only alert on increases > £1
        if (increase <= 1) continue;

        // Sanity: skip if increase is > 100% — legitimate prices don't double overnight
        if (oldPrice > 0 && increase / oldPrice > 1.0) continue;

        // Sanity: skip if new amount exceeds the plausible ceiling for this category
        const maxPlausible = CATEGORY_MAX_AMOUNT[sub.category ?? ''] ?? DEFAULT_MAX_AMOUNT;
        if (latestAmt > maxPlausible) continue;

        // Dedup: check notification_log using both the new normalised key format
        // and the legacy raw-name format (for users already alerted under old code)
        const normName = normaliseProviderName(sub.provider_name);
        const newKey = `${normName.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;
        const legacyKey = `${sub.provider_name.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;

        const { data: existingLog } = await supabase
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'price_increase')
          .in('reference_key', [newKey, legacyKey])
          .maybeSingle();

        if (existingLog) continue;

        const annualMultiplier = ANNUAL_MULTIPLIER[sub.billing_cycle] ?? 12;
        const annualIncrease = Math.round(increase * annualMultiplier * 100) / 100;
        increases.push({ name: normName, prevAmount: oldPrice, newAmount: latestAmt, increase, annualIncrease });
      }

      if (increases.length === 0) continue;

      // Hard dedup by normalised name — multiple subscription rows for the same
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
              user_id:          userId,
              issue_type:       'price_increase',
              title,
              detail,
              source_type:      'bank_transaction',
              amount_impact:    inc.annualIncrease,
              telegram_chat_id: chatId,
              status:           'active',
            })
            .select('id')
            .single();

          if (issue) {
            const { ok, messageId } = await sendProactiveAlert({
              chatId: Number(chatId),
              issue: {
                id: issue.id,
                title,
                detail,
                recommendation: null,
                amount_impact: inc.annualIncrease,
                issue_type: 'price_increase',
              },
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
                user_id:           userId,
                notification_type: 'price_increase',
                reference_key:     refKey,
              });
            } else {
              errors.push(`Failed chat ${chatId}`);
            }
          }
        } else {
          // Non-urgent: queue for the daily digest
          const queued = await queueTelegramAlert(supabase, {
            userId,
            chatId:       Number(chatId),
            alertType:    'price_increase',
            providerName: inc.name,
            amount:       inc.newAmount,
            amountChange: inc.increase,
            referenceKey: `bankdet_price_${refKey}`,
            metadata:     { source: 'bank_detection', prev_amount: inc.prevAmount, annual_increase: inc.annualIncrease },
          });

          if (queued) {
            sent++;
            await supabase.from('notification_log').insert({
              user_id:           userId,
              notification_type: 'price_increase',
              reference_key:     refKey,
            });
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
