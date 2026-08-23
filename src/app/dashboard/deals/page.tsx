'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Tag, Loader2, Clock, AlertTriangle, Zap, Trophy, CheckCircle2, Info, X } from 'lucide-react';
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
  /**
   * The pill on the card.
   *
   * MUST be a fact, not a projection. Until 2026-08-21 most of these
   * read "Save up to £150/yr" and similar — string literals typed into
   * this file, with no source, no date and nothing computing them,
   * rendered under a header promising "personalised savings based on
   * your contracts and bills".
   *
   * A real saving is only knowable by comparing a real deal price
   * against what this particular user actually pays. That happens in
   * AffiliatePlanCard, from `affiliate_deals` and the user's own
   * `subscriptions.amount`. It does NOT happen here, so this string
   * must never claim one. "Compare deals", "From £6.50/mo" and a promo
   * code are all fine. "Save up to £X" is not.
   */
  promoCode?: string;
  awinUrl?: string; // Override generated Awin URL
  featured?: boolean; // Show "New Deal" badge and pin to top
}

const DEALS: Record<string, Deal[]> = {
  Energy: [
    { id: 'ovo-energy', provider: 'OVO Energy', headline: 'Fixed rate - lock in your price', saving: 'Compare deals', awinMid: '5318', providerUrl: 'https://www.ovoenergy.com', category: 'Energy' },
    { id: 'eon-next', provider: 'E.ON Next', headline: 'Next Drive tariff for EV owners', saving: 'Compare deals', awinMid: '54765', providerUrl: 'https://www.eonenergy.com', category: 'Energy' },
    { id: 'edf-energy', provider: 'EDF', headline: 'Fixed price tariffs - price certainty', saving: 'Compare deals', awinMid: '1887', providerUrl: 'https://www.edfenergy.com', category: 'Energy' },
    { id: 'msm-energy', provider: 'MoneySuperMarket', headline: 'Compare energy tariffs from all suppliers', saving: 'Compare deals', awinMid: '22713', providerUrl: 'https://www.moneysupermarket.com/gas-and-electricity/', category: 'Energy' },
  ],
  Broadband: [
    { id: 'bt-broadband', provider: 'BT', headline: 'Full Fibre 500 - superfast speeds', saving: 'Compare deals', awinMid: '3041', providerUrl: 'https://www.bt.com/broadband', category: 'Broadband' },
    { id: 'sky-broadband', provider: 'Sky', headline: 'Ultrafast broadband + streaming', saving: 'Compare deals', awinMid: '11005', providerUrl: 'https://www.sky.com/shop/broadband', category: 'Broadband' },
    { id: 'virgin-media', provider: 'Virgin Media', headline: "Gig1 - UK's fastest widely available broadband", saving: 'Compare deals', awinMid: '6399', providerUrl: 'https://www.virginmedia.com', category: 'Broadband' },
    { id: 'ee-broadband', provider: 'EE', headline: 'Full Fibre with smart hub included', saving: 'Compare deals', awinMid: '3516', providerUrl: 'https://shop.ee.co.uk/broadband', category: 'Broadband' },
    { id: 'plusnet', provider: 'Plusnet', headline: 'Award-winning broadband from Yorkshire', saving: 'Compare deals', awinMid: '2973', providerUrl: 'https://www.plus.net', category: 'Broadband' },
    { id: 'talktalk', provider: 'TalkTalk', headline: 'Affordable fibre broadband', saving: 'Compare deals', awinMid: '3674', providerUrl: 'https://www.talktalk.co.uk', category: 'Broadband' },
    { id: 'hyperoptic', provider: 'Hyperoptic', headline: '1Gbps full fibre - no speed caps', saving: 'Compare deals', awinMid: '5737', providerUrl: 'https://www.hyperoptic.com', category: 'Broadband' },
    { id: 'community-fibre', provider: 'Community Fibre', headline: 'London full fibre - ultrafast speeds', saving: 'Compare deals', awinMid: '19595', providerUrl: 'https://communityfibre.co.uk', category: 'Broadband' },
    { id: 'msm-broadband', provider: 'MoneySuperMarket', headline: 'Compare broadband deals from all providers', saving: 'Compare deals', awinMid: '25756', providerUrl: 'https://www.moneysupermarket.com/broadband/', category: 'Broadband' },
    { id: 'onestream', provider: 'Onestream', headline: 'Simple, affordable full fibre broadband', saving: 'Compare deals', awinMid: '23296', providerUrl: 'https://www.onestream.co.uk', category: 'Broadband' },
    { id: 'broadband-genie', provider: 'Broadband Genie', headline: 'Independent broadband comparison', saving: 'Find cheapest deals', awinMid: '12213', providerUrl: 'https://www.broadbandgenie.co.uk', category: 'Broadband' },
  ],
  Insurance: [
    { id: 'compare-the-market', provider: 'Compare the Market', headline: 'Compare 100+ insurers in minutes', saving: 'Compare deals', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com', category: 'Insurance' },
    { id: 'moneysupermarket', provider: 'MoneySuperMarket', headline: 'Car, home & life insurance', saving: 'Compare deals', awinMid: '12049', providerUrl: 'https://www.moneysupermarket.com/car-insurance/', category: 'Insurance' },
    { id: 'gocompare-car', provider: 'GoCompare Car', headline: 'Compare car insurance quotes', saving: 'Compare deals', awinMid: '117439', providerUrl: 'https://www.gocompare.com/car-insurance/', category: 'Insurance' },
    { id: 'gocompare-home', provider: 'GoCompare Home', headline: 'Compare home insurance quotes', saving: 'Compare deals', awinMid: '117441', providerUrl: 'https://www.gocompare.com/home-insurance/', category: 'Insurance' },
    { id: 'rac-breakdown', provider: 'RAC', headline: 'Breakdown cover from £6.50/mo', saving: 'Roadside peace of mind', awinMid: '3790', providerUrl: 'https://www.rac.co.uk/breakdown-cover', category: 'Insurance' },
    { id: 'aa-breakdown', provider: 'The AA', headline: 'UK breakdown cover - roadside assistance', saving: 'Cover from £4/mo', awinMid: '3932', providerUrl: 'https://www.theaa.com/breakdown-cover', category: 'Insurance' },
  ],
  Mobile: [
    { id: 'giffgaff', provider: 'giffgaff', headline: 'Flexible SIM plans - no contract required', saving: 'Compare deals', awinMid: '3599', providerUrl: 'https://www.giffgaff.com', awinUrl: 'https://www.awin1.com/cread.php?awinmid=3599&awinaffid=2825812&ued=https%3A%2F%2Fwww.giffgaff.com', category: 'Mobile', featured: true },
    { id: 'id-mobile', provider: 'iD Mobile', headline: 'SIM-only from £6/mo', saving: 'Compare deals', awinMid: '6366', providerUrl: 'https://www.idmobile.co.uk', category: 'Mobile' },
    { id: 'smarty', provider: 'SMARTY', headline: 'Fair data - unused data rolled over', saving: 'Compare deals', awinMid: '10933', providerUrl: 'https://smarty.co.uk', category: 'Mobile' },
    { id: 'lebara5', provider: 'Lebara', headline: 'Use code LEBARA5 for £5 off', saving: 'Save £5 off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html', promoCode: 'LEBARA5', category: 'Mobile' },
    { id: 'lebara10', provider: 'Lebara', headline: 'Use code LEBARA10 for £10 off', saving: 'Save £10 off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html', promoCode: 'LEBARA10', category: 'Mobile' },
    { id: 'lebara-save50', provider: 'Lebara', headline: 'Use code SAVE50 for 50% off', saving: 'Save 50% off your first month', awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', awinUrl: 'https://www.awin1.com/cread.php?awinmid=30681&awinaffid=2825812&ued=https%3A%2F%2Fwww.lebara.co.uk%2Fen%2Fbest-sim-only-deals.html', promoCode: 'SAVE50', category: 'Mobile' },
    { id: 'ee-mobile', provider: 'EE', headline: "UK's largest 5G network", saving: 'Compare deals', awinMid: '31423', providerUrl: 'https://shop.ee.co.uk/sim-only', category: 'Mobile' },
    { id: 'tesco-mobile', provider: 'Tesco Mobile', headline: 'Clubcard prices on SIM plans', saving: 'Compare deals', awinMid: '101917', providerUrl: 'https://www.tescomobile.com', category: 'Mobile' },
    { id: 'voxi', provider: 'VOXI', headline: 'Endless social media data included', saving: 'Compare deals', awinMid: '10951', providerUrl: 'https://www.voxi.co.uk', category: 'Mobile' },
    { id: 'talkmobile', provider: 'Talkmobile', headline: 'Low-cost SIM plans on the Vodafone network', saving: 'Compare deals', awinMid: '2351', providerUrl: 'https://www.talkmobile.co.uk', category: 'Mobile' },
    { id: 'asda-mobile', provider: 'Asda Mobile', headline: 'Budget-friendly SIM bundles', saving: 'Compare deals', awinMid: '6250', providerUrl: 'https://mobile.asda.com/bundles', category: 'Mobile' },
    { id: 'honest-mobile', provider: 'Honest Mobile', headline: 'Ethical mobile - plants trees with every plan', saving: 'Compare deals', awinMid: '20890', providerUrl: 'https://www.honestmobile.co.uk', category: 'Mobile' },
    { id: 'ee-payg', provider: 'EE Pay As You Go', headline: 'UK largest 5G network - no contract needed', saving: 'Flexible top-ups', awinMid: '118459', providerUrl: 'https://shop.ee.co.uk/pay-as-you-go', category: 'Mobile' },
    { id: 'o2-mobile', provider: 'O2', headline: 'Priority rewards and flexible plans', saving: 'Compare deals', awinMid: '3235', providerUrl: 'https://www.o2.co.uk', category: 'Mobile' },
    { id: 'vodafone', provider: 'Vodafone', headline: 'Award-winning 5G network with extras', saving: 'Compare deals', awinMid: '1257', providerUrl: 'https://www.vodafone.co.uk', category: 'Mobile' },
    { id: 'three-mobile', provider: 'Three', headline: '5G at no extra cost on all plans', saving: 'Compare deals', awinMid: '10210', providerUrl: 'https://www.three.co.uk', category: 'Mobile' },
  ],
  Mortgages: [
    { id: 'habito', provider: 'Habito', headline: 'Free online mortgage broker - compare 90+ lenders', saving: 'Compare deals', awinMid: '15441', providerUrl: 'https://www.habito.com', category: 'Mortgages' },
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
  Water: [],
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
  water: ['Water'],
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
  water: ['Water'],
};

/** Shorten badge text to fit neatly in a compact pill */
function shortenBadge(text: string): string {
  return text
    .replace(/^Save up to /i, 'Save ')
    .replace(/^Up to /i, '')
    .replace(/ off your first month$/i, ' off')
    .replace(/^Compare energy tariffs from all suppliers$/i, 'Compare tariffs')
    .replace(/^Compare broadband deals from all providers$/i, 'Compare deals')
    .replace(/^Reduce monthly payments$/i, 'Reduce payments')
    .replace(/^Roadside peace of mind$/i, 'From £6.50/mo')
    .replace(/^Find cheapest deals$/i, 'Compare deals')
    .replace(/^Find cheapest flights$/i, 'Compare flights')
    .replace(/^0% balance transfer deals$/i, '0% transfers')
    .replace(/^Save on car finance$/i, 'Save on finance')
    .replace(/^Compare airlines$/i, 'Compare')
    .replace(/ on completion$/i, '')
    .replace(/^17% insurance savings$/i, 'Save 17%')
    .replace(/^Rates from /i, 'From ');
}

// Categories that have real verified affiliate deals in the database
const CATEGORIES_WITH_VERIFIED_DEALS = new Set(['broadband', 'mobile', 'energy']);

// Categories that should never show deal suggestions (non-switchable or no real deals)
const EXCLUDED_DEAL_CATEGORIES = new Set([
  'mortgage', 'mortgages', 'loan', 'loans', 'council_tax', 'tax', 'fee', 'parking',
  'credit_card', 'credit cards', 'car_finance', 'car finance',
]);

// Subcategory display names for loans
const LOAN_SUBCATEGORY_LABELS: Record<string, string> = {
  car_finance: 'Car Finance',
  government_loan: 'Government Loan',
  personal_loan: 'Personal Loan',
  credit_card: 'Credit Card',
  business_loan: 'Business Loan',
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
  subcategory: string | null;
  annual_cost: number | null;
  interest_rate: number | null;
  remaining_balance: number | null;
  monthly_payment: number | null;
  current_tariff: string | null;
  auto_renews: boolean | null;
  early_exit_fee: number | null;
  speed_mbps: number | null;
  data_allowance: string | null;
  status: string | null;
  dismissed_at: string | null;
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
  if (days <= 30) return { text: `Ends in ${days} days`, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  if (days <= 90) return { text: `Ends in ${Math.ceil(days / 7)} weeks`, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' };
  return { text: `Ends in ${Math.ceil(days / 30)} months`, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-500/30' };
}

// Deals are coming soon. Check if Awin publisher ID is configured.
const DEALS_LIVE = !!AWIN_AFF_ID && AWIN_AFF_ID !== '!!!REPLACE_WITH_AWIN_ID!!!';

function DealCard({ deal, highlight, onDismiss }: { deal: Deal; highlight?: boolean; onDismiss?: () => void }) {
  const [tracking, setTracking] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!DEALS_LIVE) { e.preventDefault(); return; }
    // Let the native <a> handle navigation (works on iOS Safari)
    // Track click in background — don't block navigation
    fetch('/api/deals/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: deal.provider,
        category: deal.category,
        deal_id: deal.id,
        awin_mid: deal.awinMid,
      }),
    }).catch(() => {});
    // P5-5 — emit affiliate_click event for the intelligence layer
    // so the Awin postback can attach the conversion outcome. Fire-
    // and-forget; existing analytics path stays untouched.
    fetch('/api/affiliate/awin/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deal_id: deal.id,
        merchant: deal.provider,
        category: deal.category,
        awin_advertiser_id: Number(deal.awinMid) || null,
        target_url: deal.awinUrl || buildAwinUrl(deal.awinMid, deal.providerUrl),
      }),
    }).catch(() => {});
    capture('deal_clicked', { provider: deal.provider, category: deal.category });
  };

  return (
    <div className={`group relative bg-white backdrop-blur-sm border rounded-2xl p-5 transition-all flex flex-col overflow-hidden ${
      highlight || deal.featured ? 'border-amber-300/40 ring-1 ring-amber-400/20' : 'border-slate-200/50'
    } ${!DEALS_LIVE ? 'opacity-60' : 'hover:border-slate-200'}`}>
      {deal.featured && (
        <span className="absolute top-3 left-3 text-[10px] font-bold text-slate-900 bg-amber-500 px-2 py-0.5 rounded-full uppercase tracking-wide">
          New Deal
        </span>
      )}
      {onDismiss && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute top-3 right-3 p-1.5 bg-slate-100 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          title="Not interested"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {/* Body — grows to fill, pushes footer to bottom */}
      <div className={`flex-1 min-w-0 mb-3 pr-6 ${deal.featured ? 'pt-5' : ''}`}>
        <h3 className="text-base font-semibold text-slate-900 mb-1 truncate">{deal.provider}</h3>
        <p className="text-slate-600 text-sm line-clamp-2">{deal.headline}</p>
        {deal.promoCode && (
          <p className="text-xs text-green-400 mt-1.5">Promo: <span className="font-mono font-bold bg-green-500/10 px-1.5 py-0.5 rounded">{deal.promoCode}</span></p>
        )}
      </div>
      {/* Footer — pinned to bottom */}
      <div className="flex items-center gap-2 mt-auto flex-shrink-0">
        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full whitespace-nowrap">
          {shortenBadge(deal.saving)}
        </span>
        {DEALS_LIVE ? (
          <a
            href={deal.awinUrl || buildAwinUrl(deal.awinMid, deal.providerUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-3 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap flex-shrink-0 ml-auto"
          >
            View Deal →
          </a>
        ) : (
          <span className="bg-slate-50 text-slate-600 font-medium px-3 py-1.5 rounded-lg text-xs cursor-not-allowed flex-shrink-0 ml-auto">
            Coming Soon
          </span>
        )}
      </div>
    </div>
  );
}

const CATEGORY_TABS = ['Energy', 'Broadband', 'Mobile', 'Insurance', 'Travel', 'Water'];

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
  is_active: boolean;
  promo_code: string | null;
  promo_code_discount: string | null;
  /** 'manual' means a human entered or confirmed this price. Anything
   *  else came from the LLM price-check cron. Drives whether the card
   *  may say "Verified" — see freshnessIndicator. */
  price_scan_source: string | null;
  /** 'fetched' means the price was read off the advertiser's own page
   *  and a verbatim excerpt was checked against it. That, not
   *  price_scan_source, is what makes a price defensible. */
  price_provenance: string | null;
  /** The Awin advertiser this deal's link actually pays through. Often
   *  NOT the provider named on the card: eight broadband deals route via
   *  Broadband Genie (12213). See routedVia below. */
  programme_id: number | null;
}

/** Parse data allowance string to numeric GB for comparison */
function parseDataAllowanceGB(da: string | null): number {
  if (!da) return 0;
  if (/unlimited/i.test(da)) return Infinity;
  const m = da.match(/([\d.]+)\s*(gb|tb)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  return m[2].toLowerCase() === 'tb' ? val * 1024 : val;
}

/**
 * Freshness pill.
 *
 * "Verified" now means a human checked it, not that a cron ran.
 *
 * The price-check cron asks an LLM what a deal currently costs, writes
 * the answer to `price_monthly`, and stamps `last_verified_at` — every
 * run, including when the model self-reports low confidence. This badge
 * was driven purely by that timestamp, so a low-confidence guess
 * rendered to the user as a green "Verified this week".
 *
 * `price_scan_source` distinguishes them: 'manual' is a human-entered
 * or human-confirmed price. Anything else is research, and says so.
 */
function freshnessIndicator(
  lastVerified: string | null,
  provenance?: string | null,
): { text: string; color: string; bg: string } | null {
  // No verification timestamp used to render no badge at all, which
  // read as a clean, confident price. It is the opposite: nothing has
  // ever checked it. Say so.
  if (!lastVerified) {
    return { text: 'Price not checked', color: 'text-slate-500', bg: 'bg-slate-500/10' };
  }
  const days = Math.floor((Date.now() - new Date(lastVerified).getTime()) / (1000 * 60 * 60 * 24));
  if (days > 30) {
    return { text: 'Price may have changed', color: 'text-orange-600', bg: 'bg-orange-500/10' };
  }
  // 'fetched' is the only provenance that earns a green badge: the
  // price was read off the advertiser's own page and a verbatim excerpt
  // verified against it. Keying this off price_scan_source instead meant
  // genuinely fetched Virgin Media and TalkTalk prices still displayed
  // "Check price on site", because a later LLM pass had overwritten the
  // scan-source label without touching the provenance.
  if (provenance === 'fetched') {
    return days <= 7
      ? { text: 'Verified this week', color: 'text-green-400', bg: 'bg-green-500/10' }
      : { text: 'Verified', color: 'text-green-400', bg: 'bg-green-500/10' };
  }
  // Researched, not verified. Say which.
  return { text: 'Check price on site', color: 'text-slate-600', bg: 'bg-slate-500/10' };
}

/**
 * The comparison site a deal routes through, or null when the link goes
 * to the provider itself.
 *
 * A card headed "BT" whose link lands on a comparison site is not a lie,
 * but it is a surprise, and a surprised user hits back before the
 * cookie ever earns anything. Derived by comparing the deal's Awin
 * programme name against the provider name rather than hardcoding
 * merchant ids, so any comparison partner we join later is labelled
 * automatically.
 */
function routedVia(
  programmeId: number | null | undefined,
  provider: string,
  programmeNames: Record<string, string>,
): string | null {
  if (programmeId == null) return null;
  const programme = programmeNames[String(programmeId)];
  if (!programme) return null;
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const p = norm(programme);
  const d = norm(provider);
  // "TalkTalk Phone and Broadband" is the same advertiser as "TalkTalk".
  if (p.includes(d) || d.includes(p)) return null;
  return programme;
}

interface AffiliatePlanCardProps {
  deal: VerifiedDeal;
  savingsMonthly?: number;
  savingsYearly?: number;
  userProvider?: string;
  userSpend?: number;
  onDismiss?: () => void;
  /** Comparison site this deal routes through, if any. */
  via?: string | null;
}

function AffiliatePlanCard({ deal, savingsMonthly, savingsYearly, userProvider, userSpend, onDismiss, via }: AffiliatePlanCardProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    // Track in background — don't block navigation (iOS Safari blocks async window.open)
    fetch('/api/affiliate-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: deal.provider, category: deal.category, deal_id: deal.id, plan_name: deal.plan_name }),
    }).catch(() => {});
    // P5-5 — emit affiliate_click event for the intelligence layer so
    // the Awin postback can attach the conversion outcome.
    fetch('/api/affiliate/awin/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deal_id: deal.id,
        merchant: deal.provider,
        category: deal.category,
        target_url: deal.affiliate_url,
      }),
    }).catch(() => {});
    capture('deal_clicked', { provider: deal.provider, plan: deal.plan_name });
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
  // A comparison-routed card must not assert a per-provider price.
  //
  // The only price source we have for these is the comparison page
  // itself, which lists dozens of providers at once. That is precisely
  // how one Broadband Genie listing at £30.99 ended up stamped on all
  // nine providers sharing its programme, Community Fibre included,
  // whose real entry price is nearer £17. The prices survived the
  // revert in a different column. Rather than keep chasing columns, a
  // routed card offers the comparison and states no number.
  const freshness = via ? null : freshnessIndicator(deal.last_verified_at, deal.price_provenance);

  // Build headline from plan specs
  const specs: string[] = [];
  if (deal.speed_mbps) specs.push(`${deal.speed_mbps} Mbps`);
  if (deal.data_allowance) specs.push(deal.data_allowance);
  if (deal.uk_minutes) specs.push(`${deal.uk_minutes} UK mins`);
  if (deal.contract_length) specs.push(deal.contract_length);
  if (deal.setup_fee != null) specs.push(deal.setup_fee > 0 ? `£${deal.setup_fee} setup` : 'Free setup');
  const headline = specs.join(' · ');

  // Build saving text
  const saving = via
    ? 'Compare prices'
    : hasPromo
      ? `From £${deal.price_promotional}/mo`
      : `£${deal.price_monthly}/mo`;

  const hasSavingsData =
    !via && savingsMonthly !== undefined && userSpend !== undefined && userSpend > 0;
  const isSaving = hasSavingsData && savingsMonthly! > 0;

  return (
    <div className="group relative bg-white backdrop-blur-sm border border-slate-200/50 rounded-2xl p-5 transition-all flex flex-col overflow-hidden hover:border-slate-200">
      {onDismiss && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="absolute top-3 right-3 p-1.5 bg-slate-100 hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Not interested"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {/* Body — identical to DealCard */}
      <div className="flex-1 min-w-0 mb-3 pr-6">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            {/* Provider omitted: the panel header above already names
              * it, and repeating it produced "Sky Sky Broadband
              * Essential" and "Virgin Media Virgin Media M125". */}
            <h3 className="text-base font-semibold text-slate-900 truncate">
              {via ? `${deal.provider} ${deal.plan_name}` : deal.plan_name}
            </h3>
          </div>
          {freshness && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${freshness.color} ${freshness.bg}`}>
              {freshness.text}
            </span>
          )}
        </div>
        <p className="text-slate-600 text-sm line-clamp-2">{headline}</p>
        {hasPromo && deal.promotional_period && (
          <p className="text-xs text-emerald-600 mt-1">{deal.promo_code_discount || `Half price for ${deal.promotional_period}`}</p>
        )}
        {deal.promo_code && (
          <button onClick={copyPromo} className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-dashed border-emerald-500/30 px-2 py-0.5 rounded transition-all hover:bg-emerald-500/15">
            <span className="font-mono font-bold">{deal.promo_code}</span>
            <span className="text-[10px]">{copied ? 'Copied!' : '— tap to copy'}</span>
          </button>
        )}

        {/* Personalised savings badge */}
        {hasSavingsData && (
          <div className={`mt-2 text-xs px-2 py-1 rounded-lg inline-flex items-center gap-1 ${
            isSaving
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}>
            {isSaving ? (
              <>Save £{savingsMonthly!.toFixed(2)}/mo <span className="text-[10px] text-green-400/70">(£{savingsYearly!.toFixed(0)}/yr vs your {userProvider} plan)</span></>
            ) : (
              <>£{Math.abs(savingsMonthly!).toFixed(2)}/mo more than your current plan</>
            )}
          </div>
        )}
      </div>
      {/* Footer — pinned to bottom, identical to DealCard */}
      <div className="flex items-center gap-2 mt-auto flex-shrink-0">
        <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full whitespace-nowrap">
          {saving}
        </span>
        <a
          href={deal.affiliate_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-3 py-1.5 rounded-lg transition-all text-xs whitespace-nowrap flex-shrink-0 ml-auto"
        >
          {via ? `Compare on ${via} →` : 'View Deal →'}
        </a>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [verifiedDeals, setVerifiedDeals] = useState<VerifiedDeal[]>([]);
  // Awin advertiser ids we have actually joined. `null` while loading,
  // so the catalogue below renders nothing rather than flashing deals
  // we may be about to hide.
  const [joinedMerchantIds, setJoinedMerchantIds] = useState<Set<string> | null>(null);
  // advertiser id -> programme name, so a card can say which comparison
  // site it routes through instead of implying a direct provider link.
  const [programmeNames, setProgrammeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [dismissedDeals, setDismissedDeals] = useState<Set<string>>(new Set());

  // Which advertisers may legally be shown. Synced daily from the Awin
  // API into affiliate_programmes; see /api/affiliate-programmes.
  useEffect(() => {
    let alive = true;
    fetch('/api/affiliate-programmes')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setJoinedMerchantIds(new Set((d.joined ?? []).map((n: number) => String(n))));
        setProgrammeNames(d.names ?? {});
      })
      .catch(() => {
        // Fail closed: an unknown list hides the hardcoded catalogue.
        if (alive) setJoinedMerchantIds(new Set());
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/subscriptions').then(r => r.json()).then(data => {
        if (Array.isArray(data)) {
          // Filter out dismissed and cancelled subscriptions
          // Keep subs with category, provider_type, OR a recognisable provider name
          const energyBroadbandMobileKeywords = [
            'british gas', 'octopus', 'ovo', 'edf', 'eon next', 'e.on', 'sse', 'bulb',
            'shell energy', 'scottish power', 'utilita',
            'bt', 'sky broadband', 'virgin media', 'plusnet', 'talktalk',
            'hyperoptic', 'community fibre', 'onestream', 'ee broadband',
            'vodafone', 'three', 'o2', 'giffgaff', 'smarty', 'lebara',
            'id mobile', 'voxi', 'tesco mobile', 'ee',
          ];
          const filtered = data.filter((s: any) => {
            if (s.status === 'cancelled' || s.dismissed_at) return false;
            if (s.category || s.provider_type) return true;
            // Fallback: include if provider name matches known energy/broadband/mobile providers
            const name = (s.provider_name || '').toLowerCase();
            return energyBroadbandMobileKeywords.some(kw => name.includes(kw));
          });
          setSubscriptions(filtered);
        }
      }),
      fetch('/api/affiliate-deals').then(r => r.json()).then(data => {
        setVerifiedDeals(Array.isArray(data) ? data : []);
      }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Build a map of deal category -> matching user subscriptions
  const categoryToUserSubs: Record<string, UserSubscription[]> = {};
  const urgentSubsByCategory: Record<string, Array<{ sub: UserSubscription; days: number }>> = {};

  // Provider name keywords to infer deal category when provider_type and category are missing
  const PROVIDER_NAME_TO_DEALS: Record<string, string[]> = {
    'british gas': ['Energy'], 'octopus': ['Energy'], 'ovo': ['Energy'], 'edf': ['Energy'],
    'e.on': ['Energy'], 'eon next': ['Energy'], 'sse': ['Energy'], 'bulb': ['Energy'],
    'shell energy': ['Energy'], 'scottish power': ['Energy'], 'utilita': ['Energy'],
    'bt': ['Broadband'], 'sky broadband': ['Broadband'], 'virgin media': ['Broadband'],
    'plusnet': ['Broadband'], 'talktalk': ['Broadband'], 'hyperoptic': ['Broadband'],
    'community fibre': ['Broadband'], 'onestream': ['Broadband'], 'ee broadband': ['Broadband'],
    'vodafone': ['Mobile'], 'three': ['Mobile'], 'o2': ['Mobile'], 'giffgaff': ['Mobile'],
    'smarty': ['Mobile'], 'lebara': ['Mobile'], 'id mobile': ['Mobile'], 'voxi': ['Mobile'],
    'tesco mobile': ['Mobile'], 'ee': ['Mobile'],
  };

  function inferDealCatsFromName(providerName: string): string[] {
    const name = providerName.toLowerCase();
    for (const [keyword, cats] of Object.entries(PROVIDER_NAME_TO_DEALS)) {
      if (name.includes(keyword)) return cats;
    }
    return [];
  }

  for (const sub of subscriptions) {
    // Skip dismissed or cancelled
    if (sub.status === 'cancelled' || sub.dismissed_at) continue;

    // Skip excluded categories (mortgages, loans, council_tax, etc.)
    const subCatLower = (sub.category || sub.provider_type || '').toLowerCase();
    if (subCatLower && EXCLUDED_DEAL_CATEGORIES.has(subCatLower)) continue;

    let dealCats: string[] = [];
    if (sub.provider_type) {
      dealCats = PROVIDER_TYPE_TO_DEALS[sub.provider_type] || [];
    }
    if (dealCats.length === 0 && sub.category) {
      dealCats = CATEGORY_TO_DEALS[sub.category] || [];
    }
    // Fallback: infer from provider name for energy/broadband/mobile
    if (dealCats.length === 0) {
      dealCats = inferDealCatsFromName(sub.provider_name);
    }

    if (dealCats.length === 0) continue;

    // Filter out deal categories that are excluded
    const filteredDealCats = dealCats.filter(c => !EXCLUDED_DEAL_CATEGORIES.has(c.toLowerCase()));
    if (filteredDealCats.length === 0) continue;

    for (const cat of filteredDealCats) {
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

  // Compute per-category user spend (highest monthly amount) for savings comparison
  const categoryUserSpend: Record<string, { amount: number; provider: string; speedMbps: number; dataAllowanceGB: number }> = {};
  for (const [cat, subs] of Object.entries(categoryToUserSubs)) {
    let highest: { amount: number; provider: string; speedMbps: number; dataAllowanceGB: number } | null = null;
    for (const sub of subs) {
      let monthly = parseFloat(String(sub.amount)) || 0;
      if (sub.billing_cycle === 'yearly') monthly /= 12;
      else if (sub.billing_cycle === 'quarterly') monthly /= 3;
      if (!highest || monthly > highest.amount) {
        highest = {
          amount: monthly,
          provider: normaliseMerchantName(sub.provider_name),
          speedMbps: sub.speed_mbps || 0,
          dataAllowanceGB: parseDataAllowanceGB(sub.data_allowance),
        };
      }
    }
    if (highest && highest.amount > 0) categoryUserSpend[cat] = highest;
  }

  // Find "Best Deal For You" per category from database deals
  function findBestDeal(category: string, deals: VerifiedDeal[]): { deal: VerifiedDeal; savingsYearly: number; savingsMonthly: number } | null {
    const userSpend = categoryUserSpend[category];
    if (!userSpend || userSpend.amount <= 0 || deals.length === 0) return null;

    // Don't show deal suggestions for excluded categories
    if (EXCLUDED_DEAL_CATEGORIES.has(category.toLowerCase())) return null;

    let best: { deal: VerifiedDeal; savingsYearly: number; savingsMonthly: number } | null = null;
    for (const d of deals) {
      // Comparison-routed deals carry no price we can defend, so they
      // cannot headline a saving. See the note in AffiliatePlanCard.
      if (routedVia(d.programme_id, d.provider, programmeNames)) continue;
      const effectivePrice = d.price_promotional ?? d.price_monthly;
      const savingsMonthly = userSpend.amount - effectivePrice;
      if (savingsMonthly <= 0) continue;

      // Cap: if savings > 80% of current price, skip (unrealistic)
      if (savingsMonthly > userSpend.amount * 0.8) continue;

      // For broadband: must have same or higher speed
      if (category === 'Broadband' && d.speed_mbps && userSpend.speedMbps > 0 && d.speed_mbps < userSpend.speedMbps) continue;
      // For mobile: must have same or more data
      if (category === 'Mobile' && d.data_allowance) {
        const dealData = parseDataAllowanceGB(d.data_allowance);
        if (userSpend.dataAllowanceGB > 0 && dealData < userSpend.dataAllowanceGB) continue;
      }

      const savingsYearly = savingsMonthly * 12;
      if (!best || savingsYearly > best.savingsYearly) {
        best = { deal: d, savingsYearly, savingsMonthly };
      }
    }
    return best;
  }

  // Categories to display based on filter
  const visibleCategories = activeCategory
    ? CATEGORY_TABS.filter(c => c === activeCategory)
    : CATEGORY_TABS;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // Total potential savings — sum the largest annual £ figure parsed from
  // each eligible category's "saving" copy ("Save up to £150/yr"), times
  // the user's matching subscription count in that category.
  // `potentialAnnualSaving` used to live here. It regex-parsed "£150"
  // out of the hardcoded `saving` marketing strings, multiplied by the
  // user's subscription count, and produced a portfolio total. It was
  // never rendered, which is the only reason it did no harm. Deleted
  // along with the strings it fed on: a total built from numbers
  // nobody sourced is not a total.
  // Counts what a user can actually see, not what is in the file.
  const dealsCount =
    Object.values(DEALS).reduce(
      (n, arr) => n + (arr ?? []).filter((d) => joinedMerchantIds?.has(d.awinMid)).length,
      0,
    ) + verifiedDeals.length;

  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2 font-[family-name:var(--font-heading)]">Find Better Deals</h1>
        <p className="text-slate-600">
          Deals matched to what you actually pay. Where we know both your price
          and the deal price, we show the difference.
        </p>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
            activeCategory === null
              ? 'bg-emerald-500 text-slate-900'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-50'
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
                ? 'bg-emerald-500 text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-50'
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
            <p className="text-slate-600 text-sm">
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
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{cat} Deals</h3>
                  {urgentSubs.map(({ sub, days }) => {
                    const urgency = urgencyLabel(days);
                    return (
                      <div key={`urgent-note-${sub.id}`} className="flex items-center gap-3 mb-2 flex-wrap">
                        <div className="bg-slate-100 border border-slate-200/50 rounded-lg px-3 py-1.5 flex items-center gap-2">
                          <span className="text-slate-900 text-sm font-semibold">{normaliseMerchantName(sub.provider_name)}</span>
                          <span className="text-slate-500 text-sm">£{parseFloat(String(sub.amount)).toFixed(2)}/{sub.billing_cycle}</span>
                        </div>
                        <div className={`border rounded-lg px-3 py-1.5 flex items-center gap-1.5 ${urgency.bg}`}>
                          <Clock className={`h-3.5 w-3.5 ${urgency.color}`} />
                          <span className={`text-sm font-semibold ${urgency.color}`}>{urgency.text}</span>
                        </div>
                        {sub.auto_renews && (
                          <span className="text-xs text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded">Auto-renews</span>
                        )}
                        {sub.early_exit_fee && days > 0 && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">Exit fee: £{parseFloat(String(sub.early_exit_fee)).toFixed(0)}</span>
                        )}
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
                    {deals.filter(d => !dismissedDeals.has(d.id)).map((deal) => (
                      <DealCard 
                        key={`urgent-${deal.id}`} 
                        deal={deal} 
                        highlight 
                        onDismiss={() => setDismissedDeals(prev => new Set(prev).add(deal.id))}
                      />
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

          // Skip excluded categories entirely
          if (EXCLUDED_DEAL_CATEGORIES.has(catLower)) {
            return (
              <section key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-5 w-5 text-slate-500" />
                  <h2 className="text-xl font-bold text-slate-900">{category}</h2>
                </div>
                <div className="bg-slate-100/30 border border-slate-200/40 rounded-xl px-4 py-4 flex items-center gap-3">
                  <Info className="h-5 w-5 text-slate-500 flex-shrink-0" />
                  <p className="text-sm text-slate-600">
                    {catLower.includes('loan') || catLower.includes('mortgage') || catLower.includes('credit')
                      ? `${category} aren't switchable like utility bills. We recommend speaking to a financial adviser for personalised guidance.`
                      : `Deal comparisons aren't available for ${category.toLowerCase()}. We focus on categories where we can find you genuine savings.`
                    }
                  </p>
                </div>
              </section>
            );
          }

          const affiliatePlans = verifiedDeals
            .filter(d => d.category === catLower);

          const hasVerifiedDeals = CATEGORIES_WITH_VERIFIED_DEALS.has(catLower);

          // Sort by savings if user has spend data, otherwise by price
          const userSpend = categoryUserSpend[category];
          if (userSpend) {
            affiliatePlans.sort((a, b) => {
              const aPrice = a.price_promotional ?? a.price_monthly;
              const bPrice = b.price_promotional ?? b.price_monthly;
              const aSaving = userSpend.amount - aPrice;
              const bSaving = userSpend.amount - bPrice;
              return bSaving - aSaving; // highest savings first
            });
          } else {
            affiliatePlans.sort((a, b) => (a.price_promotional || a.price_monthly) - (b.price_promotional || b.price_monthly));
          }

          // Only show hardcoded generic deal cards for categories WITH verified deals
          // For other categories, show a "coming soon" message instead
          const affiliateProviderNames = new Set(affiliatePlans.map(d => d.provider.toLowerCase()));

          // ── Only advertisers we have actually joined ────────────────
          //
          // The hardcoded catalogue carried 59 deals across 54 merchant
          // ids. 49 of those belong to Awin programmes we have never
          // joined: BT, Sky, EE, O2, Vodafone, Three, OVO, EDF, Compare
          // the Market, MoneySuperMarket and the rest. Several are not
          // GB programmes on Awin at all — BT's real id is 3042, not the
          // 3041 written here; O2's is 3242, not 3235.
          //
          // It survived because awin1.com/cread.php 302s for ANY id and
          // sets an awc cookie, so a link to a programme we never joined
          // is indistinguishable from a working one. The user lands on
          // the advertiser, the URL looks tracked. It just cannot pay.
          //
          // So the same gate the database path already applies now
          // applies here. `null` means still loading, and renders
          // nothing rather than flashing deals about to disappear.
          const genericDeals = hasVerifiedDeals && joinedMerchantIds
            ? (DEALS[category] || [])
                .filter(d => joinedMerchantIds.has(d.awinMid))
                .filter(d => !affiliateProviderNames.has(d.provider.toLowerCase()))
                .filter(d => !dismissedDeals.has(d.id))
            : [];

          const activeAffiliatePlans = affiliatePlans.filter(d => !dismissedDeals.has(d.id));

          // For categories without verified deals and no generic deals, show coming soon
          if (!hasVerifiedDeals && activeAffiliatePlans.length === 0) {
            return (
              <section key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-5 w-5 text-slate-500" />
                  <h2 className="text-xl font-bold text-slate-900">{category} Deals</h2>
                </div>
                <div className="bg-slate-100/30 border border-dashed border-slate-200/40 rounded-xl px-4 py-4 flex items-start gap-3">
                  <Info className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-slate-600">
                    {/* Says what is true. We have no {category} partner
                        yet, so we have no price we can stand behind.
                        The previous copy, "we're working on finding
                        verified deals, check back soon", implied deals
                        were imminent and had been sitting there for
                        months. */}
                    <p>
                      We don&apos;t have a {category.toLowerCase()} partner yet, so we&apos;re
                      not showing you prices we can&apos;t stand behind.
                    </p>
                    <p className="mt-1.5 text-slate-500">
                      Your {category.toLowerCase()} spending is still tracked in Money Hub,
                      and we&apos;ll flag it if the amount jumps.
                    </p>
                  </div>
                </div>
              </section>
            );
          }

          if (activeAffiliatePlans.length === 0 && genericDeals.length === 0) return null;

          // Find user subscriptions matching this category
          const matchingSubs = categoryToUserSubs[category] || [];

          // Find best deal for this category
          const bestDeal = affiliatePlans.length > 0 ? findBestDeal(category, affiliatePlans) : null;

          return (
            <section key={category}>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-emerald-600" />
                <h2 className="text-xl font-bold text-slate-900">{category} Deals</h2>
              </div>

              {matchingSubs.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {matchingSubs.map((sub) => (
                    <div key={`ctx-${sub.id}-${category}`} className="bg-slate-100/50 border border-slate-200/50 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm">
                      <span className="text-slate-600">Currently paying</span>
                      <span className="text-slate-900 font-semibold">£{parseFloat(String(sub.amount)).toFixed(2)}/{sub.billing_cycle}</span>
                      <span className="text-slate-600">to</span>
                      <span className="text-slate-900 font-semibold">{normaliseMerchantName(sub.provider_name)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Best Deal For You recommendation */}
              {bestDeal && userSpend && (
                <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 mb-4">
                  <div className="flex items-start gap-3">
                    <Trophy className="h-6 w-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-900 mb-1">Best Deal For You</h3>
                      <p className="text-sm text-slate-700 mb-3">
                        Based on your current £{userSpend.amount.toFixed(2)}/mo spend, switching to{' '}
                        <span className="text-slate-900 font-semibold">{bestDeal.deal.provider} {bestDeal.deal.plan_name}</span>
                        {bestDeal.deal.speed_mbps ? ` (${bestDeal.deal.speed_mbps} Mbps)` : ''}
                        {' '}at <span className="text-emerald-400 font-semibold">£{(bestDeal.deal.price_promotional ?? bestDeal.deal.price_monthly).toFixed(2)}/mo</span>
                        {' '}would save you <span className="text-emerald-400 font-bold">£{bestDeal.savingsYearly.toFixed(0)}/yr</span>
                        {bestDeal.deal.speed_mbps && userSpend.speedMbps > 0 && bestDeal.deal.speed_mbps > userSpend.speedMbps
                          ? ` — with ${(bestDeal.deal.speed_mbps / userSpend.speedMbps).toFixed(0)}x faster speeds`
                          : ''}.
                      </p>
                      <a
                        href={bestDeal.deal.affiliate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          fetch('/api/affiliate-deals', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ provider: bestDeal.deal.provider, category: bestDeal.deal.category, deal_id: bestDeal.deal.id, plan_name: bestDeal.deal.plan_name }),
                          }).catch(() => {});
                          capture('best_deal_clicked', { provider: bestDeal.deal.provider, plan: bestDeal.deal.plan_name, savings: bestDeal.savingsYearly });
                        }}
                        className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-4 py-2 rounded-xl transition-all text-sm"
                      >
                        Switch Now →
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* No savings available but user has spend */}
              {!bestDeal && userSpend && affiliatePlans.length > 0 && (
                <div className="bg-slate-100/30 border border-slate-200/40 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-slate-600">You&apos;re on a competitive deal! We&apos;ll notify you if better options appear.</p>
                </div>
              )}

              {/* Plans, grouped into one panel per provider.
                *
                * These used to flow into a single flat grid: every
                * provider's cards ran together, and each provider's
                * "See all N plans" link landed wherever the grid
                * happened to wrap, so a TalkTalk link could sit under a
                * NOW Broadband card. Nothing told you where one
                * provider ended and the next began.
                *
                * Each provider now owns a bordered panel with its name,
                * its plan count and its cheapest price in the header,
                * and its own expander pinned to the bottom of that
                * panel. Cheapest provider first, so the page opens with
                * the answer. */}
              <div className="space-y-4">
                {(() => {
                  const byProvider = new Map<string, VerifiedDeal[]>();
                  for (const plan of activeAffiliatePlans) {
                    if (!byProvider.has(plan.provider)) byProvider.set(plan.provider, []);
                    byProvider.get(plan.provider)!.push(plan);
                  }

                  const blocks: Array<{
                    provider: string;
                    plans: VerifiedDeal[];
                    blockVia: string | null;
                    cheapest: number | null;
                  }> = [];
                  // Every provider that routes through the same
                  // comparison site shares ONE panel.
                  //
                  // One panel per provider gave eight consecutive,
                  // near-identical "Compare via Broadband Genie" boxes,
                  // each holding a single card and each repeating the
                  // same label. They are one destination, so they read
                  // better as one list.
                  const routedGroups = new Map<string, VerifiedDeal[]>();

                  for (const [provider, plans] of byProvider) {
                    const sorted = [...plans].sort(
                      (a, b) => (a.price_promotional ?? a.price_monthly) - (b.price_promotional ?? b.price_monthly),
                    );
                    const blockVia = routedVia(sorted[0].programme_id, provider, programmeNames);
                    if (blockVia) {
                      if (!routedGroups.has(blockVia)) routedGroups.set(blockVia, []);
                      routedGroups.get(blockVia)!.push(...sorted);
                      continue;
                    }
                    blocks.push({
                      provider,
                      plans: sorted,
                      blockVia: null,
                      cheapest: sorted[0].price_promotional ?? sorted[0].price_monthly,
                    });
                  }

                  for (const [site, plans] of routedGroups) {
                    blocks.push({
                      provider: `Compare via ${site}`,
                      plans: plans.sort((a, b) => a.provider.localeCompare(b.provider)),
                      blockVia: site,
                      // No price: the only source for these is the
                      // comparison page, which lists every provider on
                      // it at once. See AffiliatePlanCard.
                      cheapest: null,
                    });
                  }

                  blocks.sort((a, b) => {
                    if (a.cheapest == null && b.cheapest == null) return a.provider.localeCompare(b.provider);
                    if (a.cheapest == null) return 1;
                    if (b.cheapest == null) return -1;
                    return a.cheapest - b.cheapest;
                  });

                  return blocks.map(({ provider, plans, blockVia, cheapest }) => {
                    const key = `${catLower}-${provider}`;
                    const isExpanded = expandedProviders.has(key);
                    const shown = isExpanded ? plans : plans.slice(0, 3);
                    return (
                      <div key={key} className="border border-slate-200/60 rounded-2xl bg-white/50 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/60">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 truncate">{provider}</h3>
                            {blockVia && (
                              <p className="text-[11px] text-slate-500">
                                Prices shown on {blockVia}, not here
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[11px] text-slate-500">
                              {plans.length} {blockVia ? 'provider' : 'plan'}{plans.length === 1 ? '' : 's'}
                            </p>
                            {cheapest != null && (
                              <p className="text-sm font-semibold text-slate-900">from £{cheapest.toFixed(2)}/mo</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                          {shown.map((plan) => {
                            const planVia = routedVia(plan.programme_id, plan.provider, programmeNames);
                            const effectivePrice = plan.price_promotional ?? plan.price_monthly;
                            let savMo = !planVia && userSpend ? userSpend.amount - effectivePrice : undefined;
                            // Cap: savings above 80% of the current bill
                            // are almost always a mismatched comparison,
                            // not a bargain.
                            if (savMo !== undefined && userSpend && savMo > userSpend.amount * 0.8) {
                              savMo = undefined;
                            }
                            const savYr = savMo !== undefined ? savMo * 12 : undefined;
                            return (
                              <AffiliatePlanCard
                                key={plan.id}
                                deal={plan}
                                savingsMonthly={savMo}
                                savingsYearly={savYr}
                                userProvider={userSpend?.provider}
                                userSpend={userSpend?.amount}
                                via={planVia}
                                onDismiss={() => setDismissedDeals(prev => new Set(prev).add(plan.id))}
                              />
                            );
                          })}
                        </div>

                        {plans.length > 3 && (
                          <button
                            onClick={() => setExpandedProviders(prev => {
                              const n = new Set(prev);
                              if (n.has(key)) n.delete(key); else n.add(key);
                              return n;
                            })}
                            className="w-full px-4 py-2.5 text-sm text-emerald-600 hover:bg-emerald-500/5 border-t border-slate-200/60 transition-colors"
                          >
                            {isExpanded
                              ? 'Show fewer'
                              : blockVia
                                ? `Show all ${plans.length} providers →`
                                : `Show all ${plans.length} ${provider} plans →`}
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}

                {genericDeals.length > 0 && (
                  <div className="border border-slate-200/60 rounded-2xl bg-white/50 overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/60">
                      <h3 className="text-sm font-bold text-slate-900">More ways to compare</h3>
                      <p className="text-[11px] text-slate-500">Links only. We hold no price for these.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                      {genericDeals.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          onDismiss={() => setDismissedDeals(prev => new Set(prev).add(deal.id))}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Affiliate disclosure */}
      <div className="flex items-start gap-3 bg-slate-100/40 border border-slate-200/50 rounded-xl px-4 py-3 mt-10">
        <Tag className="h-4 w-4 text-slate-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Affiliate disclosure:</span> We may earn a commission when you switch via our links. This never affects the price you pay.
        </p>
      </div>
    </div>
  );
}

