'use client';

import { Loader2, X, Check, Clock, Zap } from 'lucide-react';
import { useState } from 'react';

interface ChallengeCardProps {
  challenge: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    type: 'spending' | 'action';
    duration_days: number | null;
    reward_points: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    status?: 'active' | 'completed' | 'failed' | 'abandoned';
    started_at?: string;
    progressInfo?: {
      status: string;
      progress: number;
      daysRemaining: number | null;
      message: string;
    } | null;
  };
  mode: 'available' | 'active' | 'completed';
  onStart?: (templateId: string) => Promise<void>;
  onAbandon?: (challengeId: string) => Promise<void>;
  onComplete?: (challengeId: string) => Promise<void>;
}

const difficultyColors: Record<string, string> = {
  easy: 'text-green-400 bg-green-400/10 border-green-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  hard: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export default function ChallengeCard({ challenge, mode, onStart, onAbandon, onComplete }: ChallengeCardProps) {
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
    } finally {
      setLoading(false);
    }
  };

  const progress = challenge.progressInfo?.progress || 0;
  const daysRemaining = challenge.progressInfo?.daysRemaining;
  const progressMessage = challenge.progressInfo?.message || '';

  // Determine status badge
  const statusBadge = () => {
    if (mode === 'completed' || challenge.progressInfo?.status === 'completed') {
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-400/10 text-green-400 border border-green-400/20">Completed</span>;
    }
    if (challenge.status === 'failed' || challenge.progressInfo?.status === 'failed') {
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">Failed</span>;
    }
    if (mode === 'active') {
      return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-mint-400/10 text-mint-400 border border-mint-400/20">Active</span>;
    }
    return null;
  };

  // Check if this is a manually completable action challenge
  const isManualComplete = mode === 'active' &&
    challenge.type === 'action' &&
    challenge.progressInfo?.status === 'active' &&
    challenge.progressInfo?.message?.includes('mark as complete');

  return (
    <div className={`bg-navy-900 border rounded-2xl p-5 transition-all ${
      mode === 'active' ? 'border-mint-400/30' :
      mode === 'completed' ? 'border-green-500/20' :
      'border-navy-700/50 hover:border-navy-600/50'
    }`}>
      {/* Header: icon + name + badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{challenge.icon || '🎯'}</span>
          <div>
            <h3 className="text-white font-semibold text-sm leading-tight">{challenge.name}</h3>
            {challenge.difficulty && mode === 'available' && (
              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border mt-1 ${difficultyColors[challenge.difficulty]}`}>
                {challenge.difficulty}
              </span>
            )}
          </div>
        </div>
        {statusBadge()}
      </div>

      {/* Description */}
      {challenge.description && (
        <p className="text-slate-400 text-xs mb-3 leading-relaxed">{challenge.description}</p>
      )}

      {/* Active spending challenge: progress bar */}
      {mode === 'active' && challenge.type === 'spending' && challenge.duration_days && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span>{progressMessage}</span>
            {daysRemaining != null && daysRemaining > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {daysRemaining}d left
              </span>
            )}
          </div>
          <div className="h-1.5 bg-navy-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                challenge.progressInfo?.status === 'failed' ? 'bg-red-400' : 'bg-mint-400'
              }`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Active action challenge: status message */}
      {mode === 'active' && challenge.type === 'action' && progressMessage && (
        <p className="text-slate-500 text-[11px] mb-3 flex items-center gap-1">
          <Zap className="h-3 w-3 text-mint-400" />
          {progressMessage}
        </p>
      )}

      {/* Duration + reward info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {challenge.type === 'spending' && challenge.duration_days && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {challenge.duration_days} days
            </span>
          )}
          {challenge.type === 'action' && (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" />
              One-time action
            </span>
          )}
        </div>
        <span className="text-mint-400 font-bold text-xs">+{challenge.reward_points} pts</span>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2">
        {/* Start button for available challenges */}
        {mode === 'available' && onStart && (
          <button
            onClick={() => handleAction(() => onStart(challenge.id))}
            disabled={loading}
            className="flex-1 bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold px-4 py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Start Challenge'}
          </button>
        )}

        {/* Manual complete button for review_subscriptions type */}
        {isManualComplete && onComplete && (
          <button
            onClick={() => handleAction(() => onComplete(challenge.id))}
            disabled={loading}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3" /> Mark Complete</>}
          </button>
        )}

        {/* Abandon button for active challenges */}
        {mode === 'active' && onAbandon && challenge.progressInfo?.status !== 'failed' && challenge.progressInfo?.status !== 'completed' && (
          <button
            onClick={() => {
              if (confirm('Are you sure you want to abandon this challenge? You will not earn any points.')) {
                handleAction(() => onAbandon(challenge.id));
              }
            }}
            disabled={loading}
            className="text-slate-600 hover:text-red-400 transition-all p-1.5 rounded-lg hover:bg-red-400/10"
            title="Abandon challenge"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
