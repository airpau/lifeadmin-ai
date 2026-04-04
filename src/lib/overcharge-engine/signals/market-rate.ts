import { createClient } from '@supabase/supabase-js';
import type { OverchargeSignal, SubscriptionForAssessment } from '../types';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Signal 2: Above market rate comparison (weight: 40)
 * Wraps comparison-engine.ts logic — checks energy_tariffs table
 * and hardcoded deal data to determine if the user is overpaying.
 *
 * Score: 100 if >50% above cheapest, 75 if >30%, 50 if >20%, 25 if >10%, 0 otherwise
 */
export async function marketRateSignal(
  sub: SubscriptionForAssessment,
  currentMonthly: number
): Promise<OverchargeSignal & { bestProvider?: string; bestUrl?: string; bestMonthly?: number; marketAvg?: number }> {
  const supabase = getAdmin();
  const category = sub.category_normalized || sub.provider_type || sub.category;

  if (!category) {
    return { type: 'above_market', weight: 40, score: 0, detail: 'No category for market comparison' };
  }

  // For energy: use live tariff data
  if (category === 'energy') {
    const { data: tariffs } = await supabase
      .from('energy_tariffs')
      .select('provider, tariff_name, monthly_cost_estimate')
      .not('monthly_cost_estimate', 'is', null)
      .order('monthly_cost_estimate', { ascending: true })
      .limit(10);

    if (tariffs && tariffs.length > 0) {
      const cheapest = parseFloat(String(tariffs[0].monthly_cost_estimate));
      const avg = tariffs.reduce((s, t) => s + parseFloat(String(t.monthly_cost_estimate)), 0) / tariffs.length;
      const aboveCheapestPct = cheapest > 0 ? ((currentMonthly - cheapest) / cheapest) * 100 : 0;
      const annualDiff = (currentMonthly - cheapest) * 12;

      if (aboveCheapestPct <= 0) {
        return { type: 'above_market', weight: 40, score: 0, detail: 'At or below cheapest energy tariff', marketAvg: Math.round(avg * 100) / 100, bestMonthly: cheapest };
      }

      const score = aboveCheapestPct > 50 ? 100 : aboveCheapestPct > 30 ? 75 : aboveCheapestPct > 20 ? 50 : aboveCheapestPct > 10 ? 25 : 0;

      return {
        type: 'above_market',
        weight: 40,
        score,
        detail: `£${currentMonthly.toFixed(2)}/mo vs cheapest £${cheapest.toFixed(2)}/mo (${tariffs[0].provider}). Could save ~£${Math.round(annualDiff)}/yr`,
        data: { cheapestProvider: tariffs[0].provider, cheapestMonthly: cheapest, abovePct: Math.round(aboveCheapestPct) },
        bestProvider: tariffs[0].provider,
        bestUrl: `https://www.moneysupermarket.com/gas-and-electricity/`,
        bestMonthly: cheapest,
        marketAvg: Math.round(avg * 100) / 100,
      };
    }
  }

  // For other categories: use category_benchmarks table
  const { data: benchmark } = await supabase
    .from('category_benchmarks')
    .select('low_monthly, median_monthly, high_monthly')
    .eq('category', category)
    .single();

  if (!benchmark) {
    return { type: 'above_market', weight: 40, score: 0, detail: `No market data for category: ${category}` };
  }

  const low = parseFloat(String(benchmark.low_monthly));
  const median = parseFloat(String(benchmark.median_monthly));
  const aboveMedianPct = median > 0 ? ((currentMonthly - median) / median) * 100 : 0;
  const aboveLowPct = low > 0 ? ((currentMonthly - low) / low) * 100 : 0;

  if (aboveMedianPct <= 0) {
    return {
      type: 'above_market',
      weight: 40,
      score: 0,
      detail: `At or below UK median (£${median}/mo) for ${category}`,
      marketAvg: median,
      bestMonthly: low,
    };
  }

  const annualAboveMedian = (currentMonthly - median) * 12;
  const annualAboveLow = (currentMonthly - low) * 12;

  // Score based on how far above median
  const score = aboveMedianPct > 50 ? 100 : aboveMedianPct > 30 ? 75 : aboveMedianPct > 20 ? 50 : aboveMedianPct > 10 ? 25 : 0;

  return {
    type: 'above_market',
    weight: 40,
    score,
    detail: `£${currentMonthly.toFixed(2)}/mo is ${Math.round(aboveMedianPct)}% above UK median (£${median}/mo). Cheapest available ~£${low}/mo, saving ~£${Math.round(annualAboveLow)}/yr`,
    data: { medianMonthly: median, lowMonthly: low, aboveMedianPct: Math.round(aboveMedianPct), aboveLowPct: Math.round(aboveLowPct) },
    marketAvg: median,
    bestMonthly: low,
  };
}
