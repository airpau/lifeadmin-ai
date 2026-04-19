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

export function calculateTotalSavings(deals: any[], priceAlerts: any[]): number {
  const validDeals = (deals || []).filter(isDealValid);
  const dealsTotal = validDeals.reduce((sum, d) => sum + (d.annualSaving || 0), 0);
  
  const alertTotal = (priceAlerts || []).reduce((sum, a) => {
    const diff = (parseFloat(a.new_amount) || 0) - (parseFloat(a.old_amount) || 0);
    return sum + (diff > 0 ? diff * 12 : (parseFloat(a.annual_impact) || 0));
  }, 0);
  
  return dealsTotal + alertTotal;
}

export function parseComparisonDeals(data: any) {
  const dealsList: any[] = [];

  for (const sub of (data.subscriptions || [])) {
    if (!sub.comparisons?.length) continue;

    const best = sub.comparisons[0];
    const deal = {
      subscriptionId: sub.subscriptionId || '',
      subscriptionName: sub.subscriptionName || sub.providerName || 'Unknown',
      currentPrice: best.currentPrice,
      dealProvider: best.dealProvider,
      dealPrice: best.dealPrice,
      annualSaving: best.annualSaving,
      dealUrl: best.dealUrl,
      category: sub.category || '',
    };

    if (isDealValid(deal)) {
      dealsList.push(deal);
    }
  }

  // Deduplicate by subscriptionId so two subscriptions to the same provider
  // (e.g. EE broadband + EE mobile) are kept as separate entries.
  const byId = new Map<string, typeof dealsList[0]>();
  for (let i = 0; i < dealsList.length; i++) {
    const deal = dealsList[i];
    const key = deal.subscriptionId || `_idx_${i}`;
    const existing = byId.get(key);
    if (!existing || deal.annualSaving > existing.annualSaving) {
      byId.set(key, deal);
    }
  }
  const deduped = Array.from(byId.values());

  return {
    saving: deduped.reduce((sum: number, d: any) => sum + (d.annualSaving || 0), 0),
    count: deduped.length,
    deals: deduped,
  };
}
