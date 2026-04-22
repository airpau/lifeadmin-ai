export const EXCLUDED_SAVINGS_CATEGORIES = new Set([
  'mortgage', 'mortgages', 'loan', 'loans', 'council_tax', 'tax',
  'credit_card', 'credit cards', 'credit-cards', 'car_finance', 'car finance', 'car-finance',
  'fee', 'parking',
]);

export function isDealValid(deal: { category?: string | null; currentPrice?: number; annualSaving?: number; subscriptionName?: string; providerName?: string }): boolean {
  if (!deal.category) return false;
  
  const catLower = deal.category.toLowerCase();
  if (EXCLUDED_SAVINGS_CATEGORIES.has(catLower)) return false;
  
  const name = (deal.subscriptionName || deal.providerName || '').toLowerCase();
  if (name.includes('chris hillier')) return false;
  
  // 80% cap: if annual saving > 80% of current annual spend, skip
  const currentPrice = deal.currentPrice || 0;
  const annualSaving = deal.annualSaving || 0;
  if (currentPrice > 0 && annualSaving > currentPrice * 12 * 0.8) return false;
  
  return true;
}

/**
 * Headline "Potential Savings Found" figure shown on the dashboard.
 *
 * Only real switch-deal savings contribute to this total. Price-increase
 * alerts are surfaced separately (via PriceIncreaseCard) — they represent
 * *mitigable overspend*, not guaranteed savings, and rolling them into the
 * same bucket was producing inflated, unreliable totals (e.g. £36k/yr)
 * because:
 *   (a) the same recurring merchant can produce multiple active alerts
 *       over consecutive months, so the delta gets counted every time,
 *   (b) one-off / non-recurring transactions occasionally slip through the
 *       detector and show up as huge notional "increases",
 *   (c) an alert's annual_impact is already the annualised delta, so the
 *       previous code double-counted on the positive-diff branch.
 *
 * Deals are de-duplicated by subscriptionName so the same provider cannot
 * contribute twice (parseComparisonDeals already takes the best comparison
 * per subscription, but this is a belt-and-braces check for callers that
 * pass pre-flattened lists).
 *
 * The second parameter is kept for backwards-compat with existing call
 * sites; it is intentionally ignored.
 */
export function calculateTotalSavings(
  deals: any[],
  _priceAlerts?: any[],
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const d of deals || []) {
    if (!isDealValid(d)) continue;
    const key = (d.subscriptionName || d.providerName || '').toLowerCase().trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    total += d.annualSaving || 0;
  }
  return total;
}

export function parseComparisonDeals(data: any) {
  const dealsList: any[] = [];
  let filteredSaving = 0;
  let filteredCount = 0;
  
  for (const sub of (data.subscriptions || [])) {
    if (!sub.comparisons?.length) continue;
    
    const best = sub.comparisons[0];
    const deal = {
      subscriptionName: sub.subscriptionName || sub.providerName || 'Unknown',
      currentPrice: best.currentPrice,
      dealProvider: best.dealProvider,
      dealPrice: best.dealPrice,
      annualSaving: best.annualSaving,
      dealUrl: best.dealUrl,
      category: sub.category || '',
    };
    
    if (isDealValid(deal)) {
      filteredSaving += deal.annualSaving;
      filteredCount++;
      dealsList.push(deal);
    }
  }
  
  return { saving: filteredSaving, count: filteredCount, deals: dealsList };
}
