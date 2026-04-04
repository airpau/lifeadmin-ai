import type { OverchargeSignal, OverchargeScore } from './types';

/**
 * Calculate a weighted overcharge score from signal results.
 * Each signal has a weight (0-100) and a score (0-100).
 * The final score is a weighted average clamped to 0-100.
 *
 * Confidence is based on how many signals have non-zero scores:
 * - 3+ active signals = high
 * - 2 active signals = medium
 * - 0-1 active signals = low
 */
export function calculateOverchargeScore(
  signals: OverchargeSignal[],
  currentMonthly: number,
  marketBestMonthly?: number | null
): OverchargeScore {
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);

  if (totalWeight === 0) {
    return { score: 0, confidence: 'low', estimatedAnnualSaving: 0 };
  }

  const weightedScore = signals.reduce((sum, s) => sum + (s.score * s.weight), 0) / totalWeight;
  const score = Math.round(Math.min(100, Math.max(0, weightedScore)));

  const activeSignals = signals.filter(s => s.score > 0).length;
  const confidence: 'high' | 'medium' | 'low' =
    activeSignals >= 3 ? 'high' : activeSignals >= 2 ? 'medium' : 'low';

  // Estimated saving: use market best if available, otherwise estimate from score
  let estimatedAnnualSaving = 0;
  if (marketBestMonthly && marketBestMonthly < currentMonthly) {
    estimatedAnnualSaving = (currentMonthly - marketBestMonthly) * 12;
  } else if (score > 0) {
    // Conservative estimate: score% of 20% of annual cost
    estimatedAnnualSaving = (score / 100) * 0.2 * currentMonthly * 12;
  }

  return {
    score,
    confidence,
    estimatedAnnualSaving: Math.round(estimatedAnnualSaving * 100) / 100,
  };
}
