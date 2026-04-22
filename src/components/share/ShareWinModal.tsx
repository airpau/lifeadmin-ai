'use client';

import { useState } from 'react';
import { X, Share2, Check } from 'lucide-react';
import { markShared } from '@/lib/share-triggers';

interface ShareWinModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  type: 'complaint' | 'cancellation' | 'deal';
  providerName: string;
  referralCode?: string;
}

export default function ShareWinModal({
  open,
  onClose,
  amount,
  type,
  providerName,
  referralCode,
}: ShareWinModalProps) {
  const [shared, setShared] = useState(false);

  if (!open) return null;

  const refUrl = referralCode
    ? `https://paybacker.co.uk/?ref=${referralCode}`
    : 'https://paybacker.co.uk';

  const shareTexts: Record<typeof type, string> = {
    complaint: `I just got \u00a3${amount} back from ${providerName} using @PaybackerUK. Free AI complaint letters citing UK law. Try it: ${refUrl}`,
    cancellation: `Just cancelled ${providerName} and I'll save \u00a3${amount}/year. @PaybackerUK found it was draining my account. ${refUrl}`,
    deal: `Switched my ${providerName} and saving \u00a3${amount}/year with @PaybackerUK. ${refUrl}`,
  };

  const text = shareTexts[type];

  const handleShare = async (platform: string) => {
    markShared();
    setShared(true);

    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(refUrl);

    const urls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      whatsapp: `https://wa.me/?text=${encodedText}`,
    };

    if (platform === 'clipboard') {
      navigator.clipboard.writeText(text);
      return;
    }

    window.open(urls[platform], '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-md shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 transition-all"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-mint-400/10 w-10 h-10 rounded-xl flex items-center justify-center">
              <Share2 className="h-5 w-5 text-mint-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Share your win</h2>
          </div>

          {/* Card preview */}
          <div className="bg-gradient-to-br from-navy-950 to-navy-800 border border-mint-400/30 rounded-xl p-5 mb-6">
            <p className="text-mint-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Paybacker
            </p>
            <p className="text-2xl font-bold text-slate-900 mb-1">
              I just saved {'\u00a3'}{amount}
            </p>
            <p className="text-slate-500 text-sm">
              {type === 'complaint' && `Got money back from ${providerName}`}
              {type === 'cancellation' && `Cancelled ${providerName} -- saving ${'\u00a3'}${amount}/year`}
              {type === 'deal' && `Switched ${providerName} -- saving ${'\u00a3'}${amount}/year`}
            </p>
          </div>

          {/* Share buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleShare('twitter')}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-100 text-slate-900 py-3 rounded-lg transition-all text-sm font-medium"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              X / Twitter
            </button>
            <button
              onClick={() => handleShare('facebook')}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-100 text-slate-900 py-3 rounded-lg transition-all text-sm font-medium"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </button>
            <button
              onClick={() => handleShare('whatsapp')}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-100 text-slate-900 py-3 rounded-lg transition-all text-sm font-medium"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </button>
            <button
              onClick={() => handleShare('clipboard')}
              className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-100 text-slate-900 py-3 rounded-lg transition-all text-sm font-medium"
            >
              {shared ? (
                <Check className="h-4 w-4 text-mint-400" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
              {shared ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <p className="text-center text-slate-500 text-xs mt-4">
            When someone signs up using your link, you both get 1 free month.
          </p>
        </div>
      </div>
    </div>
  );
}
