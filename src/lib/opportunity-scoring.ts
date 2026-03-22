import { SupabaseClient } from '@supabase/supabase-js';

export interface OpportunityScore {
  total: number;
  breakdown: Array<{ reason: string; points: number; subscription?: string }>;
  tier: 'low' | 'medium' | 'high' | 'critical';
  topOpportunities: Array<{ provider: string; category: string; amount: number; reason: string }>;
}

// Categories that have switchable deals
const SWITCHABLE_CATEGORIES = [
  'utility', 'broadband', 'mobile', 'insurance', 'mortgage',
  'loan', 'credit_card', 'car_finance', 'streaming', 'fitness',
];

// Average UK monthly costs for comparison
const CATEGORY_AVERAGES: Record<string, number> = {
  utility: 95,
  broadband: 32,
  mobile: 18,
  insurance: 45,
  mortgage: 850,
  loan: 200,
  credit_card: 150,
  car_finance: 250,
  streaming: 12,
  fitness: 30,
};

/**
 * Calculate an opportunity score for a user based on their subscription data.
 * Higher score = more likely to benefit from switching = higher affiliate potential.
 */
export async function calculateOpportunityScore(
  userId: string,
  supabase: SupabaseClient
): Promise<OpportunityScore> {
  const breakdown: OpportunityScore['breakdown'] = [];
  const topOpportunities: OpportunityScore['topOpportunities'] = [];

  // Fetch user's active subscriptions
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('provider_name, amount, category, billing_cycle, next_billing_date, created_at')
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .eq('status', 'active');

  if (!subs || subs.length === 0) {
    return { total: 0, breakdown: [], tier: 'low', topOpportunities: [] };
  }

  const now = new Date();
  const scoredProviders = new Set<string>(); // prevent duplicate scoring per provider

  for (const sub of subs) {
    const amount = parseFloat(String(sub.amount)) || 0;
    const cat = sub.category || 'other';

    // Skip non-switchable categories
    if (!SWITCHABLE_CATEGORIES.includes(cat)) continue;

    // Skip if already scored this provider
    if (scoredProviders.has(sub.provider_name)) continue;
    scoredProviders.add(sub.provider_name);

    // Pick the single best reason for this subscription
    let bestReason = '';
    let bestPoints = 0;

    // Check renewal
    if (sub.next_billing_date) {
      const renewalDate = new Date(sub.next_billing_date);
      const daysUntil = Math.floor((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= 7) {
        bestReason = `Renews in ${daysUntil} days — urgent`;
        bestPoints = 60;
      } else if (daysUntil > 7 && daysUntil <= 30) {
        bestReason = `Renews in ${daysUntil} days`;
        bestPoints = 40;
      } else if (daysUntil > 30 && daysUntil <= 90) {
        bestReason = `Renews in ${daysUntil} days`;
        bestPoints = 20;
      }
    }

    // Check if paying above average (use if higher points than renewal)
    const avg = CATEGORY_AVERAGES[cat];
    if (avg && amount > avg * 1.2) {
      const overpay = Math.round(((amount - avg) / avg) * 100);
      if (20 > bestPoints) {
        bestReason = `Paying ${overpay}% above average for ${cat}`;
        bestPoints = 20;
      }
    }

    // Mortgage always scores high
    if (cat === 'mortgage' && 30 > bestPoints) {
      bestReason = 'Remortgage comparison could save thousands';
      bestPoints = 30;
    }

    // High-value subscription
    if (amount >= 100 && 15 > bestPoints) {
      bestReason = `High-value £${amount.toFixed(0)}/mo — worth comparing`;
      bestPoints = 15;
    }

    if (bestPoints > 0) {
      breakdown.push({ reason: `${sub.provider_name}: ${bestReason}`, points: bestPoints, subscription: sub.provider_name });
      topOpportunities.push({ provider: sub.provider_name, category: cat, amount, reason: bestReason });
    }
  }

  // Multiple loans = consolidation opportunity (one entry, not per-loan)
  const loans = subs.filter(s => s.category === 'loan' || s.category === 'credit_card' || s.category === 'car_finance');
  if (loans.length >= 2) {
    const totalLoanPayments = loans.reduce((sum, l) => sum + (parseFloat(String(l.amount)) || 0), 0);
    breakdown.push({ reason: `${loans.length} loans/credit totalling £${totalLoanPayments.toFixed(0)}/mo — consolidation opportunity`, points: 30 });
    topOpportunities.push({ provider: 'Multiple lenders', category: 'loan', amount: totalLoanPayments, reason: `Consolidate ${loans.length} debts` });
  }

  // High total monthly spend
  const totalMonthly = subs.reduce((sum, s) => sum + (parseFloat(String(s.amount)) || 0), 0);
  if (totalMonthly >= 500) {
    breakdown.push({ reason: `Total spend £${totalMonthly.toFixed(0)}/mo across ${subs.length} subscriptions`, points: 10 });
  }

  // Many switchable subscriptions
  const switchableCount = scoredProviders.size;
  if (switchableCount >= 5) {
    breakdown.push({ reason: `${switchableCount} switchable subscriptions`, points: 10 });
  }

  // Calculate total
  const total = breakdown.reduce((sum, b) => sum + b.points, 0);

  // Determine tier
  let tier: OpportunityScore['tier'] = 'low';
  if (total >= 100) tier = 'critical';
  else if (total >= 50) tier = 'high';
  else if (total >= 20) tier = 'medium';

  // Deduplicate and sort top opportunities by amount descending
  const seen = new Set<string>();
  const dedupedOpps = topOpportunities.filter((o) => {
    if (seen.has(o.provider)) return false;
    seen.add(o.provider);
    return true;
  });
  dedupedOpps.sort((a, b) => b.amount - a.amount);

  return { total, breakdown, tier, topOpportunities: dedupedOpps.slice(0, 5) };
}

/**
 * Update opportunity score for a user and store in profiles.
 */
export async function updateUserOpportunityScore(
  userId: string,
  supabase: SupabaseClient
): Promise<OpportunityScore> {
  const score = await calculateOpportunityScore(userId, supabase);

  await supabase.from('profiles').update({
    opportunity_score: score.total,
    opportunity_score_updated_at: new Date().toISOString(),
  }).eq('id', userId);

  return score;
}
