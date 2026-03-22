'use client';

import { useState } from 'react';
import { Tag, Loader2 } from 'lucide-react';

import { capture } from '@/lib/posthog';

const AWIN_AFF_ID = '!!!REPLACE_WITH_AWIN_ID!!!';

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
    {
      id: 'octopus-energy',
      provider: 'Octopus Energy',
      headline: 'Flexible tariff — no exit fees',
      saving: 'Save up to £180/yr',
      awinMid: '8173',
      providerUrl: 'https://octopus.energy',
      category: 'Energy',
    },
    {
      id: 'ovo-energy',
      provider: 'OVO Energy',
      headline: 'Fixed rate — lock in your price',
      saving: 'Save up to £150/yr',
      awinMid: '5318',
      providerUrl: 'https://www.ovoenergy.com',
      category: 'Energy',
    },
    {
      id: 'eon-next',
      provider: 'E.ON Next',
      headline: 'Next Drive tariff for EV owners',
      saving: 'Save up to £120/yr',
      awinMid: '15007',
      providerUrl: 'https://www.eonenergy.com',
      category: 'Energy',
    },
  ],
  Broadband: [
    {
      id: 'bt-broadband',
      provider: 'BT',
      headline: 'Full Fibre 500 — 50% off for 24 months',
      saving: 'Save up to £240/yr',
      awinMid: '5082',
      providerUrl: 'https://www.bt.com/broadband',
      category: 'Broadband',
    },
    {
      id: 'sky-broadband',
      provider: 'Sky',
      headline: 'Ultrafast broadband + Netflix',
      saving: 'Save up to £180/yr',
      awinMid: '2547',
      providerUrl: 'https://www.sky.com/shop/broadband',
      category: 'Broadband',
    },
    {
      id: 'virgin-media',
      provider: 'Virgin Media',
      headline: "Gig1 — UK's fastest widely available broadband",
      saving: 'Save up to £200/yr',
      awinMid: '6137',
      providerUrl: 'https://www.virginmedia.com',
      category: 'Broadband',
    },
    {
      id: 'vodafone-broadband',
      provider: 'Vodafone',
      headline: 'Pro II Broadband — guaranteed speeds',
      saving: 'Save up to £160/yr',
      awinMid: '9456',
      providerUrl: 'https://www.vodafone.co.uk/broadband',
      category: 'Broadband',
    },
  ],
  Insurance: [
    {
      id: 'compare-the-market',
      provider: 'Compare the Market',
      headline: 'Compare 100+ insurers in minutes',
      saving: 'Save up to £300/yr',
      awinMid: '3738',
      providerUrl: 'https://www.comparethemarket.com',
      category: 'Insurance',
    },
    {
      id: 'moneysupermarket',
      provider: 'MoneySuperMarket',
      headline: 'Car, home & life insurance',
      saving: 'Save up to £250/yr',
      awinMid: '1986',
      providerUrl: 'https://www.moneysupermarket.com',
      category: 'Insurance',
    },
    {
      id: 'gocompare',
      provider: 'GoCompare',
      headline: 'Award-winning comparison',
      saving: 'Save up to £280/yr',
      awinMid: '5982',
      providerUrl: 'https://www.gocompare.com',
      category: 'Insurance',
    },
  ],
  Mobile: [
    {
      id: 'id-mobile',
      provider: 'iD Mobile',
      headline: 'SIM-only from £6/mo',
      saving: 'Save up to £240/yr',
      awinMid: '15913',
      providerUrl: 'https://www.idmobile.co.uk',
      category: 'Mobile',
    },
    {
      id: 'smarty',
      provider: 'Smarty',
      headline: 'Fair data — unused data rolled over',
      saving: 'Save up to £200/yr',
      awinMid: '18849',
      providerUrl: 'https://smarty.co.uk',
      category: 'Mobile',
    },
    {
      id: 'lebara',
      provider: 'Lebara',
      headline: 'International calls included',
      saving: 'Save up to £180/yr',
      awinMid: '13780',
      providerUrl: 'https://mobile.lebara.com/gb/en',
      category: 'Mobile',
    },
  ],
  Mortgages: [
    {
      id: 'habito',
      provider: 'Habito',
      headline: 'Free online mortgage broker — compare 90+ lenders',
      saving: 'Save up to £3,000/yr',
      awinMid: '15441',
      providerUrl: 'https://www.habito.com',
      category: 'Mortgages',
    },
    {
      id: 'moneysupermarket-mortgages',
      provider: 'MoneySuperMarket',
      headline: 'Compare mortgage rates from 50+ lenders',
      saving: 'Compare rates',
      awinMid: '1986',
      providerUrl: 'https://www.moneysupermarket.com/mortgages/',
      category: 'Mortgages',
    },
    {
      id: 'l-and-c',
      provider: 'London & Country',
      headline: 'UK\'s largest fee-free mortgage broker',
      saving: 'Fee-free advice',
      awinMid: '7498',
      providerUrl: 'https://www.landc.co.uk',
      category: 'Mortgages',
    },
    {
      id: 'trussle',
      provider: 'Trussle',
      headline: 'Online mortgage broker — no fees, no jargon',
      saving: 'Save thousands',
      awinMid: '19822',
      providerUrl: 'https://trussle.com',
      category: 'Mortgages',
    },
  ],
  'Credit Cards': [
    {
      id: 'mse-credit-cards',
      provider: 'MoneySavingExpert',
      headline: 'Eligibility checker — see cards you\'ll get without affecting credit score',
      saving: '0% balance transfer deals',
      awinMid: '12498',
      providerUrl: 'https://www.moneysavingexpert.com/credit-cards/',
      category: 'Credit Cards',
    },
    {
      id: 'comparethemarket-cc',
      provider: 'Compare the Market',
      headline: 'Compare credit cards — balance transfer, cashback, rewards',
      saving: 'Save on interest',
      awinMid: '3738',
      providerUrl: 'https://www.comparethemarket.com/credit-cards/',
      category: 'Credit Cards',
    },
    {
      id: 'totallymoney',
      provider: 'TotallyMoney',
      headline: 'Free credit score + personalised card recommendations',
      saving: 'Best match cards',
      awinMid: '10983',
      providerUrl: 'https://www.totallymoney.com/credit-cards/',
      category: 'Credit Cards',
    },
  ],
  Loans: [
    {
      id: 'freedom-finance',
      provider: 'Freedom Finance',
      headline: 'Personal loans from 3.3% APR — compare 30+ lenders',
      saving: 'Lower your rate',
      awinMid: '14780',
      providerUrl: 'https://www.freedomfinance.co.uk/loans',
      category: 'Loans',
    },
    {
      id: 'moneysupermarket-loans',
      provider: 'MoneySuperMarket',
      headline: 'Compare personal loans — consolidate and save',
      saving: 'Compare APRs',
      awinMid: '1986',
      providerUrl: 'https://www.moneysupermarket.com/loans/',
      category: 'Loans',
    },
    {
      id: 'comparethemarket-loans',
      provider: 'Compare the Market',
      headline: 'Personal and car finance — one search, multiple lenders',
      saving: 'Reduce monthly payments',
      awinMid: '3738',
      providerUrl: 'https://www.comparethemarket.com/loans/',
      category: 'Loans',
    },
  ],
  'Car Finance': [
    {
      id: 'carwow-finance',
      provider: 'Carwow',
      headline: 'Compare car finance deals — PCP, HP, and personal loans',
      saving: 'Save on car finance',
      awinMid: '18621',
      providerUrl: 'https://www.carwow.co.uk/car-finance',
      category: 'Car Finance',
    },
    {
      id: 'zuto',
      provider: 'Zuto',
      headline: 'Car finance comparison — all credit scores welcome',
      saving: 'Rates from 6.9% APR',
      awinMid: '16944',
      providerUrl: 'https://www.zuto.com',
      category: 'Car Finance',
    },
  ],
};

function buildAwinUrl(awinMid: string, providerUrl: string): string {
  return `https://www.awin1.com/cread.php?awinmid=${awinMid}&awinaffid=${AWIN_AFF_ID}&ued=${encodeURIComponent(providerUrl)}`;
}

function DealCard({ deal }: { deal: Deal }) {
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
      // Non-fatal — still navigate
    } finally {
      setTracking(false);
      window.open(buildAwinUrl(deal.awinMid, deal.providerUrl), '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all flex flex-col gap-4">
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
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-all text-sm whitespace-nowrap"
          aria-disabled={tracking}
        >
          {tracking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          View Deal →
        </a>
      </div>
    </div>
  );
}

export default function DealsPage() {
  return (
    <div className="max-w-7xl">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Find Better Deals</h1>
        <p className="text-slate-400">Stop overpaying. Compare and switch in minutes.</p>
      </div>

      {/* Affiliate disclosure */}
      <div className="flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3 mb-8">
        <Tag className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Affiliate disclosure:</span> We may earn a commission when you switch via our links. This never affects the price you pay.
        </p>
      </div>

      {/* Category sections */}
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
    </div>
  );
}
