'use client';

import { useEffect, useState } from 'react';
import { Gift, Star, Trophy, Crown, Loader2, Check, Clock, Copy, Share2 } from 'lucide-react';

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

interface ReferralData {
  code: string;
  shareUrl: string;
  totalReferred: number;
  totalSubscribed: number;
  referrals: Array<{ email: string; status: string; created_at: string }>;
}

export default function RewardsPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [referrals, setReferrals] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/loyalty').then(r => r.json()),
      fetch('/api/referrals').then(r => r.json()),
    ]).then(([loyaltyData, refData]) => {
      if (!loyaltyData.error) setData(loyaltyData);
      if (!refData.error) setReferrals(refData);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCopyCode = () => {
    if (referrals?.shareUrl) {
      navigator.clipboard.writeText(referrals.shareUrl);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

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

      {/* Referral System */}
      {referrals && (
        <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Share2 className="h-6 w-6 text-amber-500" />
            <div>
              <h2 className="text-lg font-bold text-white">Refer a friend, earn rewards</h2>
              <p className="text-slate-400 text-sm">They get a free first month. You get 100 points (+ 200 if they subscribe).</p>
            </div>
          </div>

          <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 mb-4">
            <p className="text-slate-500 text-xs mb-2">Your referral link</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 text-amber-400 text-sm bg-slate-900 rounded-lg px-3 py-2 font-mono truncate">{referrals.shareUrl}</code>
              <button
                onClick={handleCopyCode}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2"
              >
                {codeCopied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
              </button>
            </div>
            <p className="text-slate-600 text-xs mt-2">Your code: <span className="text-slate-400 font-mono">{referrals.code}</span></p>
          </div>

          {referrals.totalReferred > 0 && (
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-white font-bold">{referrals.totalReferred}</span>
                <span className="text-slate-500 ml-1">referred</span>
              </div>
              <div>
                <span className="text-amber-400 font-bold">{referrals.totalSubscribed}</span>
                <span className="text-slate-500 ml-1">subscribed</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How to earn */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-4">How to earn points</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { action: 'Generate a complaint letter', points: 10, icon: '📄', live: true },
            { action: 'Generate a cancellation email', points: 5, icon: '✉️', live: true },
            { action: 'Connect a bank account', points: 25, icon: '🏦', live: true },
            { action: 'Complete first bank scan', points: 20, icon: '📊', live: true },
            { action: 'Sync bank transactions', points: 5, icon: '🔄', live: true },
            { action: 'Explore a deal', points: 2, icon: '🔗', live: true },
            { action: 'Confirm a cancellation', points: 15, icon: '✅', live: true },
            { action: 'Switch via an affiliate deal', points: 50, icon: '💰', live: false },
            { action: 'Refer a friend who signs up', points: 100, icon: '👥', live: true },
            { action: 'Refer a friend who subscribes', points: 200, icon: '🌟', live: true },
          ].map((item, i) => (
            <div key={i} className={`flex items-center justify-between rounded-lg px-4 py-2.5 border ${item.live ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-950/30 border-slate-800/50'}`}>
              <div className="flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <span className={`text-sm ${item.live ? 'text-slate-300' : 'text-slate-500'}`}>{item.action}</span>
                {!item.live && <span className="text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">Coming soon</span>}
              </div>
              <span className={`font-bold text-sm ${item.live ? 'text-amber-400' : 'text-slate-600'}`}>+{item.points}</span>
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
