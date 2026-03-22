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

  for (const sub of subs) {
    const amount = parseFloat(String(sub.amount)) || 0;
    const cat = sub.category || 'other';

    // Skip non-switchable categories
    if (!SWITCHABLE_CATEGORIES.includes(cat)) continue;

    // 1. Renewal within 30 days = +50 points
    if (sub.next_billing_date) {
      const renewalDate = new Date(sub.next_billing_date);
      const daysUntil = Math.floor((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= 7) {
        breakdown.push({ reason: `${sub.provider_name} renews in ${daysUntil} days — urgent`, points: 60, subscription: sub.provider_name });
        topOpportunities.push({ provider: sub.provider_name, category: cat, amount, reason: `Renews in ${daysUntil} days` });
      } else if (daysUntil > 7 && daysUntil <= 30) {
        breakdown.push({ reason: `${sub.provider_name} renews in ${daysUntil} days`, points: 40, subscription: sub.provider_name });
        topOpportunities.push({ provider: sub.provider_name, category: cat, amount, reason: `Renews in ${daysUntil} days` });
      } else if (daysUntil > 30 && daysUntil <= 90) {
        breakdown.push({ reason: `${sub.provider_name} renews in ${daysUntil} days`, points: 20, subscription: sub.provider_name });
      }
    }

    // 2. Paying above average for category = +20 points
    const avg = CATEGORY_AVERAGES[cat];
    if (avg && amount > avg * 1.2) {
      const overpay = Math.round(((amount - avg) / avg) * 100);
      breakdown.push({ reason: `${sub.provider_name}: paying ${overpay}% above average for ${cat}`, points: 20, subscription: sub.provider_name });
      topOpportunities.push({ provider: sub.provider_name, category: cat, amount, reason: `${overpay}% above average` });
    }

    // 3. High-value subscription = +15 points (bigger potential savings)
    if (amount >= 100) {
      breakdown.push({ reason: `${sub.provider_name}: high-value £${amount.toFixed(0)}/mo — worth comparing`, points: 15, subscription: sub.provider_name });
    }

    // 4. Mortgage = always high value opportunity
    if (cat === 'mortgage') {
      breakdown.push({ reason: `${sub.provider_name}: mortgage — even 0.5% saving is significant`, points: 30, subscription: sub.provider_name });
      topOpportunities.push({ provider: sub.provider_name, category: cat, amount, reason: 'Remortgage comparison could save thousands' });
    }
  }

  // 5. Multiple loans = consolidation opportunity
  const loans = subs.filter(s => s.category === 'loan' || s.category === 'credit_card' || s.category === 'car_finance');
  if (loans.length >= 2) {
    const totalLoanPayments = loans.reduce((sum, l) => sum + (parseFloat(String(l.amount)) || 0), 0);
    breakdown.push({ reason: `${loans.length} loans/credit totalling £${totalLoanPayments.toFixed(0)}/mo — consolidation opportunity`, points: 30 });
    topOpportunities.push({ provider: 'Multiple lenders', category: 'loan', amount: totalLoanPayments, reason: `Consolidate ${loans.length} debts` });
  }

  // 6. High total monthly spend = +10 points
  const totalMonthly = subs.reduce((sum, s) => sum + (parseFloat(String(s.amount)) || 0), 0);
  if (totalMonthly >= 500) {
    breakdown.push({ reason: `Total spend £${totalMonthly.toFixed(0)}/mo across ${subs.length} subscriptions`, points: 10 });
  }

  // 7. Many switchable subscriptions = +10 points
  const switchableCount = subs.filter(s => SWITCHABLE_CATEGORIES.includes(s.category || '')).length;
  if (switchableCount >= 5) {
    breakdown.push({ reason: `${switchableCount} switchable subscriptions — multiple saving opportunities`, points: 10 });
  }

  // Calculate total
  const total = breakdown.reduce((sum, b) => sum + b.points, 0);

  // Determine tier
  let tier: OpportunityScore['tier'] = 'low';
  if (total >= 100) tier = 'critical';
  else if (total >= 50) tier = 'high';
  else if (total >= 20) tier = 'medium';

  // Sort top opportunities by amount descending
  topOpportunities.sort((a, b) => b.amount - a.amount);

  return { total, breakdown, tier, topOpportunities: topOpportunities.slice(0, 5) };
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
