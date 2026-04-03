import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const AWIN_AFF_ID = '2825812';

function buildAwinUrl(awinMid: string, providerUrl: string): string {
  return `https://www.awin1.com/cread.php?awinmid=${awinMid}&awinaffid=${AWIN_AFF_ID}&ued=${encodeURIComponent(providerUrl)}`;
}

interface DealData {
  id: string;
  provider: string;
  headline: string;
  monthlyPrice: number;
  awinMid: string;
  providerUrl: string;
}

interface ComparisonResult {
  dealProvider: string;
  dealName: string;
  dealUrl: string;
  currentPrice: number;
  dealPrice: number;
  annualSaving: number;
  awinMid: string;
}

// Hardcoded key deals with approximate monthly prices for comparison
const DEALS_BY_CATEGORY: Record<string, DealData[]> = {
  energy: [
    { id: 'ovo-energy', provider: 'OVO Energy', headline: 'Fixed rate - lock in your price', monthlyPrice: 110, awinMid: '5318', providerUrl: 'https://www.ovoenergy.com' },
    { id: 'edf-energy', provider: 'EDF', headline: 'Fixed price tariffs - price certainty', monthlyPrice: 115, awinMid: '1887', providerUrl: 'https://www.edfenergy.com' },
    { id: 'eon-next', provider: 'E.ON Next', headline: 'Next Drive tariff for EV owners', monthlyPrice: 120, awinMid: '54765', providerUrl: 'https://www.eonenergy.com' },
    { id: 'msm-energy', provider: 'MoneySuperMarket', headline: 'Compare all energy suppliers', monthlyPrice: 100, awinMid: '22713', providerUrl: 'https://www.moneysupermarket.com/gas-and-electricity/' },
  ],
  broadband: [
    { id: 'community-fibre', provider: 'Community Fibre', headline: 'London full fibre', monthlyPrice: 25, awinMid: '19595', providerUrl: 'https://communityfibre.co.uk' },
    { id: 'sky-broadband', provider: 'Sky', headline: 'Ultrafast broadband + streaming', monthlyPrice: 30, awinMid: '11005', providerUrl: 'https://www.sky.com/shop/broadband' },
    { id: 'bt-broadband', provider: 'BT', headline: 'Full Fibre 500 - superfast speeds', monthlyPrice: 35, awinMid: '3041', providerUrl: 'https://www.bt.com/broadband' },
    { id: 'virgin-media', provider: 'Virgin Media', headline: 'Gig1 - fastest widely available', monthlyPrice: 40, awinMid: '6399', providerUrl: 'https://www.virginmedia.com' },
  ],
  mobile: [
    { id: 'lebara', provider: 'Lebara', headline: 'SIM-only from just a few pounds', monthlyPrice: 5, awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html' },
    { id: 'id-mobile', provider: 'iD Mobile', headline: 'SIM-only from £6/mo', monthlyPrice: 8, awinMid: '6366', providerUrl: 'https://www.idmobile.co.uk' },
    { id: 'smarty', provider: 'SMARTY', headline: 'Unused data rolled over', monthlyPrice: 10, awinMid: '10933', providerUrl: 'https://smarty.co.uk' },
    { id: 'giffgaff', provider: 'giffgaff', headline: 'Flexible - no contract', monthlyPrice: 10, awinMid: '3599', providerUrl: 'https://www.giffgaff.com' },
  ],
  insurance: [
    { id: 'compare-the-market', provider: 'Compare the Market', headline: 'Compare 100+ insurers', monthlyPrice: 0, awinMid: '3738', providerUrl: 'https://www.comparethemarket.com' },
    { id: 'moneysupermarket', provider: 'MoneySuperMarket', headline: 'Car, home and life insurance', monthlyPrice: 0, awinMid: '12049', providerUrl: 'https://www.moneysupermarket.com/car-insurance/' },
    { id: 'gocompare-car', provider: 'GoCompare', headline: 'Compare car insurance quotes', monthlyPrice: 0, awinMid: '117439', providerUrl: 'https://www.gocompare.com/car-insurance/' },
  ],
  mortgages: [
    { id: 'habito', provider: 'Habito', headline: 'Free online broker - 90+ lenders', monthlyPrice: 0, awinMid: '15441', providerUrl: 'https://www.habito.com' },
    { id: 'l-and-c', provider: 'London & Country', headline: 'UK largest fee-free broker', monthlyPrice: 0, awinMid: '7498', providerUrl: 'https://www.landc.co.uk' },
  ],
  loans: [
    { id: 'freedom-finance', provider: 'Freedom Finance', headline: 'Compare 30+ lenders from 3.3% APR', monthlyPrice: 0, awinMid: '14780', providerUrl: 'https://www.freedomfinance.co.uk/loans' },
    { id: 'moneysupermarket-loans', provider: 'MoneySuperMarket', headline: 'Compare and consolidate', monthlyPrice: 0, awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/loans/' },
  ],
  'credit-cards': [
    { id: 'totallymoney', provider: 'TotallyMoney', headline: 'Free credit score + card match', monthlyPrice: 0, awinMid: '10983', providerUrl: 'https://www.totallymoney.com/credit-cards/' },
    { id: 'mse-credit-cards', provider: 'MoneySavingExpert', headline: 'Eligibility checker', monthlyPrice: 0, awinMid: '12498', providerUrl: 'https://www.moneysavingexpert.com/credit-cards/' },
  ],
  'car-finance': [
    { id: 'carwow-finance', provider: 'Carwow', headline: 'Compare PCP, HP and loans', monthlyPrice: 0, awinMid: '18621', providerUrl: 'https://www.carwow.co.uk/car-finance' },
    { id: 'zuto', provider: 'Zuto', headline: 'All credit scores welcome', monthlyPrice: 0, awinMid: '16944', providerUrl: 'https://www.zuto.com' },
  ],
  travel: [
    { id: 'trip-com', provider: 'Trip.com', headline: 'Flights, hotels and holidays', monthlyPrice: 0, awinMid: '22405', providerUrl: 'https://uk.trip.com' },
    { id: 'travelsupermarket', provider: 'TravelSupermarket', headline: 'Insurance, car hire, holidays', monthlyPrice: 0, awinMid: '8734', providerUrl: 'https://www.travelsupermarket.com' },
  ],
  water: [
    { id: 'water-switch', provider: 'Water Switch', headline: 'Check if you can switch your water supplier', monthlyPrice: 0, awinMid: '12345', providerUrl: 'https://www.uswitch.com/water/' },
    { id: 'water-meter', provider: 'Save on Water', headline: 'Get a water meter and save', monthlyPrice: 0, awinMid: '12049', providerUrl: 'https://www.moneysavingexpert.com/utilities/cut-water-bills/' },
  ],
};

// Categories that should never produce deal comparisons
const EXCLUDED_COMPARISON_CATEGORIES = new Set([
  'mortgages', 'loans', 'credit-cards', 'car-finance',
]);

// Provider types that should never produce deal comparisons
const EXCLUDED_PROVIDER_TYPES = new Set([
  'mortgage', 'loan', 'credit_card', 'council_tax',
]);

/**
 * Normalise a subscription's provider_type/category/provider_name into a deals category.
 */
function normaliseToDealCategory(sub: {
  provider_type?: string | null;
  category?: string | null;
  category_normalized?: string | null;
  provider_name: string;
}): string | null {
  // If category_normalized is already set, use it
  if (sub.category_normalized && DEALS_BY_CATEGORY[sub.category_normalized]) {
    return sub.category_normalized;
  }

  // Map provider_type to deals category
  const providerTypeMap: Record<string, string> = {
    energy: 'energy',
    broadband: 'broadband',
    mobile: 'mobile',
    insurance: 'insurance',
    mortgage: 'mortgages',
    loan: 'loans',
    credit_card: 'credit-cards',
    tv: 'broadband', // TV often bundled with broadband
    water: 'water',
  };

  if (sub.provider_type && providerTypeMap[sub.provider_type]) {
    return providerTypeMap[sub.provider_type];
  }

  // Map category field
  const categoryMap: Record<string, string> = {
    energy: 'energy',
    broadband: 'broadband',
    mobile: 'mobile',
    insurance: 'insurance',
    mortgage: 'mortgages',
    loan: 'loans',
    water: 'water',
  };

  if (sub.category && categoryMap[sub.category]) {
    return categoryMap[sub.category];
  }

  // Check provider_name keywords
  const name = sub.provider_name.toLowerCase();
  const nameKeywords: Record<string, string[]> = {
    energy: ['energy', 'gas', 'electricity', 'british gas', 'octopus', 'ovo', 'edf', 'eon', 'e.on', 'sse', 'bulb', 'shell energy', 'scottish power'],
    broadband: ['broadband', 'fibre', 'bt ', 'sky broadband', 'virgin media', 'plusnet', 'talktalk', 'hyperoptic', 'community fibre', 'ee broadband'],
    mobile: ['mobile', 'sim', 'vodafone', 'three', 'o2', 'ee', 'giffgaff', 'smarty', 'id mobile', 'lebara', 'voxi', 'tesco mobile'],
    insurance: ['insurance', 'aviva', 'direct line', 'admiral', 'axa', 'aa breakdown', 'rac breakdown', 'green flag'],
    water: ['water', 'severn trent', 'thames water', 'anglian water', 'united utilities', 'yorkshire water', 'wessex water', 'welsh water'],
  };

  for (const [cat, keywords] of Object.entries(nameKeywords)) {
    if (keywords.some(kw => name.includes(kw))) {
      return cat;
    }
  }

  return null;
}

/**
 * Get the monthly cost of a subscription.
 */
function getMonthlyPrice(amount: number, billingCycle: string): number {
  if (billingCycle === 'yearly') return amount / 12;
  if (billingCycle === 'quarterly') return amount / 3;
  return amount;
}

/**
 * Find cheaper alternatives for a single subscription.
 */
export async function findCheaperAlternatives(
  subscriptionId: string,
  userId: string
): Promise<ComparisonResult[]> {
  const admin = getAdmin();

  // Fetch the subscription
  const { data: sub, error } = await admin
    .from('subscriptions')
    .select('id, provider_name, amount, billing_cycle, provider_type, category, category_normalized')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single();

  if (error || !sub) return [];

  // Skip excluded provider types (mortgages, loans, council_tax, etc.)
  if (sub.provider_type && EXCLUDED_PROVIDER_TYPES.has(sub.provider_type)) return [];
  // Skip subscriptions with no category at all
  if (!sub.category && !sub.provider_type && !sub.category_normalized) return [];

  const dealCategory = normaliseToDealCategory(sub);
  if (!dealCategory) return [];

  // Skip excluded deal categories
  if (EXCLUDED_COMPARISON_CATEGORIES.has(dealCategory)) return [];

  // Update category_normalized if not set
  if (!sub.category_normalized && dealCategory) {
    await admin
      .from('subscriptions')
      .update({ category_normalized: dealCategory })
      .eq('id', sub.id);
  }

  const currentMonthly = getMonthlyPrice(parseFloat(String(sub.amount)), sub.billing_cycle);
  const deals = DEALS_BY_CATEGORY[dealCategory] || [];

  // For comparison categories like insurance, mortgages, loans - we can't compare monthly price
  // Instead, just show comparison links
  const isComparisonOnly = ['insurance', 'mortgages', 'loans', 'credit-cards', 'car-finance', 'travel', 'water'].includes(dealCategory);

  let comparisons: ComparisonResult[] = [];

  if (isComparisonOnly) {
    // Conservative estimated savings with hard caps to keep figures realistic
    const savingsEstimates: Record<string, { pct: number; maxAnnual: number }> = {
      'insurance': { pct: 0.15, maxAnnual: 120 },      // 15% capped at £120/yr
      'mortgages': { pct: 0.02, maxAnnual: 200 },       // 2% capped at £200/yr (realistic broker savings)
      'loans': { pct: 0.05, maxAnnual: 150 },           // 5% capped at £150/yr
      'credit-cards': { pct: 0.10, maxAnnual: 100 },    // 10% capped at £100/yr
      'car-finance': { pct: 0.05, maxAnnual: 100 },     // 5% capped at £100/yr
      'travel': { pct: 0, maxAnnual: 0 },
      'water': { pct: 0.05, maxAnnual: 50 },            // 5% capped at £50/yr
    };
    const est = savingsEstimates[dealCategory] || { pct: 0, maxAnnual: 0 };
    const annualCurrent = currentMonthly * 12;
    let estimatedAnnualSaving = Math.min(Math.round(annualCurrent * est.pct), est.maxAnnual);
    // Cap: if savings > 80% of current annual spend, cap at 80%
    if (estimatedAnnualSaving > annualCurrent * 0.8) {
      estimatedAnnualSaving = Math.round(annualCurrent * 0.8);
    }

    comparisons = deals
      .filter(d => d.provider.toLowerCase() !== sub.provider_name.toLowerCase())
      .slice(0, 3)
      .map((d, i) => ({
        dealProvider: d.provider,
        dealName: d.headline,
        dealUrl: buildAwinUrl(d.awinMid, d.providerUrl),
        currentPrice: currentMonthly,
        dealPrice: est.pct > 0 ? currentMonthly * (1 - est.pct) : 0,
        annualSaving: i === 0 ? estimatedAnnualSaving : 0,
        awinMid: d.awinMid,
      }));
  } else {
    // For energy, also check energy_tariffs table
    if (dealCategory === 'energy') {
      const { data: tariffs } = await admin
        .from('energy_tariffs')
        .select('provider, tariff_name, monthly_cost_estimate')
        .not('monthly_cost_estimate', 'is', null)
        .order('monthly_cost_estimate', { ascending: true })
        .limit(5);

      if (tariffs && tariffs.length > 0) {
        for (const tariff of tariffs) {
          const tariffMonthly = parseFloat(String(tariff.monthly_cost_estimate));
          const annualSaving = (currentMonthly - tariffMonthly) * 12;
          const tariffSavingsMonthly = currentMonthly - tariffMonthly;
          // Cap: if savings > 80% of current price, skip (unrealistic)
          if (tariffSavingsMonthly > currentMonthly * 0.8) continue;
          if (annualSaving > 24) {
            // Find matching deal or create comparison link
            const matchingDeal = deals.find(d =>
              d.provider.toLowerCase().includes(tariff.provider.toLowerCase()) ||
              tariff.provider.toLowerCase().includes(d.provider.toLowerCase())
            );
            comparisons.push({
              dealProvider: tariff.provider,
              dealName: tariff.tariff_name || 'Current tariff',
              dealUrl: matchingDeal
                ? buildAwinUrl(matchingDeal.awinMid, matchingDeal.providerUrl)
                : buildAwinUrl('22713', 'https://www.moneysupermarket.com/gas-and-electricity/'),
              currentPrice: currentMonthly,
              dealPrice: tariffMonthly,
              annualSaving: Math.round(annualSaving),
              awinMid: matchingDeal?.awinMid || '22713',
            });
          }
        }
      }
    }

    // Compare against hardcoded deals
    for (const deal of deals) {
      if (deal.monthlyPrice <= 0) continue;
      if (deal.provider.toLowerCase() === sub.provider_name.toLowerCase()) continue;

      const annualSaving = (currentMonthly - deal.monthlyPrice) * 12;
      if (annualSaving > 24) {
        // Cap: if savings > 80% of current price, skip (unrealistic)
        const savingsMonthly = currentMonthly - deal.monthlyPrice;
        if (savingsMonthly > currentMonthly * 0.8) continue;

        comparisons.push({
          dealProvider: deal.provider,
          dealName: deal.headline,
          dealUrl: buildAwinUrl(deal.awinMid, deal.providerUrl),
          currentPrice: currentMonthly,
          dealPrice: deal.monthlyPrice,
          annualSaving: Math.round(annualSaving),
          awinMid: deal.awinMid,
        });
      }
    }
  }

  // Sort by saving descending, return top 3
  comparisons.sort((a, b) => b.annualSaving - a.annualSaving);
  return comparisons.slice(0, 3);
}

/**
 * Compare all active subscriptions for a user and return total potential saving.
 */
export async function compareAllSubscriptions(userId: string): Promise<{
  comparisons: Record<string, ComparisonResult[]>;
  totalAnnualSaving: number;
  count: number;
}> {
  const admin = getAdmin();

  // Fetch all active subscriptions
  const { data: subs, error } = await admin
    .from('subscriptions')
    .select('id, provider_name, amount, billing_cycle, provider_type, category, category_normalized')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('dismissed_at', null);

  if (error || !subs) return { comparisons: {}, totalAnnualSaving: 0, count: 0 };

  const allComparisons: Record<string, ComparisonResult[]> = {};
  let totalAnnualSaving = 0;
  let count = 0;

  for (const sub of subs) {
    const results = await findCheaperAlternatives(sub.id, userId);
    if (results.length > 0) {
      allComparisons[sub.id] = results;
      // Use the best deal's saving for the total
      const bestSaving = results[0]?.annualSaving || 0;
      if (bestSaving > 0) {
        totalAnnualSaving += bestSaving;
        count++;
      }
    }
  }

  return { comparisons: allComparisons, totalAnnualSaving, count };
}

/**
 * Save comparison results to the subscription_comparisons table.
 */
export async function saveComparisons(
  subscriptionId: string,
  currentPrice: number,
  comparisons: ComparisonResult[]
): Promise<void> {
  const admin = getAdmin();

  // Delete old comparisons for this subscription
  await admin
    .from('subscription_comparisons')
    .delete()
    .eq('subscription_id', subscriptionId);

  if (comparisons.length === 0) return;

  // Insert new comparisons
  const rows = comparisons.map(c => ({
    subscription_id: subscriptionId,
    current_price: currentPrice,
    deal_price: c.dealPrice,
    annual_saving: c.annualSaving,
    deal_provider: c.dealProvider,
    deal_name: c.dealName,
    deal_url: c.dealUrl,
    checked_at: new Date().toISOString(),
    dismissed: false,
  }));

  await admin.from('subscription_comparisons').insert(rows);
}
