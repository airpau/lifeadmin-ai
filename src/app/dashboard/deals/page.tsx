'use client';

import { useState, useEffect } from 'react';
import { Tag, Loader2, Clock, AlertTriangle, Zap } from 'lucide-react';
import { capture } from '@/lib/posthog';
import { normaliseMerchantName } from '@/lib/merchant-normalise';

// Awin affiliate ID — update this once Awin approval comes through
const AWIN_AFF_ID = process.env.NEXT_PUBLIC_AWIN_AFF_ID || '2825812';

interface Deal {
  id: string;
  provider: string;
  headline: string;
  saving: string;
  awinMid: string;
  providerUrl: string;
  category: string;
  promoCode?: string;
  awinUrl?: string; // Override generated Awin URL
}

const DEALS: Record<string, Deal[]> = {
  Energy: [
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
    { id: 'lebara5', provider: 'Lebara', headline: 'Use code LEBARA5 for £5 off', saving: 'Save £5 off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html', promoCode: 'LEBARA5', category: 'Mobile' },
    { id: 'lebara10', provider: 'Lebara', headline: 'Use code LEBARA10 for £10 off', saving: 'Save £10 off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html', promoCode: 'LEBARA10', category: 'Mobile' },
    { id: 'lebara-save50', provider: 'Lebara', headline: 'Use code SAVE50 for 50% off', saving: 'Save 50% off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html', promoCode: 'SAVE50', category: 'Mobile' },
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
    { id: 'jet2', provider: 'Jet2.com', headline: 'Cheap flights from UK regional airports', saving: 'Save on flights', awinMid: '18729', providerUrl: 'https://www.jet2.com', category: 'Travel' },
    { id: 'jet2holidays', provider: 'Jet2holidays', headline: 'ATOL-protected package holidays', saving: 'Save on holidays', awinMid: '18730', providerUrl: 'https://www.jet2holidays.com', category: 'Travel' },
    { id: 'gotogate', provider: 'Gotogate', headline: 'Compare flights from 700+ airlines worldwide', saving: 'Find cheapest flights', awinMid: '112834', providerUrl: 'https://www.gotogate.co.uk', category: 'Travel' },
    { id: 'mytrip', provider: 'Mytrip', headline: 'Cheap flights and travel deals worldwide', saving: 'Compare airlines', awinMid: '112832', providerUrl: 'https://www.mytrip.com', category: 'Travel' },
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
  if (days <= 30) return { text: `Ends in ${days} days`, color: 'text-mint-400', bg: 'bg-mint-400/10 border-mint-400/30' };
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
      window.open(deal.awinUrl || buildAwinUrl(deal.awinMid, deal.providerUrl), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={`bg-navy-900 backdrop-blur-sm border rounded-2xl p-6 transition-all flex flex-col gap-4 ${
      highlight ? 'border-mint-400/40 ring-1 ring-mint-400/20' : 'border-navy-700/50'
    } ${!DEALS_LIVE ? 'opacity-60' : 'hover:border-navy-600'}`}>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-white mb-1">{deal.provider}</h3>
        <p className="text-slate-400 text-sm">{deal.headline}</p>
        {deal.promoCode && (
          <p className="text-xs text-green-400 mt-1">Promo code: <span className="font-mono font-bold bg-green-500/10 px-2 py-0.5 rounded">{deal.promoCode}</span> — apply at checkout</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-mint-400 bg-mint-400/10 px-3 py-1 rounded-full">
          {deal.saving}
        </span>
        {DEALS_LIVE ? (
          <a
            href={deal.awinUrl || buildAwinUrl(deal.awinMid, deal.providerUrl)}
            onClick={handleClick}
            className="flex items-center gap-1.5 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap"
          >
            {tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            View Deal →
          </a>
        ) : (
          <span className="bg-navy-700 text-slate-400 font-medium px-4 py-2 rounded-lg text-sm cursor-not-allowed">
            Coming Soon
          </span>
        )}
      </div>
    </div>
  );
}

const CATEGORY_TABS = ['Energy', 'Broadband', 'Mobile', 'Insurance', 'Mortgages', 'Loans', 'Credit Cards', 'Car Finance', 'Travel'];

interface VerifiedDeal {
  id: string;
  provider: string;
  category: string;
  plan_name: string;
  speed_mbps: number | null;
  data_allowance: string | null;
  price_monthly: number;
  price_promotional: number | null;
  promotional_period: string | null;
  contract_length: string | null;
  setup_fee: number;
  uk_minutes: string | null;
  international_minutes: string | null;
  affiliate_url: string;
  last_verified_at: string;
  promo_code: string | null;
  promo_code_discount: string | null;
}

function AffiliatePlanCard({ deal }: { deal: VerifiedDeal }) {
  const [copied, setCopied] = useState(false);
  const [tracking, setTracking] = useState(false);

  const handleClick = async () => {
    setTracking(true);
    try {
      await fetch('/api/affiliate-deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: deal.provider, category: deal.category, deal_id: deal.id, plan_name: deal.plan_name }),
      });
      capture('deal_clicked', { provider: deal.provider, plan: deal.plan_name });
    } catch {}
    setTracking(false);
    window.open(deal.affiliate_url, '_blank', 'noopener,noreferrer');
  };

  const copyPromo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deal.promo_code) {
      navigator.clipboard.writeText(deal.promo_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasPromo = deal.price_promotional != null;

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 hover:border-mint-400/30 transition-all flex flex-col">
      {/* Featured badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] uppercase tracking-wider text-mint-400 font-semibold bg-mint-400/10 px-2 py-0.5 rounded-full">Featured</span>
        <span className="text-slate-600 text-[10px]">{deal.contract_length}</span>
      </div>

      {/* Provider + Plan */}
      <h3 className="text-white font-semibold mb-0.5">{deal.provider}</h3>
      <p className="text-slate-400 text-sm mb-3">{deal.plan_name}</p>

      {/* Price */}
      <div className="mb-3">
        {hasPromo ? (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-mint-400">£{deal.price_promotional}</span>
            <span className="text-slate-500 text-sm line-through">£{deal.price_monthly}</span>
            <span className="text-slate-400 text-xs">/mo</span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">£{deal.price_monthly}</span>
            <span className="text-slate-400 text-xs">/mo</span>
          </div>
        )}
        {deal.promotional_period && (
          <p className="text-mint-400 text-xs mt-1">{deal.promo_code_discount || `Promotional price for ${deal.promotional_period}`}</p>
        )}
      </div>

      {/* Specs */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs text-slate-400">
        {deal.speed_mbps && (
          <span className="bg-navy-800 px-2 py-1 rounded">{deal.speed_mbps} Mbps</span>
        )}
        {deal.data_allowance && (
          <span className="bg-navy-800 px-2 py-1 rounded">{deal.data_allowance}</span>
        )}
        {deal.uk_minutes && (
          <span className="bg-navy-800 px-2 py-1 rounded">{deal.uk_minutes} UK mins</span>
        )}
        {deal.international_minutes && (
          <span className="bg-navy-800 px-2 py-1 rounded">{deal.international_minutes} intl</span>
        )}
        {deal.setup_fee != null && (
          <span className="bg-navy-800 px-2 py-1 rounded">{deal.setup_fee > 0 ? `£${deal.setup_fee} setup` : 'Free setup'}</span>
        )}
      </div>

      {/* Promo code */}
      {deal.promo_code && (
        <button
          onClick={copyPromo}
          className="flex items-center justify-between gap-2 w-full bg-emerald-500/10 border border-dashed border-emerald-500/30 rounded-lg px-3 py-2 mb-3 text-left transition-all hover:bg-emerald-500/15"
        >
          <div>
            <p className="text-[10px] text-emerald-400/70 uppercase tracking-wide">Promo code</p>
            <p className="text-emerald-400 font-mono font-bold text-sm">{deal.promo_code}</p>
          </div>
          <span className="text-emerald-400 text-[10px] font-medium whitespace-nowrap">
            {copied ? 'Copied!' : 'Copy'}
          </span>
        </button>
      )}

      {/* CTA */}
      <button
        onClick={handleClick}
        disabled={tracking}
        className="mt-auto w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-2.5 rounded-lg transition-all text-sm flex items-center justify-center gap-1.5"
      >
        {tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Get Deal →
      </button>
    </div>
  );
}

export default function DealsPage() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [verifiedDeals, setVerifiedDeals] = useState<VerifiedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/subscriptions').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setSubscriptions(data);
      }),
      fetch('/api/affiliate-deals').then(r => r.json()).then(data => {
        setVerifiedDeals(Array.isArray(data) ? data : []);
      }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Build a map of deal category -> matching user subscriptions
  const categoryToUserSubs: Record<string, UserSubscription[]> = {};
  const urgentSubsByCategory: Record<string, Array<{ sub: UserSubscription; days: number }>> = {};

  for (const sub of subscriptions) {
    const dealCats = sub.provider_type
      ? (PROVIDER_TYPE_TO_DEALS[sub.provider_type] || [])
      : (CATEGORY_TO_DEALS[sub.category || ''] || []);

    if (dealCats.length === 0) continue;

    for (const cat of dealCats) {
      if (!categoryToUserSubs[cat]) categoryToUserSubs[cat] = [];
      categoryToUserSubs[cat].push(sub);

      if (sub.contract_end_date) {
        const days = daysUntil(sub.contract_end_date);
        if (days <= 90) {
          if (!urgentSubsByCategory[cat]) urgentSubsByCategory[cat] = [];
          urgentSubsByCategory[cat].push({ sub, days });
        }
      }
    }
  }

  // Sort urgent subs by soonest first within each category
  for (const cat of Object.keys(urgentSubsByCategory)) {
    urgentSubsByCategory[cat].sort((a, b) => a.days - b.days);
  }

  // Collect all urgent categories (deduplicated) for the urgent section
  const urgentCategories = Object.keys(urgentSubsByCategory);

  // Categories to display based on filter
  const visibleCategories = activeCategory
    ? CATEGORY_TABS.filter(c => c === activeCategory)
    : CATEGORY_TABS;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Find Better Deals</h1>
        <p className="text-slate-400">Personalised savings based on your contracts and bills.</p>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
            activeCategory === null
              ? 'bg-mint-400 text-navy-950'
              : 'bg-navy-800 text-slate-300 hover:bg-navy-700'
          }`}
        >
          All
        </button>
        {CATEGORY_TABS.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeCategory === cat
                ? 'bg-mint-400 text-navy-950'
                : 'bg-navy-800 text-slate-300 hover:bg-navy-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Contracts Ending Soon -- URGENT section */}
      {urgentCategories.length > 0 && (activeCategory === null || urgentSubsByCategory[activeCategory]) && (
        <section className="mb-10">
          <div className="bg-gradient-to-r from-red-500/10 to-amber-500/5 border border-red-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className="text-xl font-bold text-red-400">Contracts Ending Soon</h2>
            </div>
            <p className="text-slate-400 text-sm">
              These contracts are ending - switch now to avoid being moved to a more expensive default tariff.
            </p>
          </div>

          <div className="space-y-6">
            {(activeCategory ? [activeCategory] : urgentCategories).map((cat) => {
              const urgentSubs = urgentSubsByCategory[cat];
              if (!urgentSubs || urgentSubs.length === 0) return null;
              const deals = DEALS[cat] || [];
              if (deals.length === 0) return null;

              return (
                <div key={`urgent-${cat}`}>
                  <h3 className="text-lg font-semibold text-white mb-2">{cat} Deals</h3>
                  {urgentSubs.map(({ sub, days }) => {
                    const urgency = urgencyLabel(days);
                    return (
                      <div key={`urgent-note-${sub.id}`} className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="bg-navy-800 border border-navy-700/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                          <span className="text-white text-sm font-semibold">{normaliseMerchantName(sub.provider_name)}</span>
                          <span className="text-slate-500 text-sm">£{parseFloat(String(sub.amount)).toFixed(2)}/{sub.billing_cycle}</span>
                        </div>
                        <div className={`border rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${urgency.bg}`}>
                          <Clock className={`h-3.5 w-3.5 ${urgency.color}`} />
                          <span className={`text-sm font-semibold ${urgency.color}`}>{urgency.text}</span>
                        </div>
                        {sub.auto_renews && (
                          <span className="text-xs text-mint-400 bg-mint-400/10 px-2 py-1 rounded">Auto-renews</span>
                        )}
                        {sub.early_exit_fee && days > 0 && (
                          <span className="text-xs text-slate-500 bg-navy-800 px-2 py-1 rounded">Exit fee: £{parseFloat(String(sub.early_exit_fee)).toFixed(0)}</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
                    {deals.map((deal) => (
                      <DealCard key={`urgent-${deal.id}`} deal={deal} highlight />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Deal categories */}
      <div className="space-y-10">
        {visibleCategories.map((category) => {
          const catLower = category.toLowerCase();
          const affiliatePlans = verifiedDeals
            .filter(d => d.category === catLower)
            .sort((a, b) => (a.price_promotional || a.price_monthly) - (b.price_promotional || b.price_monthly));
          // Remove hardcoded cards for providers that have affiliate plans
          const affiliateProviderNames = new Set(affiliatePlans.map(d => d.provider.toLowerCase()));
          const genericDeals = (DEALS[category] || []).filter(d => !affiliateProviderNames.has(d.provider.toLowerCase()));
          if (affiliatePlans.length === 0 && genericDeals.length === 0) return null;

          // Find user subscriptions matching this category
          const matchingSubs = categoryToUserSubs[category] || [];

          return (
            <section key={category}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-mint-400" />
                <h2 className="text-xl font-bold text-white">{category} Deals</h2>
              </div>

              {matchingSubs.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {matchingSubs.map((sub) => (
                    <div key={`ctx-${sub.id}-${category}`} className="bg-navy-800/50 border border-navy-700/50 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm">
                      <span className="text-slate-400">Currently paying</span>
                      <span className="text-white font-semibold">£{parseFloat(String(sub.amount)).toFixed(2)}/{sub.billing_cycle}</span>
                      <span className="text-slate-400">to</span>
                      <span className="text-white font-semibold">{normaliseMerchantName(sub.provider_name)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Affiliate plan cards — individual plans, shown first */}
              {affiliatePlans.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
                  {affiliatePlans.map((plan) => (
                    <AffiliatePlanCard key={plan.id} deal={plan} />
                  ))}
                </div>
              )}

              {/* Generic provider cards */}
              {genericDeals.length > 0 && (
                <>
                  {affiliatePlans.length > 0 && (
                    <p className="text-slate-500 text-xs mb-3 mt-2">More {category.toLowerCase()} deals</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {genericDeals.map((deal) => (
                      <DealCard key={deal.id} deal={deal} />
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {/* Affiliate disclosure */}
      <div className="flex items-start gap-3 bg-navy-800/40 border border-navy-700/50 rounded-xl px-4 py-3 mt-10">
        <Tag className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Affiliate disclosure:</span> We may earn a commission when you switch via our links. This never affects the price you pay.
        </p>
      </div>
    </div>
  );
}
