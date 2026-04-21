import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Normalise a provider name for deduplication.
 * Strips suffixes, numbers, special chars; lowercases.
 */
function normaliseProviderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk|uk)\b/g, '')
    .replace(/\d{4,}/g, '')           // strip long number references
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Council tax / local authority blocklist.
 * Any merchant whose normalised name matches one of these patterns
 * will NEVER be classified as a subscription — they belong in Expected Bills.
 */
const COUNCIL_TAX_PATTERNS: RegExp[] = [
  /borough council/i,
  /city council/i,
  /district council/i,
  /county council/i,
  /council tax/i,
  /london borough/i,
  /\btest valley\b/i,
  /\bwinchester\b.*\bcouncil\b/i,
  /\bwestminster\b.*\bcouncil\b/i,
  /\bhounslow\b/i,
  /\b(lbh|lbw|lbc)\b/i,            // common council abbreviations
];

function isCouncilTaxMerchant(merchantName: string): boolean {
  return COUNCIL_TAX_PATTERNS.some(re => re.test(merchantName));
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

    // Get existing subscriptions for this user (all statuses — including dismissed)
    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('provider_name')
      .eq('user_id', userId);

    // Build two sets: exact lowercase names AND normalised names for fuzzy dedup
    const existingExact = new Set(
      (existingSubs || []).map(s => (s.provider_name || '').toLowerCase())
    );
    const existingNormalised = new Set(
      (existingSubs || []).map(s => normaliseProviderName(s.provider_name || ''))
    );

    for (const [merchant, merchantTxs] of groups) {
      // Skip council tax / local authority payments — they belong in Expected Bills
      if (isCouncilTaxMerchant(merchant)) continue;

      // Skip if already tracked (exact match or normalised match)
      if (existingExact.has(merchant.toLowerCase())) continue;
      if (existingNormalised.has(normaliseProviderName(merchant))) continue;

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

      results.detected++;

      // Check confidence: is this from a known subscription merchant?
      const { data: rule } = await supabase
        .from('merchant_rules')
        .select('is_subscription, category, payment_type')
        .ilike('display_name', merchant)
        .maybeSingle();

      const isKnownSub = rule?.is_subscription === true;
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
          // Add to both dedup sets so concurrent iterations in this run don't re-insert
          existingExact.add(merchant.toLowerCase());
          existingNormalised.add(normaliseProviderName(merchant));
        }
      } else {
        results.skipped++;
      }
    }
  }

  console.log(`[detect-subscriptions] Results:`, results);
  return NextResponse.json({ ok: true, ...results });
}
