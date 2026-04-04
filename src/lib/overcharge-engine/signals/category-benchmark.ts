import { createClient } from '@supabase/supabase-js';
import type { OverchargeSignal } from '../types';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Signal 4: Category benchmark comparison (weight: 15)
 * Compares the user's spend against UK median for the category.
 * Uses category_benchmarks table seeded with Ofcom/ABI/market data.
 *
 * Score: 100 if >2x median, 75 if >1.5x, 50 if >1.25x, 25 if >1.1x, 0 otherwise
 */
export async function categoryBenchmarkSignal(
  category: string | null,
  currentMonthly: number
): Promise<OverchargeSignal> {
  if (!category) {
    return { type: 'category_benchmark', weight: 15, score: 0, detail: 'No category for benchmark comparison' };
  }

  const supabase = getAdmin();

  const { data: benchmark } = await supabase
    .from('category_benchmarks')
    .select('low_monthly, median_monthly, high_monthly, source')
    .eq('category', category)
    .single();

  if (!benchmark) {
    return { type: 'category_benchmark', weight: 15, score: 0, detail: `No UK benchmark data for: ${category}` };
  }

  const median = parseFloat(String(benchmark.median_monthly));
  const high = parseFloat(String(benchmark.high_monthly));

  if (median <= 0) {
    return { type: 'category_benchmark', weight: 15, score: 0, detail: 'Invalid benchmark data' };
  }

  const ratio = currentMonthly / median;

  if (ratio <= 1.1) {
    return {
      type: 'category_benchmark',
      weight: 15,
      score: 0,
      detail: `£${currentMonthly.toFixed(2)}/mo is within normal range for ${category} (UK median: £${median}/mo)`,
      data: { median, ratio: Math.round(ratio * 100) / 100 },
    };
  }

  let score = 0;
  if (ratio > 2) score = 100;
  else if (ratio > 1.5) score = 75;
  else if (ratio > 1.25) score = 50;
  else score = 25;

  const annualOverpay = (currentMonthly - median) * 12;

  return {
    type: 'category_benchmark',
    weight: 15,
    score,
    detail: `£${currentMonthly.toFixed(2)}/mo is ${Math.round((ratio - 1) * 100)}% above UK median (£${median}/mo). ~£${Math.round(annualOverpay)}/yr above average`,
    data: {
      median,
      high,
      ratio: Math.round(ratio * 100) / 100,
      annualOverpay: Math.round(annualOverpay),
      source: benchmark.source,
    },
  };
}
