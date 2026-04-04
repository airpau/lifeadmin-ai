import type { OverchargeSignal, SubscriptionForAssessment } from '../types';

/**
 * Signal 3: Contract expired / out of contract (weight: 15)
 * Checks subscriptions.contract_end_date to flag out-of-contract
 * subscriptions that are likely on default/rollover pricing.
 *
 * Score: 100 if expired >3 months ago, 75 if >1 month, 50 if expired, 0 if in contract or no data
 */
export function contractExpirySignal(sub: SubscriptionForAssessment): OverchargeSignal {
  if (!sub.contract_end_date) {
    return {
      type: 'contract_expired',
      weight: 15,
      score: 0,
      detail: 'No contract end date recorded',
    };
  }

  const endDate = new Date(sub.contract_end_date);
  const now = new Date();
  const daysSinceExpiry = Math.floor((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceExpiry < 0) {
    const daysUntilExpiry = Math.abs(daysSinceExpiry);
    if (daysUntilExpiry <= 30) {
      return {
        type: 'contract_expired',
        weight: 15,
        score: 25,
        detail: `Contract expires in ${daysUntilExpiry} days — good time to compare deals`,
        data: { contractEndDate: sub.contract_end_date, daysUntilExpiry },
      };
    }
    return {
      type: 'contract_expired',
      weight: 15,
      score: 0,
      detail: `In contract until ${sub.contract_end_date} (${daysUntilExpiry} days)`,
      data: { contractEndDate: sub.contract_end_date, daysUntilExpiry },
    };
  }

  // Contract has expired
  let score = 50;
  if (daysSinceExpiry > 90) score = 100;
  else if (daysSinceExpiry > 30) score = 75;

  const monthsExpired = Math.floor(daysSinceExpiry / 30);

  return {
    type: 'contract_expired',
    weight: 15,
    score,
    detail: `Out of contract for ${monthsExpired} month${monthsExpired !== 1 ? 's' : ''} — likely on default/rollover pricing`,
    data: { contractEndDate: sub.contract_end_date, daysSinceExpiry, monthsExpired },
  };
}
