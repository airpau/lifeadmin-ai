'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type LoaderCaption = { icon: string; text: string };

/**
 * Default captions used when a caller doesn't provide their own set.
 * Tuned to be reassuring + funny-ish — the point is to let the user know
 * something is happening so they don't think the app has frozen.
 */
export const DEFAULT_LOADER_CAPTIONS: LoaderCaption[] = [
  { icon: '🔎', text: 'Peering into your inbox...' },
  { icon: '🧾', text: 'Reading the small print so you don\u2019t have to...' },
  { icon: '💷', text: 'Sniffing out overpayments...' },
  { icon: '📬', text: 'Cross-checking subscriptions vs transactions...' },
  { icon: '🧠', text: 'Putting two and two together...' },
  { icon: '✨', text: 'Almost there \u2014 lining up the results...' },
];

interface RotatingCaptionsLoaderProps {
  /**
   * Whether the loader should be visible + animating. When false the component
   * renders nothing. This makes it easy to drop inline next to a button.
   */
  active: boolean;

  /**
   * Optional custom caption deck. Defaults to DEFAULT_LOADER_CAPTIONS.
   * Must have at least one entry.
   */
  captions?: LoaderCaption[];

  /**
   * Milliseconds between caption changes. Defaults to 3500ms to match the
   * complaints follow-up loader.
   */
  intervalMs?: number;

  /**
   * Visual style. `inline` is a compact single-line loader suitable for
   * placing under a button. `card` is a more prominent centered card
   * (used for primary loading states like generating a letter).
   */
  variant?: 'inline' | 'card';

  /**
   * Optional heading shown above the rotating caption (card variant only).
   */
  heading?: string;

  /**
   * Extra classnames passed to the outer wrapper.
   */
  className?: string;
}

/**
 * RotatingCaptionsLoader
 *
 * Shared loading UI used wherever the user has to wait for a slow operation
 * (email scans, AI letter generation, bank sync, etc.). Cycles through a set
 * of short captions so the user always feels something is happening.
 *
 * Usage:
 *   <RotatingCaptionsLoader active={scanning} variant="inline" />
 *   <RotatingCaptionsLoader active={generating} variant="card" heading="Drafting your letter" />
 */
export default function RotatingCaptionsLoader({
  active,
  captions = DEFAULT_LOADER_CAPTIONS,
  intervalMs = 3500,
  variant = 'inline',
  heading,
  className,
}: RotatingCaptionsLoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    setIndex(0);
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % captions.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, captions.length, intervalMs]);

  if (!active) return null;
  const current = captions[index % captions.length];

  if (variant === 'card') {
    return (
      <div
        className={
          'rounded-xl border border-white/10 bg-navy-800/50 p-5 flex flex-col items-center text-center gap-3 ' +
          (className || '')
        }
      >
        <Loader2 className="h-6 w-6 text-mint-400 animate-spin" />
        {heading && (
          <p className="text-white font-semibold text-sm">{heading}</p>
        )}
        <p className="text-white/80 text-sm flex items-center gap-2">
          <span className="text-base" aria-hidden>
            {current.icon}
          </span>
          <span>{current.text}</span>
        </p>
      </div>
    );
  }

  // inline variant
  return (
    <div
      className={
        'flex items-center gap-2 text-sm text-white/80 ' + (className || '')
      }
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 text-mint-400 animate-spin" />
      <span className="text-base" aria-hidden>
        {current.icon}
      </span>
      <span>{current.text}</span>
    </div>
  );
}
