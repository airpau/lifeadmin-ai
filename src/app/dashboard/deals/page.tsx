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
    { id: 'octopus-energy', provider: 'Octopus Energy', headline: 'Flexible tariff — no exit fees', saving: 'Save up to £180/yr', awinMid: '8173', providerUrl: 'https://octopus.energy', category: 'Energy' },
    { id: 'ovo-energy', provider: 'OVO Energy', headline: 'Fixed rate — lock in your price', saving: 'Save up to £150/yr', awinMid: '5318', providerUrl: 'https://www.ovoenergy.com', category: 'Energy' },
    { id: 'eon-next', provider: 'E.ON Next', headline: 'Next Drive tariff for EV owners', saving: 'Save up to £120/yr', awinMid: '15007', providerUrl: 'https://www.eonenergy.com', category: 'Energy' },
  ],
  Broadband: [
    { id: 'bt-broadband', provider: 'BT', headline: 'Full Fibre 500 — 50% off for 24 months', saving: 'Save up to £240/yr', awinMid: '5082', providerUrl: 'https://www.bt.com/broadband', category: 'Broadband' },
    { id: 'sky-broadband', provider: 'Sky', headline: 'Ultrafast broadband + Netflix', saving: 'Save up to £180/yr', awinMid: '2547', providerUrl: 'https://www.sky.com/shop/broadband', category: 'Broadband' },
    { id: 'virgin-media', provider: 'Virgin Media', headline: "Gig1 — UK's fastest widely available broadband", saving: 'Save up to £200/yr', awinMid: '6137', providerUrl: 'https://www.virginmedia.com', category: 'Broadband' },
    { id: 'vodafone-broadband', provider: 'Vodafone', headline: 'Pro II Broadband — guaranteed speeds', saving: 'Save up to £160/yr', awinMid: '9456', providerUrl: 'https://www.vodafone.co.uk/broadband', category: 'Broadband' },
  ],
  Insurance: [
    { id: 'compare-the-market', provider: 'Compare the Market', headline: 'Compare 100+ insurers in minutes', saving: 'Save up to £300/yr', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com', category: 'Insurance' },
    { id: 'moneysupermarket', provider: 'MoneySuperMarket', headline: 'Car, home & life insurance', saving: 'Save up to £250/yr', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com', category: 'Insurance' },
    { id: 'gocompare', provider: 'GoCompare', headline: 'Award-winning comparison', saving: 'Save up to £280/yr', awinMid: '5982', providerUrl: 'https://www.gocompare.com', category: 'Insurance' },
  ],
  Mobile: [
    { id: 'id-mobile', provider: 'iD Mobile', headline: 'SIM-only from £6/mo', saving: 'Save up to £240/yr', awinMid: '15913', providerUrl: 'https://www.idmobile.co.uk', category: 'Mobile' },
    { id: 'smarty', provider: 'Smarty', headline: 'Fair data — unused data rolled over', saving: 'Save up to £200/yr', awinMid: '18849', providerUrl: 'https://smarty.co.uk', category: 'Mobile' },
    { id: 'lebara', provider: 'Lebara', headline: 'International calls included', saving: 'Save up to £180/yr', awinMid: '13780', providerUrl: 'https://mobile.lebara.com/gb/en', category: 'Mobile' },
  ],
  Mortgages: [
    { id: 'habito', provider: 'Habito', headline: 'Free online mortgage broker — compare 90+ lenders', saving: 'Save up to £3,000/yr', awinMid: '15441', providerUrl: 'https://www.habito.com', category: 'Mortgages' },
    { id: 'moneysupermarket-mortgages', provider: 'MoneySuperMarket', headline: 'Compare mortgage rates from 50+ lenders', saving: 'Compare rates', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/mortgages/', category: 'Mortgages' },
    { id: 'l-and-c', provider: 'London & Country', headline: "UK's largest fee-free mortgage broker", saving: 'Fee-free advice', awinMid: '7498', providerUrl: 'https://www.landc.co.uk', category: 'Mortgages' },
    { id: 'trussle', provider: 'Trussle', headline: 'Online mortgage broker — no fees, no jargon', saving: 'Save thousands', awinMid: '19822', providerUrl: 'https://trussle.com', category: 'Mortgages' },
  ],
  'Credit Cards': [
    { id: 'mse-credit-cards', provider: 'MoneySavingExpert', headline: "Eligibility checker — see cards you'll get without affecting credit score", saving: '0% balance transfer deals', awinMid: '12498', providerUrl: 'https://www.moneysavingexpert.com/credit-cards/', category: 'Credit Cards' },
    { id: 'comparethemarket-cc', provider: 'Compare the Market', headline: 'Compare credit cards — balance transfer, cashback, rewards', saving: 'Save on interest', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com/credit-cards/', category: 'Credit Cards' },
    { id: 'totallymoney', provider: 'TotallyMoney', headline: 'Free credit score + personalised card recommendations', saving: 'Best match cards', awinMid: '10983', providerUrl: 'https://www.totallymoney.com/credit-cards/', category: 'Credit Cards' },
  ],
  Loans: [
    { id: 'freedom-finance', provider: 'Freedom Finance', headline: 'Personal loans from 3.3% APR — compare 30+ lenders', saving: 'Lower your rate', awinMid: '14780', providerUrl: 'https://www.freedomfinance.co.uk/loans', category: 'Loans' },
    { id: 'moneysupermarket-loans', provider: 'MoneySuperMarket', headline: 'Compare personal loans — consolidate and save', saving: 'Compare APRs', awinMid: '1986', providerUrl: 'https://www.moneysupermarket.com/loans/', category: 'Loans' },
    { id: 'comparethemarket-loans', provider: 'Compare the Market', headline: 'Personal and car finance — one search, multiple lenders', saving: 'Reduce monthly payments', awinMid: '3738', providerUrl: 'https://www.comparethemarket.com/loans/', category: 'Loans' },
  ],
  'Car Finance': [
    { id: 'carwow-finance', provider: 'Carwow', headline: 'Compare car finance deals — PCP, HP, and personal loans', saving: 'Save on car finance', awinMid: '18621', providerUrl: 'https://www.carwow.co.uk/car-finance', category: 'Car Finance' },
    { id: 'zuto', provider: 'Zuto', headline: 'Car finance comparison — all credit scores welcome', saving: 'Rates from 6.9% APR', awinMid: '16944', providerUrl: 'https://www.zuto.com', category: 'Car Finance' },
  ],
};

// Map provider_type (from contract tracking) to deal categories
const PROVIDER_TYPE_TO_DEALS: Record<string, string[]> = {
  energy: ['Energy'],
  broadband: ['Broadband'],
  mobile: ['Mobile'],
  tv: ['Broadband'], // TV often bundled with broadband
  insurance_home: ['Insurance'],
  insurance_car: ['Insurance'],
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

function DealCard({ deal, highlight }: { deal: Deal; highlight?: boolean }) {
  const [tracking, setTracking] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
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
    <div className={`bg-slate-900/50 backdrop-blur-sm border rounded-2xl p-6 hover:border-slate-600 transition-all flex flex-col gap-4 ${
      highlight ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800'
    }`}>
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-white mb-1">{deal.provider}</h3>
        <p className="text-slate-400 text-sm">{deal.headline}</p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full">
          {deal.saving}
        </span>
        <a
          href={buildAwinUrl(deal.awinMid, deal.providerUrl)}
          onClick={handleClick}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap"
        >
          {tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          View Deal →
        </a>
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
