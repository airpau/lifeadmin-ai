'use client';

import { useEffect, useState } from 'react';
import { Gift, Star, Trophy, Crown, Loader2, Check, Clock } from 'lucide-react';

interface LoyaltyData {
  balance: number;
  lifetime: number;
  tier: string;
  tierInfo: { label: string; color: string; multiplier: number; perks: string[] };
  recentEvents: Array<{ event_type: string; points: number; description: string; created_at: string }>;
  redemptionOptions: Array<{ id: string; points: number; label: string; description: string; canRedeem: boolean }>;
  allTiers: Array<{ key: string; label: string; color: string; minMonths: number; perks: string[]; isCurrent: boolean }>;
}

const tierIcons: Record<string, typeof Star> = {
  bronze: Star,
  silver: Trophy,
  gold: Crown,
  platinum: Gift,
};

export default function RewardsPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/loyalty')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl text-center py-16">
        <Gift className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Loyalty Rewards</h2>
        <p className="text-slate-400">Start using Paybacker to earn points and unlock rewards.</p>
      </div>
    );
  }

  const TierIcon = tierIcons[data.tier] || Star;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Loyalty Rewards</h1>
        <p className="text-slate-400">Earn points every time you save money. Redeem for discounts.</p>
      </div>

      {/* Points Balance + Tier */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
          <div className="text-5xl font-bold text-amber-500 mb-2">{data.balance.toLocaleString()}</div>
          <p className="text-slate-400 text-sm">Points balance</p>
          <p className="text-slate-500 text-xs mt-1">{data.lifetime.toLocaleString()} lifetime earned</p>
        </div>

        <div className="bg-slate-900/50 border rounded-2xl p-6 text-center" style={{ borderColor: data.tierInfo.color + '44' }}>
          <TierIcon className="h-10 w-10 mx-auto mb-2" style={{ color: data.tierInfo.color }} />
          <div className="text-2xl font-bold text-white mb-1">{data.tierInfo.label}</div>
          <p className="text-slate-400 text-sm">{data.tierInfo.multiplier}x points multiplier</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {data.tierInfo.perks.map((perk, i) => (
              <span key={i} className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded-full">{perk}</span>
            ))}
          </div>
        </div>
      </div>

      {/* How to earn */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">How to earn points</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { action: 'Generate a complaint letter', points: 10, icon: '📄' },
            { action: 'Generate a cancellation email', points: 5, icon: '✉️' },
            { action: 'Cancel a subscription', points: 15, icon: '❌' },
            { action: 'Connect a bank account', points: 25, icon: '🏦' },
            { action: 'Sync bank transactions', points: 5, icon: '🔄' },
            { action: 'Click a deal', points: 2, icon: '🔗' },
            { action: 'Switch to a better deal', points: 50, icon: '💰' },
            { action: 'Refer a friend who signs up', points: 100, icon: '👥' },
            { action: 'Refer a friend who subscribes', points: 200, icon: '🌟' },
            { action: 'Complete first bank scan', points: 20, icon: '📊' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-2.5 border border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className="text-slate-300 text-sm">{item.action}</span>
              </div>
              <span className="text-amber-400 font-bold text-sm">+{item.points}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Redeem */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Redeem your points</h2>
        <div className="space-y-3">
          {data.redemptionOptions.map((opt) => (
            <div key={opt.id} className="flex items-center justify-between bg-slate-950/50 rounded-xl px-5 py-4 border border-slate-800">
              <div>
                <p className="text-white font-semibold">{opt.label}</p>
                <p className="text-slate-500 text-xs">{opt.description}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className="text-amber-400 font-bold">{opt.points.toLocaleString()} pts</span>
                <button
                  disabled={!opt.canRedeem}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    opt.canRedeem
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {opt.canRedeem ? 'Redeem' : 'Not enough'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tier Progression */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Loyalty tiers</h2>
        <div className="space-y-3">
          {data.allTiers.map((t) => {
            const Icon = tierIcons[t.key] || Star;
            return (
              <div key={t.key} className={`flex items-center gap-4 rounded-xl px-5 py-4 border ${
                t.isCurrent ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-950/50'
              }`}>
                <Icon className="h-6 w-6 shrink-0" style={{ color: t.color }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{t.label}</span>
                    {t.isCurrent && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">Current</span>}
                  </div>
                  <p className="text-slate-500 text-xs">
                    {t.minMonths === 0 ? 'From day one' : `After ${t.minMonths} months`} · {t.perks.join(' · ')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      {data.recentEvents.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent activity</h2>
          <div className="space-y-2">
            {data.recentEvents.map((event, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-2.5 border border-slate-800">
                <div>
                  <p className="text-white text-sm">{event.description}</p>
                  <p className="text-slate-500 text-xs">
                    {new Date(event.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className="text-green-400 font-bold text-sm">+{event.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
