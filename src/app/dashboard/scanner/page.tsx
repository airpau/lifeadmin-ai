'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState } from 'react';
import { ScanSearch, AlertCircle, TrendingUp, Calendar, CreditCard, Sparkles } from 'lucide-react';

// Mock opportunities data
const mockOpportunities = [
  {
    id: '1',
    type: 'overcharge',
    title: 'British Gas overcharge detected',
    description: 'Your January bill shows £47 more than your average. Possible meter misread or incorrect tariff.',
    amount: 47.00,
    confidence: 92,
    provider: 'British Gas',
    detected: '2026-03-15',
    status: 'new',
  },
  {
    id: '2',
    type: 'renewal',
    title: 'Sky contract renewal approaching',
    description: 'Your Sky TV contract ends on April 15th. Average savings: £180/year by negotiating or switching.',
    amount: 180.00,
    confidence: 87,
    provider: 'Sky',
    detected: '2026-03-10',
    status: 'new',
  },
  {
    id: '3',
    type: 'forgotten_subscription',
    title: 'Unused Adobe subscription',
    description: 'Adobe Creative Cloud (£49.99/mo) - No logins in 93 days. Cancel to save £599.88/year.',
    amount: 599.88,
    confidence: 95,
    provider: 'Adobe',
    detected: '2026-03-08',
    status: 'new',
  },
  {
    id: '4',
    type: 'overcharge',
    title: 'Virgin Media speed discrepancy',
    description: 'Paying for 350Mbps but speed tests show average 180Mbps. You may be owed compensation.',
    amount: 25.00,
    confidence: 78,
    provider: 'Virgin Media',
    detected: '2026-03-05',
    status: 'reviewing',
  },
  {
    id: '5',
    type: 'renewal',
    title: 'Amazon Prime price increase',
    description: 'Prime membership increasing from £95 to £99/year on renewal. Consider alternatives or negotiate.',
    amount: 4.00,
    confidence: 65,
    provider: 'Amazon',
    detected: '2026-03-01',
    status: 'new',
  },
];

const typeConfig = {
  overcharge: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    label: 'Overcharge',
  },
  renewal: {
    icon: Calendar,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    label: 'Renewal Alert',
  },
  forgotten_subscription: {
    icon: CreditCard,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    label: 'Unused Subscription',
  },
};

export default function ScannerPage() {
  const [opportunities] = useState(mockOpportunities);
  const [filter, setFilter] = useState<'all' | 'new' | 'reviewing'>('all');

  const filteredOpportunities = opportunities.filter(
    (opp) => filter === 'all' || opp.status === filter
  );

  const totalPotentialSavings = opportunities.reduce((sum, opp) => sum + opp.amount, 0);
  const highConfidenceCount = opportunities.filter((opp) => opp.confidence >= 80).length;

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <ScanSearch className="h-10 w-10 text-amber-500" />
          Opportunity Scanner
        </h1>
        <p className="text-slate-400">
          AI-detected savings opportunities from your bills and subscriptions
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">£{totalPotentialSavings.toFixed(2)}</h3>
          <p className="text-slate-400 text-sm">Potential savings found</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-amber-500" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">{opportunities.length}</h3>
          <p className="text-slate-400 text-sm">Opportunities detected</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-blue-500" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white mb-1">{highConfidenceCount}</h3>
          <p className="text-slate-400 text-sm">High confidence (80%+)</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {['all', 'new', 'reviewing'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f === 'new' ? 'New' : 'Reviewing'}
          </button>
        ))}
      </div>

      {/* Opportunities List */}
      <div className="space-y-4">
        {filteredOpportunities.map((opportunity) => {
          const config = typeConfig[opportunity.type as keyof typeof typeConfig];
          const Icon = config.icon;

          return (
            <div
              key={opportunity.id}
              className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-4 flex-1">
                  {/* Icon */}
                  <div className={`${config.bg} w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-6 w-6 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-xs font-semibold ${config.color} ${config.bg} px-2 py-1 rounded`}>
                        {config.label}
                      </span>
                      <span className="text-xs text-slate-500">
                        {opportunity.provider} • Detected {new Date(opportunity.detected).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{opportunity.title}</h3>
                    <p className="text-slate-400 text-sm mb-4">{opportunity.description}</p>

                    {/* Confidence bar */}
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-xs text-slate-500">Confidence:</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden max-w-xs">
                        <div
                          className={`h-full ${
                            opportunity.confidence >= 80
                              ? 'bg-green-500'
                              : opportunity.confidence >= 60
                              ? 'bg-amber-500'
                              : 'bg-slate-500'
                          }`}
                          style={{ width: `${opportunity.confidence}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-white">{opportunity.confidence}%</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-6 py-2 rounded-lg transition-all text-sm">
                        Take Action
                      </button>
                      <button className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg transition-all text-sm">
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold text-green-500">+£{opportunity.amount.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">Potential savings</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredOpportunities.length === 0 && (
        <div className="text-center py-12 bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl">
          <ScanSearch className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No opportunities found for this filter</p>
        </div>
      )}
    </div>
  );
}
