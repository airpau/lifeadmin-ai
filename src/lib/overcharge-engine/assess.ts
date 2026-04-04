import { createClient } from '@supabase/supabase-js';
import { historicalPriceSignal } from './signals/historical-price';
import { marketRateSignal } from './signals/market-rate';
import { contractExpirySignal } from './signals/contract-expiry';
import { categoryBenchmarkSignal } from './signals/category-benchmark';
import { calculateOverchargeScore } from './score';
import type { OverchargeAssessment, OverchargeSignal, SubscriptionForAssessment } from './types';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getMonthlyPrice(amount: number, billingCycle: string | null): number {
  if (billingCycle === 'yearly') return amount / 12;
  if (billingCycle === 'quarterly') return amount / 3;
  return amount;
}

/**
 * Assess a single subscription for overcharging.
 * Runs all 4 signal generators and produces a scored assessment.
 */
export async function assessSubscription(
  sub: SubscriptionForAssessment
): Promise<OverchargeAssessment | null> {
  const currentMonthly = getMonthlyPrice(parseFloat(String(sub.amount)), sub.billing_cycle);
  if (currentMonthly <= 0) return null;

  const currentAnnual = currentMonthly * 12;
  const category = sub.category_normalized || sub.provider_type || sub.category;

  // Run all 4 signals concurrently
  const [priceSignal, marketSignal, contractSignal, benchmarkSignal] = await Promise.all([
    historicalPriceSignal(sub.user_id, sub.provider_name, currentMonthly),
    marketRateSignal(sub, currentMonthly),
    Promise.resolve(contractExpirySignal(sub)),
    categoryBenchmarkSignal(category, currentMonthly),
  ]);

  const signals: OverchargeSignal[] = [priceSignal, marketSignal, contractSignal, benchmarkSignal];

  // Extract market data from market rate signal
  const marketData = marketSignal as typeof marketSignal & { bestProvider?: string; bestUrl?: string; bestMonthly?: number; marketAvg?: number };

  const { score, confidence, estimatedAnnualSaving } = calculateOverchargeScore(
    signals,
    currentMonthly,
    marketData.bestMonthly
  );

  // Only produce assessments with score > 0
  if (score === 0) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  return {
    userId: sub.user_id,
    subscriptionId: sub.id,
    merchantName: sub.provider_name,
    category,
    currentMonthly: Math.round(currentMonthly * 100) / 100,
    currentAnnual: Math.round(currentAnnual * 100) / 100,
    marketAvgMonthly: marketData.marketAvg ?? null,
    marketBestMonthly: marketData.bestMonthly ?? null,
    historicalAvgMonthly: (priceSignal.data?.oldAvg as number) ?? null,
    overchargeScore: score,
    confidence,
    estimatedAnnualSaving,
    signals,
    bestDealProvider: marketData.bestProvider ?? null,
    bestDealUrl: marketData.bestUrl ?? null,
    bestDealMonthly: marketData.bestMonthly ?? null,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Assess all active subscriptions for a user.
 * Returns sorted by overcharge score descending.
 */
export async function assessAllSubscriptions(userId: string): Promise<OverchargeAssessment[]> {
  const supabase = getAdmin();

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, user_id, provider_name, category, category_normalized, provider_type, amount, billing_cycle, contract_end_date, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('dismissed_at', null);

  if (error || !subs || subs.length === 0) return [];

  const assessments: OverchargeAssessment[] = [];

  // Process sequentially to avoid overwhelming the DB
  for (const sub of subs) {
    const assessment = await assessSubscription(sub as SubscriptionForAssessment);
    if (assessment) {
      assessments.push(assessment);
    }
  }

  // Sort by score descending
  assessments.sort((a, b) => b.overchargeScore - a.overchargeScore);
  return assessments;
}

/**
 * Save assessments to the database.
 * Expires old active assessments for the user before inserting new ones.
 */
export async function saveAssessments(assessments: OverchargeAssessment[]): Promise<void> {
  if (assessments.length === 0) return;

  const supabase = getAdmin();
  const userId = assessments[0].userId;

  // Expire previous active assessments for this user
  await supabase
    .from('overcharge_assessments')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'active');

  // Insert new assessments
  const rows = assessments.map(a => ({
    user_id: a.userId,
    subscription_id: a.subscriptionId,
    merchant_name: a.merchantName,
    category: a.category,
    current_monthly: a.currentMonthly,
    current_annual: a.currentAnnual,
    market_avg_monthly: a.marketAvgMonthly,
    market_best_monthly: a.marketBestMonthly,
    historical_avg_monthly: a.historicalAvgMonthly,
    overcharge_score: a.overchargeScore,
    confidence: a.confidence,
    estimated_annual_saving: a.estimatedAnnualSaving,
    signals: a.signals,
    best_deal_provider: a.bestDealProvider,
    best_deal_url: a.bestDealUrl,
    best_deal_monthly: a.bestDealMonthly,
    status: 'active',
    expires_at: a.expiresAt,
  }));

  await supabase.from('overcharge_assessments').insert(rows);
}

/**
 * Full assessment pipeline: assess all subs, save results, return assessments.
 */
export async function runAssessment(userId: string): Promise<OverchargeAssessment[]> {
  const assessments = await assessAllSubscriptions(userId);
  await saveAssessments(assessments);
  return assessments;
}
