export const EXCLUDED_SAVINGS_CATEGORIES = new Set([
  'mortgage', 'mortgages', 'loan', 'loans', 'council_tax', 'tax',
  'credit_card', 'credit cards', 'credit-cards', 'car_finance', 'car finance', 'car-finance',
  'fee', 'parking',
  'bank_transfer', 'transfer', 'transfers', 'debt_repayment',
]);

// Merchant-name heuristics for alerts where `category` is null (legacy rows
// written before category was stored on price_increase_alerts).
const ALERT_MERCHANT_BLOCKLIST = [
  /\bcouncil\s*tax\b/i,
  /\bfunding\s*circle\b/i,
  /\bklarna\b/i,
  /\bpaypal\s*credit\b/i,
  /\bPYMT\s*FP\b/i,
  /\bBTPP\b/i,
  /\b(halifax|santander|barclays|natwest|lloyds|hsbc|nationwide|bank of scotland)\b/i,
  /\b(b\/?card|barclaycard|amex|visa\s+plat)\b/i,
];

// Cap per-alert annual impact at 80% of prior annual spend. Anything above
// that is almost certainly a detector false positive, not a price rise.
const ALERT_IMPACT_CAP_RATIO = 0.8;

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

<<<<<<< HEAD
export function priceAlertAnnualImpact(a: any): number {
  const diff = (parseFloat(a?.new_amount) || 0) - (parseFloat(a?.old_amount) || 0);
  if (diff > 0) return diff * 12;
  return parseFloat(a?.annual_impact) || 0;
}

export function isPriceAlertValid(a: any): boolean {
  return priceAlertAnnualImpact(a) > 0;
=======
export function isPriceAlertValid(alert: {
  category?: string | null;
  merchant_normalized?: string | null;
  merchant_name?: string | null;
  old_amount?: number | string | null;
  new_amount?: number | string | null;
}): boolean {
  const catLower = (alert.category || '').toLowerCase();
  if (catLower && EXCLUDED_SAVINGS_CATEGORIES.has(catLower)) return false;

  const haystack = `${alert.merchant_normalized || ''} ${alert.merchant_name || ''}`;
  if (ALERT_MERCHANT_BLOCKLIST.some(rx => rx.test(haystack))) return false;

  const oldAmt = parseFloat(String(alert.old_amount)) || 0;
  const newAmt = parseFloat(String(alert.new_amount)) || 0;
  // Reject 2x+ jumps -- detector false positive
  if (oldAmt > 0 && newAmt > oldAmt * 2) return false;

  return true;
}

export function priceAlertAnnualImpact(alert: {
  old_amount?: number | string | null;
  new_amount?: number | string | null;
  annual_impact?: number | string | null;
}): number {
  const oldAmt = parseFloat(String(alert.old_amount)) || 0;
  const newAmt = parseFloat(String(alert.new_amount)) || 0;
  const diff = newAmt - oldAmt;
  const raw = diff > 0 ? diff * 12 : (parseFloat(String(alert.annual_impact)) || 0);
  // Cap at 80% of prior annual spend to prevent any single alert from
  // dominating the headline if the detector misfires.
  if (oldAmt > 0) {
    const cap = oldAmt * 12 * ALERT_IMPACT_CAP_RATIO;
    return Math.min(raw, cap);
  }
  return raw;
>>>>>>> 6ed4f978 (feat: managed agents with memory + finance-analyst, decommission legacy executives, hardened MCP v2.1.0)
}

export function calculateTotalSavings(deals: any[], priceAlerts: any[]): number {
  const validDeals = (deals || []).filter(isDealValid);
  const dealsTotal = validDeals.reduce((sum, d) => sum + (d.annualSaving || 0), 0);

<<<<<<< HEAD
  const alertTotal = (priceAlerts || []).reduce((sum, a) => sum + priceAlertAnnualImpact(a), 0);
=======
  const validAlerts = (priceAlerts || []).filter(isPriceAlertValid);
  const alertTotal = validAlerts.reduce((sum, a) => sum + priceAlertAnnualImpact(a), 0);
>>>>>>> 6ed4f978 (feat: managed agents with memory + finance-analyst, decommission legacy executives, hardened MCP v2.1.0)

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
