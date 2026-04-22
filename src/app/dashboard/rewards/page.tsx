'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Gift, Star, Trophy, Crown, Loader2, Check, Clock, Copy, Share2,
  Lock, ChevronDown, ChevronUp, ArrowRight, Flame, Heart, Target,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import ChallengeCard from '@/components/rewards/ChallengeCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoyaltyData {
  balance: number;
  lifetime: number;
  tier: string;
  tierInfo: { label: string; color: string; multiplier: number; perks: string[]; minMonths?: number; minPoints?: number };
  currentStreak: number;
  longestStreak: number;
  badges: Array<{ badge_id: string; badge_name: string; badge_description: string; badge_emoji: string; earned_at: string }>;
  recentEvents: Array<{ event_type: string; points: number; description: string; created_at: string }>;
  redemptionOptions: Array<{ id: string; points: number; label: string; description: string; canRedeem: boolean; type: string; value: number }>;
  allTiers: Array<{ key: string; label: string; color: string; minMonths: number; minPoints: number; perks: string[]; isCurrent: boolean; multiplier: number }>;
}

interface ReferralData {
  code: string;
  shareUrl: string;
  joinUrl: string;
  totalReferred: number;
  totalSignedUp: number;
  totalSubscribed: number;
  pendingUpgrades: number;
  referrals: Array<{ email: string; status: string; created_at: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const tierIcons: Record<string, typeof Star> = {
  bronze: Star,
  silver: Trophy,
  gold: Crown,
  platinum: Gift,
};

const tierEmojis: Record<string, string> = {
  bronze: '⭐',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
};

const tierOrder = ['bronze', 'silver', 'gold', 'platinum'];

const redemptionEmojis: Record<string, string> = {
  discount_5: '🎫',
  discount_10: '🎟',
  free_month_essential: '⭐',
  free_month_pro: '🚀',
  charity_donation: '💚',
};

// All 19 badges with unlock conditions for display
const ALL_BADGES = [
  { id: 'first_letter', name: 'Bill Fighter', emoji: '🥊', description: 'Generate your first complaint letter', action: '/dashboard/complaints' },
  { id: 'five_letters', name: 'Serial Complainer', emoji: '⚡', description: 'Generate 5 complaint letters', action: '/dashboard/complaints' },
  { id: 'twenty_letters', name: 'Consumer Champion', emoji: '🏆', description: 'Generate 20 complaint letters', action: '/dashboard/complaints' },
  { id: 'first_cancellation', name: 'Subscription Slayer', emoji: '✂️', description: 'Cancel your first subscription', action: '/dashboard/subscriptions' },
  { id: 'ten_cancellations', name: 'Cut The Cord', emoji: '🔥', description: 'Cancel 10 subscriptions', action: '/dashboard/subscriptions' },
  { id: 'bank_connected', name: 'Money Detective', emoji: '🔍', description: 'Connect your first bank account', action: '/dashboard/subscriptions' },
  { id: 'email_connected', name: 'Inbox Raider', emoji: '📧', description: 'Connect your email inbox', action: '/dashboard/profile?connect_email=true' },
  { id: 'first_referral', name: 'Word Spreader', emoji: '📣', description: 'Refer your first friend', action: '#referrals' },
  { id: 'five_referrals', name: 'Paybacker Ambassador', emoji: '🌟', description: 'Refer 5 friends', action: '#referrals' },
  { id: 'streak_3', name: 'On A Roll', emoji: '🎯', description: '3-month active streak', action: '#streaks' },
  { id: 'streak_6', name: 'Half Year Hero', emoji: '💪', description: '6-month active streak', action: '#streaks' },
  { id: 'streak_12', name: 'Paybacker Legend', emoji: '👑', description: '12-month active streak', action: '#streaks' },
  { id: 'silver_tier', name: 'Silver Status', emoji: '🥈', description: 'Reach Silver tier', action: '#tiers' },
  { id: 'gold_tier', name: 'Gold Status', emoji: '🥇', description: 'Reach Gold tier', action: '#tiers' },
  { id: 'platinum_tier', name: 'Platinum Elite', emoji: '💎', description: 'Reach Platinum tier', action: '#tiers' },
  { id: 'first_claim', name: 'Money Back', emoji: '💰', description: 'Claim your first compensation', action: '/dashboard/complaints' },
  { id: 'points_500', name: 'High Earner', emoji: '📈', description: 'Earn 500 lifetime points', action: '#earn' },
  { id: 'points_2000', name: 'Power User', emoji: '⭐', description: 'Earn 2,000 lifetime points', action: '#earn' },
  { id: 'points_5000', name: 'Elite Member', emoji: '🚀', description: 'Earn 5,000 lifetime points', action: '#earn' },
];

const EARN_ACTIONS = [
  { action: 'Generate a complaint letter', points: 10, emoji: '📄' },
  { action: 'Generate a cancellation email', points: 5, emoji: '✉️' },
  { action: 'Connect a bank account', points: 25, emoji: '🏦' },
  { action: 'Complete first bank scan', points: 20, emoji: '📊' },
  { action: 'Sync bank transactions', points: 5, emoji: '🔄' },
  { action: 'Explore a deal', points: 2, emoji: '🔗' },
  { action: 'Confirm a cancellation', points: 15, emoji: '✅' },
  { action: 'Complete your profile', points: 20, emoji: '👤' },
  { action: 'Connect your email inbox', points: 30, emoji: '📧' },
  { action: 'Complete Money Hub onboarding', points: 15, emoji: '📱' },
  { action: 'Switch via an affiliate deal', points: 50, emoji: '💰' },
  { action: 'Refer a friend who signs up', points: 100, emoji: '👥' },
  { action: 'Refer a friend who subscribes', points: 200, emoji: '🌟' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [referrals, setReferrals] = useState<ReferralData | null>(null);
  const [challenges, setChallenges] = useState<{
    available: any[];
    active: any[];
    completed: any[];
    failed: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  const confettiFired = useRef(false);

  const loadChallenges = () => {
    fetch('/api/challenges').then(r => r.json()).then(d => {
      if (!d.error) setChallenges(d);
    }).catch(() => {});
  };

  const loadData = () => {
    Promise.all([
      fetch('/api/loyalty').then(r => r.json()),
      fetch('/api/referrals').then(r => r.json()),
    ]).then(([loyaltyData, refData]) => {
      if (!loyaltyData.error) setData(loyaltyData);
      if (!refData.error) setReferrals(refData);
    }).catch(() => { setError('Failed to load rewards data. Please try again.'); }).finally(() => setLoading(false));
    loadChallenges();
  };

  useEffect(() => { loadData(); }, []);

  // Fire confetti on first load if user has badges
  useEffect(() => {
    if (data && data.badges.length > 0 && !confettiFired.current) {
      confettiFired.current = true;
      // Small celebration on page load if they have achievements
      setTimeout(() => {
        confetti({ particleCount: 30, spread: 60, origin: { y: 0.3 }, colors: ['#f59e0b', '#fbbf24', '#d97706'] });
      }, 500);
    }
  }, [data]);

  const handleCopyCode = () => {
    if (referrals?.shareUrl) {
      navigator.clipboard.writeText(referrals.shareUrl);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleWhatsAppShare = () => {
    if (referrals?.shareUrl) {
      window.open(`https://wa.me/?text=${encodeURIComponent(`Join me on Paybacker and start saving money on your bills! ${referrals.shareUrl}`)}`, '_blank');
    }
  };

  const handleRedeem = async (redemptionId: string) => {
    if (redeemingId) return;
    setRedeemingId(redemptionId);
    try {
      const res = await fetch('/api/loyalty/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemption_id: redemptionId }),
      });
      const result = await res.json();
      if (result.success) {
        setRedeemSuccess(result.message);
        confetti({ particleCount: 80, spread: 100, origin: { y: 0.6 }, colors: ['#f59e0b', '#22c55e', '#fbbf24'] });
        loadData(); // Refresh data
        setTimeout(() => setRedeemSuccess(null), 5000);
      } else {
        alert(result.error || 'Redemption failed');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setRedeemingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl text-center py-16">
        <Gift className="h-16 w-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-slate-600 mb-4">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); loadData(); }} className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl text-center py-16">
        <Gift className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Loyalty Rewards</h2>
        <p className="text-slate-600">Start using Paybacker to earn points and unlock rewards.</p>
      </div>
    );
  }

  const TierIcon = tierIcons[data.tier] || Star;
  const earnedBadgeIds = new Set(data.badges.map(b => b.badge_id));
  const nextTierIndex = tierOrder.indexOf(data.tier) + 1;
  const nextTier = nextTierIndex < tierOrder.length ? data.allTiers.find(t => t.key === tierOrder[nextTierIndex]) : null;
  const isMaxTier = !nextTier;
  const nonZeroEvents = data.recentEvents.filter(e => e.points !== 0);

  // Streak calendar: last 12 months
  const streakMonths = (() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-GB', { month: 'short' });
      months.push({ key, label });
    }
    return months;
  })();

  // Calculate which months were active from recent events
  const activeMonths = new Set<string>();
  data.recentEvents.forEach(e => {
    if (e.points > 0) {
      const d = new Date(e.created_at);
      activeMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  });

  return (
    <div className="max-w-4xl">
      {/* Success banner */}
      {redeemSuccess && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-medium flex items-center gap-2 animate-pulse">
          <Check className="h-4 w-4" /> {redeemSuccess}
        </div>
      )}

      {/* ═══ SECTION 1: Hero Stats Bar ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-2xl p-5 text-center" style={{ borderColor: data.tierInfo.color + '44' }}>
          <TierIcon className="h-8 w-8 mx-auto mb-2" style={{ color: data.tierInfo.color }} />
          <p className="text-lg font-bold text-slate-900">{data.tierInfo.label}</p>
          <p className="text-slate-500 text-xs">{data.tierInfo.multiplier}x points</p>
        </div>
        <div className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-5 text-center">
          <p className="text-4xl font-bold text-emerald-600">{data.balance.toLocaleString()}</p>
          <p className="text-slate-500 text-xs">Points balance</p>
        </div>
        <div className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-slate-700">{data.lifetime.toLocaleString()}</p>
          <p className="text-slate-500 text-xs">Lifetime earned</p>
        </div>
        <div className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-5 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="h-5 w-5 text-orange-400" />
            <p className="text-2xl font-bold text-orange-400">{data.currentStreak}</p>
          </div>
          <p className="text-slate-500 text-xs">{data.currentStreak === 1 ? 'Month' : 'Months'} streak</p>
        </div>
      </div>

      {/* ═══ SECTION 2: Tier Progress ═══ */}
      <div id="tiers" className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Tier Progress</h2>
        {isMaxTier ? (
          <div className="text-center py-4">
            <span className="text-4xl mb-3 block">💎</span>
            <p className="text-slate-900 font-bold text-lg">You have reached the highest tier</p>
            <p className="text-slate-600 text-sm mt-1">Thank you for being a loyal Paybacker member</p>
          </div>
        ) : nextTier && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{tierEmojis[data.tier]}</span>
                <span className="text-slate-900 font-semibold">{data.tierInfo.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{tierEmojis[nextTier.key]}</span>
                <span className="text-slate-900 font-semibold">{nextTier.label}</span>
              </div>
            </div>
            {/* Points progress bar */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Points: {data.lifetime.toLocaleString()} / {nextTier.minPoints.toLocaleString()}</span>
                <span>{Math.min(100, Math.round((data.lifetime / nextTier.minPoints) * 100))}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, (data.lifetime / nextTier.minPoints) * 100)}%` }} />
              </div>
            </div>
            <p className="text-slate-600 text-sm mt-3">
              {Math.max(0, nextTier.minPoints - data.lifetime).toLocaleString()} more points and {Math.max(0, nextTier.minMonths)} months membership to reach {nextTier.label}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {nextTier.perks.map((perk, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-full">{perk}</span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ SECTION 3: Redemptions ═══ */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Redeem Your Points</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.redemptionOptions.map((opt) => {
            const isLocked = !opt.canRedeem;
            const isRedeeming = redeemingId === opt.id;
            const pointsNeeded = Math.max(0, opt.points - data.balance);
            return (
              <div key={opt.id} className={`bg-white border rounded-2xl p-4 text-center transition-all ${isLocked ? 'border-slate-200/50 opacity-60' : 'border-mint-400/30 hover:border-mint-400/60'}`}>
                <span className="text-3xl block mb-2">{redemptionEmojis[opt.id] || '🎁'}</span>
                <p className="text-slate-900 font-semibold text-sm mb-1">{opt.label}</p>
                <p className="text-emerald-600 font-bold text-sm mb-2">{opt.points.toLocaleString()} pts</p>
                {isLocked ? (
                  <div>
                    <Lock className="h-4 w-4 text-slate-600 mx-auto mb-1" />
                    <p className="text-slate-500 text-[10px]">Need {pointsNeeded.toLocaleString()} more</p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`Redeem ${opt.points.toLocaleString()} points for ${opt.label}?`)) {
                        handleRedeem(opt.id);
                      }
                    }}
                    disabled={isRedeeming}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-navy-950 font-semibold px-3 py-1.5 rounded-lg text-xs transition-all w-full"
                  >
                    {isRedeeming ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Redeem'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 4: Badges Collection ═══ */}
      <div className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Badges</h2>
          <span className="text-slate-500 text-sm">{earnedBadgeIds.size} of {ALL_BADGES.length} earned</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {ALL_BADGES.map((badge) => {
            const earned = earnedBadgeIds.has(badge.id);
            const earnedData = data.badges.find(b => b.badge_id === badge.id);
            return (
              <a
                key={badge.id}
                href={earned ? '#' : badge.action}
                className={`rounded-xl p-3 text-center transition-all border ${earned
                  ? 'bg-emerald-50 border-emerald-200 hover:border-mint-400/40'
                  : 'bg-slate-50/50 border-slate-200/50 hover:border-slate-200/50 opacity-40'
                }`}
                title={earned ? `${badge.name} - earned ${earnedData ? new Date(earnedData.earned_at).toLocaleDateString('en-GB') : ''}` : badge.description}
              >
                <span className="text-2xl block mb-1">{earned ? badge.emoji : '🔒'}</span>
                <p className={`text-[10px] font-medium truncate ${earned ? 'text-slate-900' : 'text-slate-600'}`}>{badge.name}</p>
              </a>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 4B: Savings Challenges ═══ */}
      {challenges && (
        <div className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" /> Savings Challenges
            </h2>
            {challenges.completed.length > 0 && (
              <span className="text-slate-500 text-sm">{challenges.completed.length} completed</span>
            )}
          </div>

          {/* Active challenges */}
          {challenges.active.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Active</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {challenges.active.map((uc: any) => (
                  <ChallengeCard
                    key={uc.id}
                    challenge={{
                      id: uc.id,
                      name: uc.template?.name || 'Challenge',
                      description: uc.template?.description || null,
                      icon: uc.template?.icon || null,
                      type: uc.template?.type || 'action',
                      duration_days: uc.template?.duration_days || null,
                      reward_points: uc.template?.reward_points || 0,
                      difficulty: uc.template?.difficulty,
                      status: uc.status,
                      started_at: uc.started_at,
                      progressInfo: uc.progressInfo,
                    }}
                    mode="active"
                    onAbandon={async (challengeId) => {
                      await fetch('/api/challenges', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ challengeId, action: 'abandon' }),
                      });
                      loadChallenges();
                    }}
                    onComplete={async (challengeId) => {
                      await fetch('/api/challenges', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ challengeId, action: 'complete' }),
                      });
                      confetti({ particleCount: 60, spread: 80, origin: { y: 0.5 }, colors: ['#34d399', '#f59e0b', '#fbbf24'] });
                      loadChallenges();
                      loadData();
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Available challenges */}
          {challenges.available.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-3">Available</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {(showAllAvailable ? challenges.available : challenges.available.slice(0, 4)).map((t: any) => (
                  <ChallengeCard
                    key={t.id}
                    challenge={{
                      id: t.id,
                      name: t.name,
                      description: t.description,
                      icon: t.icon,
                      type: t.type,
                      duration_days: t.duration_days,
                      reward_points: t.reward_points,
                      difficulty: t.difficulty,
                    }}
                    mode="available"
                    onStart={async (templateId) => {
                      await fetch('/api/challenges', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ templateId }),
                      });
                      loadChallenges();
                    }}
                  />
                ))}
              </div>
              {challenges.available.length > 4 && (
                <button
                  onClick={() => setShowAllAvailable(!showAllAvailable)}
                  className="text-emerald-600 text-sm mt-3 flex items-center gap-1 hover:text-emerald-700 transition-all"
                >
                  {showAllAvailable ? <><ChevronUp className="h-4 w-4" /> Show fewer</> : <><ChevronDown className="h-4 w-4" /> Show all {challenges.available.length} challenges</>}
                </button>
              )}
            </div>
          )}

          {challenges.active.length === 0 && challenges.available.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">You have completed all available challenges. Check back soon for new ones!</p>
          )}
        </div>
      )}

      {/* ═══ SECTION 5: Streak Tracker ═══ */}
      <div id="streaks" className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400" /> Streak Tracker
        </h2>
        <div className="flex items-center justify-between gap-1 mb-4">
          {streakMonths.map((m) => {
            const isActive = activeMonths.has(m.key);
            return (
              <div key={m.key} className="flex-1 text-center">
                <div className={`w-6 h-6 mx-auto rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-100'}`} />
                <p className="text-[9px] text-slate-500 mt-1">{m.label}</p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Current: <strong className="text-orange-400">{data.currentStreak} month{data.currentStreak === 1 ? '' : 's'}</strong></span>
          <span className="text-slate-600">Longest: <strong className="text-slate-900">{data.longestStreak} month{data.longestStreak === 1 ? '' : 's'}</strong></span>
        </div>
        {data.currentStreak < 3 && (
          <p className="text-slate-500 text-xs mt-2">Reach a 3-month streak for +15 bonus points</p>
        )}
        {data.currentStreak >= 3 && data.currentStreak < 6 && (
          <p className="text-slate-500 text-xs mt-2">Reach a 6-month streak for +30 bonus points</p>
        )}
        {data.currentStreak >= 6 && data.currentStreak < 12 && (
          <p className="text-slate-500 text-xs mt-2">Reach a 12-month streak for +75 bonus points</p>
        )}
      </div>

      {/* ═══ SECTION 6: Referrals ═══ */}
      {referrals && (
        <div id="referrals" className="bg-gradient-to-r from-mint-400/10 to-mint-500/5 border border-emerald-200 rounded-2xl p-6 mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
            <Share2 className="h-5 w-5 text-emerald-600" /> Invite friends, both get 1 free month
          </h2>
          <p className="text-slate-600 text-sm mb-4">Share your link. When a friend signs up and subscribes, you both get 1 free month applied to your next bill automatically via Stripe. Plus 100 loyalty points when they join and 200 more when they upgrade.</p>

          <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-200/50 mb-4">
            <p className="text-slate-500 text-xs mb-2">Your referral link</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-emerald-600 text-sm bg-slate-900 rounded-lg px-3 py-2 font-mono truncate">{referrals.joinUrl}</code>
              <button onClick={handleCopyCode} className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-navy-950 font-semibold px-3 py-2 rounded-lg text-sm transition-all">
                {codeCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={handleWhatsAppShare} className="shrink-0 bg-green-600 hover:bg-green-700 text-slate-900 px-3 py-2 rounded-lg text-sm transition-all">
                WhatsApp
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-50/50 rounded-lg p-3 text-center border border-slate-200/50">
              <p className="text-slate-900 font-bold text-lg">{referrals.totalReferred}</p>
              <p className="text-slate-500 text-[10px]">Invited</p>
            </div>
            <div className="bg-slate-50/50 rounded-lg p-3 text-center border border-slate-200/50">
              <p className="text-slate-900 font-bold text-lg">{referrals.totalSignedUp}</p>
              <p className="text-slate-500 text-[10px]">Signed up</p>
            </div>
            <div className="bg-slate-50/50 rounded-lg p-3 text-center border border-slate-200/50">
              <p className="text-emerald-600 font-bold text-lg">{referrals.totalSubscribed}</p>
              <p className="text-slate-500 text-[10px]">Upgraded</p>
            </div>
          </div>

          {referrals.pendingUpgrades > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-200 rounded-lg p-3 text-emerald-600 text-sm">
              {referrals.pendingUpgrades} friend{referrals.pendingUpgrades > 1 ? 's have' : ' has'} signed up but not upgraded yet. When they subscribe, you both get 1 free month + 200 bonus points for you.
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-lg block">📤</span>
              <p className="text-slate-600 text-xs">Share your link</p>
            </div>
            <div>
              <span className="text-lg block">👥</span>
              <p className="text-slate-600 text-xs">Friend signs up free</p>
            </div>
            <div>
              <span className="text-lg block">💰</span>
              <p className="text-slate-600 text-xs">You both earn rewards</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SECTION 7: Points History ═══ */}
      {nonZeroEvents.length > 0 && (
        <div className="bg-white border border-slate-200/50 rounded-2xl shadow-sm p-6 mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Points History</h2>
          <div className="space-y-2">
            {(showAllHistory ? nonZeroEvents : nonZeroEvents.slice(0, 8)).map((event, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50/50 rounded-lg px-4 py-2.5 border border-slate-200/50">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm truncate">{event.description}</p>
                  <p className="text-slate-500 text-xs">
                    {new Date(event.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className={`font-bold text-sm shrink-0 ml-3 ${event.points >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {event.points >= 0 ? '+' : ''}{event.points}
                </span>
              </div>
            ))}
          </div>
          {nonZeroEvents.length > 8 && (
            <button onClick={() => setShowAllHistory(!showAllHistory)} className="text-emerald-600 text-sm mt-3 flex items-center gap-1 hover:text-emerald-700 transition-all">
              {showAllHistory ? <><ChevronUp className="h-4 w-4" /> Show less</> : <><ChevronDown className="h-4 w-4" /> View all activity</>}
            </button>
          )}
        </div>
      )}

      {/* ═══ SECTION 8: How Points Work (FAQ) ═══ */}
      <div id="earn" className="bg-white border border-slate-200/50 rounded-2xl mb-8 overflow-hidden">
        <button onClick={() => setShowFaq(!showFaq)} className="w-full flex items-center justify-between p-6 text-left">
          <h2 className="text-lg font-bold text-slate-900">How Points Work</h2>
          {showFaq ? <ChevronUp className="h-5 w-5 text-slate-600" /> : <ChevronDown className="h-5 w-5 text-slate-600" />}
        </button>

        {showFaq && (
          <div className="px-6 pb-6 space-y-6">
            {/* How to earn */}
            <div>
              <h3 className="text-slate-900 font-semibold mb-3">How to earn points</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {EARN_ACTIONS.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50/50 border border-slate-200/50">
                    <div className="flex items-center gap-2">
                      <span>{item.emoji}</span>
                      <span className="text-slate-700 text-xs">{item.action}</span>
                    </div>
                    <span className="text-emerald-600 font-bold text-xs">+{item.points}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* How tiers work */}
            <div>
              <h3 className="text-slate-900 font-semibold mb-3">How tiers work</h3>
              <p className="text-slate-600 text-sm mb-3">Tiers are based on both your membership duration and lifetime points earned. Higher tiers unlock better perks and a points multiplier.</p>
              <div className="space-y-2">
                {data.allTiers.map((t) => (
                  <div key={t.key} className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${t.isCurrent ? 'border-mint-400/50 bg-emerald-50' : 'border-slate-200/50 bg-slate-50/50'}`}>
                    <span>{tierEmojis[t.key]}</span>
                    <div className="flex-1">
                      <span className="text-slate-900 font-semibold text-sm">{t.label}</span>
                      <span className="text-slate-500 text-xs ml-2">
                        {t.minMonths === 0 ? 'From day one' : `${t.minMonths}+ months + ${t.minPoints.toLocaleString()}+ pts`}
                      </span>
                    </div>
                    <span className="text-emerald-600 text-xs font-bold">{t.multiplier}x</span>
                  </div>
                ))}
              </div>
            </div>

            {/* When points expire */}
            <div>
              <h3 className="text-slate-900 font-semibold mb-2">When do points expire?</h3>
              <p className="text-slate-600 text-sm">Your redeemable points balance resets to 0 if you do not earn any points for 365 days. Your lifetime earned total is preserved. We will send you a warning email 30 days before expiry.</p>
            </div>

            {/* How to redeem */}
            <div>
              <h3 className="text-slate-900 font-semibold mb-2">How do I redeem?</h3>
              <p className="text-slate-600 text-sm">Click the Redeem button on any reward above. Stripe discounts are applied automatically to your next invoice. Charity donations are batched monthly by Paybacker.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
