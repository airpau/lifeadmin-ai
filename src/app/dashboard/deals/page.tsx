'use client';

import { useState } from 'react';
import { Tag, Loader2 } from 'lucide-react';

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
