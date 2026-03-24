'use client';

import { useState, useEffect } from 'react';
import { Tag, Loader2, Clock, AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import { capture } from '@/lib/posthog';

// Awin affiliate ID — update this once Awin approval comes through
// Current: placeholder. Replace with actual Awin publisher ID from awin.com dashboard
const AWIN_AFF_ID = process.env.NEXT_PUBLIC_AWIN_AFF_ID || '!!!REPLACE_WITH_AWIN_ID!!!';

interface Deal {
  id: string;
  provider: string;
  headline: string;
  saving: string;
  awinMid: string;
  providerUrl: string;
  category: string;
}

const DEALS: Record<string, Deal[]> = {
  Energy: [
    { id: 'octopus-energy', provider: 'Octopus Energy', headline: 'Flexible tariff - no exit fees', saving: 'Save up to £180/yr', awinMid: '8173', providerUrl: 'https://octopus.energy', category: 'Energy' },
    { id: 'ovo-energy', provider: 'OVO Energy', headline: 'Fixed rate - lock in your price', saving: 'Save up to £150/yr', awinMid: '5318', providerUrl: 'https://www.ovoenergy.com', category: 'Energy' },
    { id: 'eon-next', provider: 'E.ON Next', headline: 'Next Drive tariff for EV owners', saving: 'Save up to £120/yr', awinMid: '54765', providerUrl: 'https://www.eonenergy.com', category: 'Energy' },
    { id: 'edf-energy', provider: 'EDF', headline: 'Fixed price tariffs - price certainty', saving: 'Save up to £140/yr', awinMid: '1887', providerUrl: 'https://www.edfenergy.com', category: 'Energy' },
    { id: 'msm-energy', provider: 'MoneySuperMarket', headline: 'Compare energy tariffs from all suppliers', saving: 'Save up to £200/yr', awinMid: '22713', providerUrl: 'https://www.moneysupermarket.com/gas-and-electricity/', category: 'Energy' },
  ],
  Broadband: [
    { id: 'bt-broadband', provider: 'BT', headline: 'Full Fibre 500 - superfast speeds', saving: 'Save up to £240/yr', awinMid: '3041', providerUrl: 'https://www.bt.com/broadband', category: 'Broadband' },
    { id: 'sky-broadband', provider: 'Sky', headline: 'Ultrafast broadband + streaming', saving: 'Save up to £180/yr', awinMid: '11005', providerUrl: 'https://www.sky.com/shop/broadband', category: 'Broadband' },
    { id: 'virgin-media', provider: 'Virgin Media', headline: "Gig1 - UK's fastest widely available broadband", saving: 'Save up to £200/yr', awinMid: '6399', providerUrl: 'https://www.virginmedia.com', category: 'Broadband' },
    { id: 'ee-broadband', provider: 'EE', headline: 'Full Fibre with smart hub included', saving: 'Save up to £180/yr', awinMid: '3516', providerUrl: 'https://shop.ee.co.uk/broadband', category: 'Broadband' },
    { id: 'plusnet', provider: 'Plusnet', headline: 'Award-winning broadband from Yorkshire', saving: 'Save up to £160/yr', awinMid: '2973', providerUrl: 'https://www.plus.net', category: 'Broadband' },
    { id: 'talktalk', provider: 'TalkTalk', headline: 'Affordable fibre broadband', saving: 'Save up to £140/yr', awinMid: '3674', providerUrl: 'https://www.talktalk.co.uk', category: 'Broadband' },
    { id: 'hyperoptic', provider: 'Hyperoptic', headline: '1Gbps full fibre - no speed caps', saving: 'Save up to £200/yr', awinMid: '5737', providerUrl: 'https://www.hyperoptic.com', category: 'Broadband' },
    { id: 'community-fibre', provider: 'Community Fibre', headline: 'London full fibre - ultrafast speeds', saving: 'Save up to £180/yr', awinMid: '19595', providerUrl: 'https://communityfibre.co.uk', category: 'Broadband' },
    { id: 'msm-broadband', provider: 'MoneySuperMarket', headline: 'Compare broadband deals from all providers', saving: 'Compare deals', awinMid: '25756', providerUrl: 'https://www.moneysupermarket.com/broadband/', category: 'Broadband' },
    { id: 'onestream', provider: 'Onestream', headline: 'Simple, affordable full fibre broadband', saving: 'Save up to £160/yr', awinMid: '23296', providerUrl: 'https://www.onestream.co.uk', category: 'Broadband' },
    { id: 'broadband-genie', provider: 'Broadband Genie', headline: 'Independent broadband comparison', saving: 'Find cheapest deals', awinMid: '12213', providerUrl: 'https://www.broadbandgenie.co.uk', category: 'Broadband' },
  ],
  Insurance: [
    { id: 'compare-the-market', provider: 'Compare the Market', headline: 'Compare 100+ insurers in minutes', saving: 'Save up to £300/yr', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com', category: 'Insurance' },
    { id: 'moneysupermarket', provider: 'MoneySuperMarket', headline: 'Car, home & life insurance', saving: 'Save up to £250/yr', awinMid: '12049', providerUrl: 'https://www.moneysupermarket.com/car-insurance/', category: 'Insurance' },
    { id: 'gocompare-car', provider: 'GoCompare Car', headline: 'Compare car insurance quotes', saving: 'Save up to £280/yr', awinMid: '117439', providerUrl: 'https://www.gocompare.com/car-insurance/', category: 'Insurance' },
    { id: 'gocompare-home', provider: 'GoCompare Home', headline: 'Compare home insurance quotes', saving: 'Save up to £200/yr', awinMid: '117441', providerUrl: 'https://www.gocompare.com/home-insurance/', category: 'Insurance' },
    { id: 'rac-breakdown', provider: 'RAC', headline: 'Breakdown cover from £6.50/mo', saving: 'Roadside peace of mind', awinMid: '3790', providerUrl: 'https://www.rac.co.uk/breakdown-cover', category: 'Insurance' },
    { id: 'aa-breakdown', provider: 'The AA', headline: 'UK breakdown cover - roadside assistance', saving: 'Cover from £4/mo', awinMid: '3932', providerUrl: 'https://www.theaa.com/breakdown-cover', category: 'Insurance' },
  ],
  Mobile: [
    { id: 'id-mobile', provider: 'iD Mobile', headline: 'SIM-only from £6/mo', saving: 'Save up to £240/yr', awinMid: '6366', providerUrl: 'https://www.idmobile.co.uk', category: 'Mobile' },
    { id: 'smarty', provider: 'SMARTY', headline: 'Fair data - unused data rolled over', saving: 'Save up to £200/yr', awinMid: '10933', providerUrl: 'https://smarty.co.uk', category: 'Mobile' },
    { id: 'lebara', provider: 'Lebara', headline: 'International calls included', saving: 'Save up to £180/yr', awinMid: '30681', providerUrl: 'https://mobile.lebara.com/gb/en', category: 'Mobile' },
    { id: 'ee-mobile', provider: 'EE', headline: "UK's largest 5G network", saving: 'Save up to £200/yr', awinMid: '31423', providerUrl: 'https://shop.ee.co.uk/sim-only', category: 'Mobile' },
    { id: 'tesco-mobile', provider: 'Tesco Mobile', headline: 'Clubcard prices on SIM plans', saving: 'Save up to £180/yr', awinMid: '101917', providerUrl: 'https://www.tescomobile.com', category: 'Mobile' },
    { id: 'voxi', provider: 'VOXI', headline: 'Endless social media data included', saving: 'Save up to £160/yr', awinMid: '10951', providerUrl: 'https://www.voxi.co.uk', category: 'Mobile' },
    { id: 'giffgaff', provider: 'giffgaff', headline: 'Flexible SIM plans - no contract required', saving: 'Save up to £200/yr', awinMid: '3599', providerUrl: 'https://www.giffgaff.com', category: 'Mobile' },
    { id: 'talkmobile', provider: 'Talkmobile', headline: 'Low-cost SIM plans on the Vodafone network', saving: 'Save up to £180/yr', awinMid: '2351', providerUrl: 'https://www.talkmobile.co.uk', category: 'Mobile' },
    { id: 'asda-mobile', provider: 'Asda Mobile', headline: 'Budget-friendly SIM bundles', saving: 'Save up to £160/yr', awinMid: '6250', providerUrl: 'https://mobile.asda.com/bundles', category: 'Mobile' },
    { id: 'honest-mobile', provider: 'Honest Mobile', headline: 'Ethical mobile - plants trees with every plan', saving: 'Save up to £140/yr', awinMid: '20890', providerUrl: 'https://www.honestmobile.co.uk', category: 'Mobile' },
    { id: 'ee-payg', provider: 'EE Pay As You Go', headline: 'UK largest 5G network - no contract needed', saving: 'Flexible top-ups', awinMid: '118459', providerUrl: 'https://shop.ee.co.uk/pay-as-you-go', category: 'Mobile' },
    { id: 'o2-mobile', provider: 'O2', headline: 'Priority rewards and flexible plans', saving: 'Save up to £200/yr', awinMid: '3235', providerUrl: 'https://www.o2.co.uk', category: 'Mobile' },
    { id: 'vodafone', provider: 'Vodafone', headline: 'Award-winning 5G network with extras', saving: 'Save up to £220/yr', awinMid: '1257', providerUrl: 'https://www.vodafone.co.uk', category: 'Mobile' },
    { id: 'three-mobile', provider: 'Three', headline: '5G at no extra cost on all plans', saving: 'Save up to £200/yr', awinMid: '10210', providerUrl: 'https://www.three.co.uk', category: 'Mobile' },
  ],
  Mortgages: [
    { id: 'habito', provider: 'Habito', headline: 'Free online mortgage broker - compare 90+ lenders', saving: 'Save up to £3,000/yr', awinMid: '15441', providerUrl: 'https://www.habito.com', category: 'Mortgages' },
    { id: 'moneysupermarket-mortgages', provider: 'MoneySuperMarket', headline: 'Compare mortgage rates from 50+ lenders', saving: 'Compare rates', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/mortgages/', category: 'Mortgages' },
    { id: 'l-and-c', provider: 'London & Country', headline: "UK's largest fee-free mortgage broker", saving: 'Fee-free advice', awinMid: '7498', providerUrl: 'https://www.landc.co.uk', category: 'Mortgages' },
    { id: 'trussle', provider: 'Trussle', headline: 'Online mortgage broker - no fees, no jargon', saving: 'Save thousands', awinMid: '19822', providerUrl: 'https://trussle.com', category: 'Mortgages' },
    { id: 'maze-mortgages', provider: 'Maze Mortgages', headline: 'Cashback on your mortgage - up to £3,700', saving: 'Earn cashback', awinMid: '80859', providerUrl: 'https://www.mazemortgages.co.uk', category: 'Mortgages' },
  ],
  'Credit Cards': [
    { id: 'mse-credit-cards', provider: 'MoneySavingExpert', headline: "Eligibility checker - see cards you'll get", saving: '0% balance transfer deals', awinMid: '12498', providerUrl: 'https://www.moneysavingexpert.com/credit-cards/', category: 'Credit Cards' },
    { id: 'comparethemarket-cc', provider: 'Compare the Market', headline: 'Compare credit cards - balance transfer, cashback, rewards', saving: 'Save on interest', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com/credit-cards/', category: 'Credit Cards' },
    { id: 'totallymoney', provider: 'TotallyMoney', headline: 'Free credit score + personalised card recommendations', saving: 'Best match cards', awinMid: '10983', providerUrl: 'https://www.totallymoney.com/credit-cards/', category: 'Credit Cards' },
    { id: 'msm-money', provider: 'MoneySuperMarket', headline: 'Compare credit cards and current accounts', saving: 'Find best rates', awinMid: '61791', providerUrl: 'https://www.moneysupermarket.com/credit-cards/', category: 'Credit Cards' },
  ],
  Loans: [
    { id: 'freedom-finance', provider: 'Freedom Finance', headline: 'Personal loans from 3.3% APR - compare 30+ lenders', saving: 'Lower your rate', awinMid: '14780', providerUrl: 'https://www.freedomfinance.co.uk/loans', category: 'Loans' },
    { id: 'moneysupermarket-loans', provider: 'MoneySuperMarket', headline: 'Compare personal loans - consolidate and save', saving: 'Compare APRs', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/loans/', category: 'Loans' },
    { id: 'comparethemarket-loans', provider: 'Compare the Market', headline: 'Personal and car finance - one search, multiple lenders', saving: 'Reduce monthly payments', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com/loans/', category: 'Loans' },
    { id: 'aa-loans', provider: 'AA Loans', headline: 'Personal loans from 7.9% APR representative', saving: '£50 cashback on completion', awinMid: '3953', providerUrl: 'https://www.theaa.com/loans', category: 'Loans' },
    { id: 'loan-co-uk', provider: 'Loan.co.uk', headline: 'Secured loans - consolidate debts and save', saving: 'Up to £300 cashback', awinMid: '18915', providerUrl: 'https://www.loan.co.uk', category: 'Loans' },
  ],
  Travel: [
    { id: 'trip-com', provider: 'Trip.com', headline: 'Flights, hotels and holidays - compare and save', saving: 'Save on travel', awinMid: '22405', providerUrl: 'https://uk.trip.com', category: 'Travel' },
    { id: 'travelsupermarket', provider: 'TravelSupermarket', headline: 'Compare travel insurance, car hire and holidays', saving: '17% insurance savings', awinMid: '8734', providerUrl: 'https://www.travelsupermarket.com', category: 'Travel' },
    { id: 'jet2', provider: 'Jet2.com', headline: 'Package holidays and flights from the UK', saving: 'Save on holidays', awinMid: '18729', providerUrl: 'https://www.jet2.com', category: 'Travel' },
  ],
  'Car Finance': [
    { id: 'carwow-finance', provider: 'Carwow', headline: 'Compare car finance deals - PCP, HP, and personal loans', saving: 'Save on car finance', awinMid: '18621', providerUrl: 'https://www.carwow.co.uk/car-finance', category: 'Car Finance' },
    { id: 'zuto', provider: 'Zuto', headline: 'Car finance comparison - all credit scores welcome', saving: 'Rates from 6.9% APR', awinMid: '16944', providerUrl: 'https://www.zuto.com', category: 'Car Finance' },
  ],
};

// Map provider_type (from contract tracking) to deal categories
const PROVIDER_TYPE_TO_DEALS: Record<string, string[]> = {
  energy: ['Energy'],
  broadband: ['Broadband'],
  mobile: ['Mobile'],
  tv: ['Broadband'], // TV often bundled with broadband
  insurance_home: ['Insurance'],
  insurance_car: ['Insurance', 'Car Finance'],
  insurance_pet: ['Insurance'],
  insurance_life: ['Insurance'],
  insurance_travel: ['Insurance'],
  mortgage: ['Mortgages'],
  loan: ['Loans'],
  credit_card: ['Credit Cards'],
  streaming: [],
  software: [],
  fitness: [],
  news: [],
  council_tax: [],
  water: [],
  other: [],
};

// Legacy category mapping (for subscriptions without provider_type)
const CATEGORY_TO_DEALS: Record<string, string[]> = {
  utility: ['Energy'],
  broadband: ['Broadband'],
  mobile: ['Mobile'],
  insurance: ['Insurance'],
  mortgage: ['Mortgages'],
  loan: ['Loans', 'Credit Cards'],
  credit_card: ['Credit Cards'],
  car_finance: ['Car Finance'],
  streaming: [],
  fitness: [],
  software: [],
};

interface UserSubscription {
  id: string;
  provider_name: string;
  amount: number;
  category: string | null;
  billing_cycle: string;
  contract_end_date: string | null;
  contract_type: string | null;
  provider_type: string | null;
  annual_cost: number | null;
  interest_rate: number | null;
  remaining_balance: number | null;
  monthly_payment: number | null;
  current_tariff: string | null;
  auto_renews: boolean | null;
  early_exit_fee: number | null;
  speed_mbps: number | null;
  data_allowance: string | null;
}

function buildAwinUrl(awinMid: string, providerUrl: string): string {
  return `https://www.awin1.com/cread.php?awinmid=${awinMid}&awinaffid=${AWIN_AFF_ID}&ued=${encodeURIComponent(providerUrl)}`;
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr);
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyLabel(days: number): { text: string; color: string; bg: string } {
  if (days <= 0) return { text: 'Contract ended', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
  if (days <= 7) return { text: `Ends in ${days} days`, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
  if (days <= 14) return { text: `Ends in ${days} days`, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' };
  if (days <= 30) return { text: `Ends in ${days} days`, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
  if (days <= 90) return { text: `Ends in ${Math.ceil(days / 7)} weeks`, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' };
  return { text: `Ends in ${Math.ceil(days / 30)} months`, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30' };
}

// Deals are coming soon. Check if Awin publisher ID is configured.
const DEALS_LIVE = !!AWIN_AFF_ID && AWIN_AFF_ID !== '!!!REPLACE_WITH_AWIN_ID!!!';

function DealCard({ deal, highlight }: { deal: Deal; highlight?: boolean }) {
  const [tracking, setTracking] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (!DEALS_LIVE) return; // Don't navigate if deals aren't live
    setTracking(true);
    try {
      await fetch('/api/deals/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: deal.provider,
          category: deal.category,
          deal_id: deal.id,
          awin_mid: deal.awinMid,
        }),
      });
      capture('deal_clicked', { provider: deal.provider, category: deal.category });
    } catch {
      // Non-fatal
    } finally {
      setTracking(false);
      window.open(buildAwinUrl(deal.awinMid, deal.providerUrl), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={`bg-slate-900/50 backdrop-blur-sm border rounded-2xl p-6 transition-all flex flex-col gap-4 ${
      highlight ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800'
    } ${!DEALS_LIVE ? 'opacity-60' : 'hover:border-slate-600'}`}>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-white mb-1">{deal.provider}</h3>
        <p className="text-slate-400 text-sm">{deal.headline}</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">
          {deal.saving}
        </span>
        {DEALS_LIVE ? (
          <a
            href={buildAwinUrl(deal.awinMid, deal.providerUrl)}
            onClick={handleClick}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap"
          >
            {tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            View Deal →
          </a>
        ) : (
          <span className="bg-slate-700 text-slate-400 font-medium px-4 py-2 rounded-lg text-sm cursor-not-allowed">
            Coming Soon
          </span>
        )}
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setSubscriptions(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Build personalised recommendations using contract data
  const urgentSwitches: Array<{ sub: UserSubscription; days: number; dealCategories: string[] }> = [];
  const activeSwitches: Array<{ sub: UserSubscription; dealCategories: string[] }> = [];

  for (const sub of subscriptions) {
    // Get deal categories from provider_type first, then fall back to category
    const dealCats = sub.provider_type
      ? (PROVIDER_TYPE_TO_DEALS[sub.provider_type] || [])
      : (CATEGORY_TO_DEALS[sub.category || ''] || []);

    if (dealCats.length === 0) continue;

    if (sub.contract_end_date) {
      const days = daysUntil(sub.contract_end_date);
      if (days <= 90) {
        urgentSwitches.push({ sub, days, dealCategories: dealCats });
      } else {
        activeSwitches.push({ sub, dealCategories: dealCats });
      }
    } else {
      activeSwitches.push({ sub, dealCategories: dealCats });
    }
  }

  // Sort urgent by soonest first
  urgentSwitches.sort((a, b) => a.days - b.days);

  // Calculate total switchable spend
  const switchableMonthly = [...urgentSwitches, ...activeSwitches].reduce((sum, item) => {
    return sum + (parseFloat(String(item.sub.amount)) || 0);
  }, 0);

  // All deal categories the user has
  const userDealCategories = new Set<string>();
  [...urgentSwitches, ...activeSwitches].forEach(item => {
    item.dealCategories.forEach(c => userDealCategories.add(c));
  });

  // Other deals the user doesn't have — for discovery
  const otherCategories = Object.keys(DEALS).filter(cat => !userDealCategories.has(cat));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Find Better Deals</h1>
        <p className="text-slate-400">Personalised savings based on your contracts and bills.</p>
      </div>

      {/* Coming soon banner */}
      {!DEALS_LIVE && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4 mb-8">
          <p className="text-amber-400 font-semibold text-sm mb-1">Deal switching is coming soon</p>
          <p className="text-slate-400 text-sm">We're setting up partnerships with energy, broadband, insurance, and mortgage providers. Once live, you'll be able to compare and switch directly from this page based on your current contracts. Check back soon.</p>
        </div>
      )}

      {/* Affiliate disclosure */}
      <div className="flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 mb-8">
        <Tag className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Affiliate disclosure:</span> We may earn a commission when you switch via our links. This never affects the price you pay.
        </p>
      </div>

      {/* Contracts Ending Soon — URGENT section */}
      {urgentSwitches.length > 0 && (
        <section className="mb-10">
          <div className="bg-gradient-to-r from-red-500/10 to-amber-500/5 border border-red-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className="text-xl font-bold text-red-400">Contracts Ending Soon</h2>
            </div>
            <p className="text-slate-400 text-sm">
              These contracts are ending — switch now to avoid being moved to a more expensive default tariff.
            </p>
          </div>

          <div className="space-y-6">
            {urgentSwitches.map(({ sub, days, dealCategories }) => {
              const urgency = urgencyLabel(days);
              const matchingDeals = dealCategories.flatMap(dc => DEALS[dc] || []);
              if (matchingDeals.length === 0) return null;

              return (
                <div key={sub.id}>
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">{sub.provider_name}</span>
                      <span className="text-slate-500 text-sm">£{parseFloat(String(sub.amount)).toFixed(2)}/{sub.billing_cycle}</span>
                    </div>
                    <div className={`border rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${urgency.bg}`}>
                      <Clock className={`h-3.5 w-3.5 ${urgency.color}`} />
                      <span className={`text-sm font-semibold ${urgency.color}`}>{urgency.text}</span>
                    </div>
                    {sub.current_tariff && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Tariff: {sub.current_tariff}</span>
                    )}
                    {sub.auto_renews && (
                      <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">Auto-renews</span>
                    )}
                    {sub.early_exit_fee && days > 0 && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Exit fee: £{parseFloat(String(sub.early_exit_fee)).toFixed(0)}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {matchingDeals.map((deal) => (
                      <DealCard key={`urgent-${sub.id}-${deal.id}`} deal={deal} highlight />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Personalised Recommendations — active subscriptions */}
      {activeSwitches.length > 0 && (
        <section className="mb-10">
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-5 w-5 text-amber-400" />
                  <h2 className="text-xl font-bold text-amber-400">Recommended for You</h2>
                </div>
                <p className="text-slate-400 text-sm">
                  Based on your current bills and contracts — here are deals that could save you money.
                </p>
              </div>
              {switchableMonthly > 0 && (
                <div className="text-right shrink-0 ml-4">
                  <div className="text-2xl font-bold text-amber-500">£{switchableMonthly.toFixed(0)}</div>
                  <div className="text-slate-500 text-xs">/month on switchable bills</div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {activeSwitches.map(({ sub, dealCategories }) => {
              const matchingDeals = dealCategories.flatMap(dc => DEALS[dc] || []);
              if (matchingDeals.length === 0) return null;

              return (
                <div key={sub.id}>
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
                      <span className="text-white text-sm font-semibold">{sub.provider_name}</span>
                      <span className="text-slate-500 text-sm">£{parseFloat(String(sub.amount)).toFixed(2)}/{sub.billing_cycle}</span>
                    </div>
                    {sub.contract_end_date && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                        Ends {new Date(sub.contract_end_date).toLocaleDateString('en-GB')}
                      </span>
                    )}
                    {sub.interest_rate && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                        {parseFloat(String(sub.interest_rate)).toFixed(1)}% APR
                      </span>
                    )}
                    {sub.speed_mbps && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                        {sub.speed_mbps}Mbps
                      </span>
                    )}
                    {sub.data_allowance && (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                        {sub.data_allowance}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {matchingDeals.map((deal) => (
                      <DealCard key={`rec-${sub.id}-${deal.id}`} deal={deal} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Other Deals You Might Like */}
      {otherCategories.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-6">
            <Zap className="h-5 w-5 text-slate-400" />
            <h2 className="text-xl font-bold text-white">More Ways to Save</h2>
          </div>
          <div className="space-y-10">
            {otherCategories.map((category) => (
              <div key={category}>
                <h3 className="text-lg font-semibold text-white mb-4">{category}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {(DEALS[category] || []).map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* All Deals — for users with no subscriptions */}
      {subscriptions.length === 0 && (
        <div className="space-y-10">
          {Object.entries(DEALS).map(([category, deals]) => (
            <section key={category}>
              <h2 className="text-xl font-bold text-white mb-4">{category}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
