export const EXCLUDED_SAVINGS_CATEGORIES = new Set([
  'mortgage', 'mortgages', 'loan', 'loans', 'council_tax', 'tax',
  'credit_card', 'credit cards', 'credit-cards', 'car_finance', 'car finance', 'car-finance',
  'fee', 'parking',
  'water', 'water_company', // Can't switch UK water suppliers
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

export function priceAlertAnnualImpact(a: any): number {
  const diff = (parseFloat(a?.new_amount) || 0) - (parseFloat(a?.old_amount) || 0);
  if (diff > 0) return diff * 12;
  return parseFloat(a?.annual_impact) || 0;
}

export function isPriceAlertValid(a: any): boolean {
  return priceAlertAnnualImpact(a) > 0;
}

export function calculateTotalSavings(deals: any[], priceAlerts: any[]): number {
  const validDeals = (deals || []).filter(isDealValid);
  const dealsTotal = validDeals.reduce((sum, d) => sum + (d.annualSaving || 0), 0);

  const alertTotal = (priceAlerts || []).reduce((sum, a) => sum + priceAlertAnnualImpact(a), 0);

  return dealsTotal + alertTotal;
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
