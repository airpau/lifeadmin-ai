import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

// ---- Subscription exclusion rules ----
// These mirror the logic in src/lib/detect-recurring.ts

const NON_SUBSCRIPTION_KEYWORDS: string[] = [
  'interest', 'overdraft', 'bank charge', 'bank charges', 'bank fee', 'bank fees',
  'service charge', 'service fee', 'late fee', 'late payment', 'arrangement fee',
  'account fee', 'maintenance fee', 'penalty charge', 'unarranged',
  'cashback', 'cash back', 'refund', 'chargeback', 'reversal', 'credit adjustment',
  'atm ', 'cash withdrawal', 'cashpoint', 'cash machine', 'cash advance',
  'balance transfer', 'foreign exchange', 'fx fee', 'currency conversion',
  'standing order', 'bacs credit', 'faster payment',
];

const NON_SUBSCRIPTION_CATEGORIES = new Set<string>([
  'council_tax', 'tax', 'shopping', 'transport', 'gambling',
]);

const FOOD_SUBSCRIPTION_PROVIDERS: string[] = [
  'gousto', 'hellofresh', 'hello fresh', 'mindful chef', 'mindfulchef',
  'oddbox', 'farmdrop', 'riverford', 'abel cole', 'abelandcole',
];

const NON_SUBSCRIPTION_TX_CATEGORIES = new Set<string>([
  'food_and_drink', 'restaurants', 'eating_out', 'bars_clubs_pubs', 'fast_food',
  'groceries', 'cash', 'atm', 'bank_fee', 'interest', 'charge', 'fees',
  'transfer', 'internal_transfer', 'direct_debit_transfer', 'refund',
]);

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily subscription auto-detection cron.
 * Scans bank_transactions for recurring patterns, enriches merchant_name,
 * and auto-creates subscriptions from high-confidence matches.
 *
 * Schedule: Daily at 4am (after bank-sync at 3am)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const results = { enriched: 0, detected: 0, created: 0, skipped: 0 };

  // Step 1: Enrich merchant_name on any new unmatched transactions
  const { data: rules } = await supabase
    .from('merchant_rules')
    .select('raw_name, display_name');

  if (rules) {
    for (const rule of rules) {
      await supabase
        .from('bank_transactions')
        .update({ merchant_name: rule.display_name })
        .is('merchant_name', null)
        .ilike('description', `%${rule.raw_name}%`);
    }
  }

  // Step 2: Find recurring patterns — group by merchant_name + user_id
  const { data: users } = await supabase
    .from('bank_transactions')
    .select('user_id')
    .not('merchant_name', 'is', null)
    .gte('timestamp', sixMonthsAgo.toISOString())
    .limit(1000);

  const userIds = [...new Set((users || []).map(u => u.user_id))];

  for (const userId of userIds) {
    // Get all transactions with merchant_name for this user in last 6 months
    const { data: txs } = await supabase
      .from('bank_transactions')
      .select('merchant_name, amount, timestamp, description, category')
      .eq('user_id', userId)
      .not('merchant_name', 'is', null)
      .lt('amount', 0) // Only outgoing
      .gte('timestamp', sixMonthsAgo.toISOString())
      .order('timestamp', { ascending: true });

    if (!txs || txs.length === 0) continue;

    // Group by merchant_name
    const groups = new Map<string, typeof txs>();
    for (const tx of txs) {
      if (!groups.has(tx.merchant_name!)) groups.set(tx.merchant_name!, []);
      groups.get(tx.merchant_name!)!.push(tx);
    }

    // Get existing subscriptions for this user
    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('provider_name')
      .eq('user_id', userId);

    const existingProviders = new Set(
      (existingSubs || []).map(s => s.provider_name?.toLowerCase())
    );

    for (const [merchant, merchantTxs] of groups) {
      // Skip if already tracked
      if (existingProviders.has(merchant.toLowerCase())) continue;

      // Need at least 2 payments
      if (merchantTxs.length < 2) continue;

      // Check for recurring pattern: similar amounts appearing regularly
      const amounts = merchantTxs.map(t => Math.abs(parseFloat(String(t.amount))));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;

      // Check amount consistency (within 15%)
      const consistent = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.15);
      if (!consistent) continue;

      // Check frequency: are payments roughly monthly?
      const dates = merchantTxs.map(t => new Date(t.timestamp).getTime());
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)); // Days between
      }

      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

      // Determine billing cycle
      let billingCycle = 'monthly';
      if (avgGap >= 350 && avgGap <= 380) billingCycle = 'yearly';
      else if (avgGap >= 80 && avgGap <= 100) billingCycle = 'quarterly';
      else if (avgGap >= 6 && avgGap <= 8) billingCycle = 'weekly';
      else if (avgGap < 25 || avgGap > 35) continue; // Not a clear monthly pattern

      // ---- EXCLUSION: skip non-subscription keywords in merchant name / description ----
      const merchantLower = merchant.toLowerCase();
      const descLower = (merchantTxs[0].description || '').toLowerCase();
      if (NON_SUBSCRIPTION_KEYWORDS.some(kw => merchantLower.includes(kw) || descLower.includes(kw))) {
        results.skipped++;
        continue;
      }

      // ---- EXCLUSION: skip based on bank-provided transaction category ----
      const txCategory = (merchantTxs[0].category || '').toLowerCase();
      if (txCategory && NON_SUBSCRIPTION_TX_CATEGORIES.has(txCategory)) {
        results.skipped++;
        continue;
      }

      results.detected++;

      // Check confidence: is this from a known subscription merchant?
      const { data: rule } = await supabase
        .from('merchant_rules')
        .select('is_subscription, category, payment_type')
        .ilike('display_name', merchant)
        .maybeSingle();

      const isKnownSub = rule?.is_subscription === true;
      // If merchant_rules explicitly marks this as NOT a subscription, skip
      if (rule && rule.is_subscription === false) {
        results.skipped++;
        continue;
      }

      const merchantCategory = (rule?.category || merchantTxs[0].category || '').toLowerCase();

      // ---- EXCLUSION: skip non-subscription internal categories ----
      if (merchantCategory && NON_SUBSCRIPTION_CATEGORIES.has(merchantCategory)) {
        results.skipped++;
        continue;
      }

      // For food category, only allow genuine meal kit subscription services
      if (merchantCategory === 'food') {
        const normMerchant = merchant.toLowerCase();
        const isMealKit = FOOD_SUBSCRIPTION_PROVIDERS.some(p => normMerchant.includes(p) || p.includes(normMerchant));
        if (!isMealKit) {
          results.skipped++;
          continue;
        }
      }

      const confidence = isKnownSub ? 95 : (consistent && merchantTxs.length >= 3 ? 75 : 50);

      // Auto-create if high confidence
      if (confidence >= 80) {
        const { error: insertErr } = await supabase.from('subscriptions').insert({
          user_id: userId,
          provider_name: merchant,
          amount: Math.round(avgAmount * 100) / 100,
          category: rule?.category || merchantTxs[0].category || 'other',
          billing_cycle: billingCycle,
          status: 'active',
          source: 'bank_auto',
          detected_at: new Date().toISOString(),
        });

        if (!insertErr) {
          results.created++;
        }
      } else {
        results.skipped++;
      }
    }
  }

  console.log(`[detect-subscriptions] Results:`, results);
  return NextResponse.json({ ok: true, ...results });
}
