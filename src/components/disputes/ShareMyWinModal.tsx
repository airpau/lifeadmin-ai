'use client';

/**
 * ShareMyWinModal
 *
 * Opens from the "🎉 Share My Win" button on a resolved-won dispute,
 * or auto-opens when the disputes page is loaded with ?share=win.
 *
 * Fetches anonymised share copy from /api/disputes/[id]/share-card and
 * fires /api/disputes/[id]/share-log when the user clicks a platform.
 */

import { useEffect, useState } from 'react';
import { X, Copy, Check, Loader2 } from 'lucide-react';

type Platform = 'twitter' | 'whatsapp' | 'linkedin' | 'facebook' | 'copy';

interface ShareCard {
  disputeId: string;
  noun: string;
  amountText: string | null;
  timeWindow: string | null;
  shareUrl: string;
  tweetCopy: string;
  bodyCopy: string;
  urls: {
    twitter: string;
    whatsapp: string;
    linkedin: string;
    facebook: string;
  };
}

export default function ShareMyWinModal({
  disputeId,
  open,
  onClose,
}: {
  disputeId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [card, setCard] = useState<ShareCard | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch(`/api/disputes/${disputeId}/share-card`, { cache: 'no-store' })
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Failed to load share card (${res.status})`);
        }
        const data: ShareCard = await res.json();
        setCard(data);
        setDraft(data.tweetCopy);
      })
      .catch((e: Error) => {
        if (!aborted) setError(e.message);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => { aborted = true; };
  }, [disputeId, open]);

  const logShare = (platform: Platform) => {
    fetch(`/api/disputes/${disputeId}/share-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    }).catch(() => {});
  };

  const buildUrl = (platform: 'twitter' | 'whatsapp' | 'linkedin' | 'facebook'): string => {
    if (!card) return '#';
    if (platform === 'twitter') {
      return `https://twitter.com/intent/tweet?${new URLSearchParams({ text: draft }).toString()}`;
    }
    if (platform === 'whatsapp') {
      return `https://wa.me/?${new URLSearchParams({ text: `${draft} ${card.shareUrl}` }).toString()}`;
    }
    if (platform === 'linkedin') {
      return `https://www.linkedin.com/sharing/share-offsite/?${new URLSearchParams({
        url: card.shareUrl,
        summary: draft.length > 240 ? draft : card.bodyCopy,
      }).toString()}`;
    }
    return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({
      u: card.shareUrl,
      quote: draft.length > 240 ? draft : card.bodyCopy,
    }).toString()}`;
  };

  const handlePlatform = (platform: 'twitter' | 'whatsapp' | 'linkedin' | 'facebook') => {
    logShare(platform);
    window.open(buildUrl(platform), '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      logShare('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not access clipboard.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl border"
        style={{ background: '#0a1628', borderColor: 'rgba(52,211,153,0.35)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/70 hover:text-white transition-all p-1"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          <div className="text-center mb-5">
            <p className="text-5xl mb-2">🎉</p>
            <h2 className="text-3xl font-bold" style={{ color: '#34d399' }}>You won!</h2>
            {card?.amountText && (
              <p className="text-white/80 text-sm mt-1">
                {card.amountText} back from your {card.noun}
                {card.timeWindow ? ` ${card.timeWindow}` : ''}.
              </p>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6 text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {card && !loading && (
            <>
              <label className="block text-xs uppercase tracking-wide text-white/60 mb-2 font-semibold">
                Edit before posting
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="w-full rounded-lg p-3 text-sm mb-4 focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePlatform('twitter')}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: '#34d399', color: '#0a1628' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  X / Twitter
                </button>
                <button
                  onClick={() => handlePlatform('whatsapp')}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: '#34d399', color: '#0a1628' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </button>
                <button
                  onClick={() => handlePlatform('linkedin')}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.35)' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                  LinkedIn
                </button>
                <button
                  onClick={() => handlePlatform('facebook')}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.35)' }}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                </button>
              </div>

              <button
                onClick={handleCopy}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {copied ? <Check className="h-4 w-4" style={{ color: '#34d399' }} /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy text'}
              </button>

              <p className="text-center text-xs text-white/40 mt-4">
                The copy never names your provider. Edit freely before posting.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
