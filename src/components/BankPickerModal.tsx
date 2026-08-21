'use client';

import { useState } from 'react';
import { X, Loader2, ShieldCheck, Eye, Ban, ArrowRight } from 'lucide-react';

/**
 * Bank connection hand-off.
 *
 * Rewritten 2026-08-21. This used to fetch /api/yapily/institutions and
 * render our own searchable bank list. Migle Ivanauskaite (Yapily)
 * pointed out we don't need to: omit `institutionId` from the Hosted
 * Pages payload and Yapily renders the picker themselves, filtered to
 * the country code we send.
 *
 * Deleting our list is a real improvement, not just less code:
 *
 *   • Our list came from a cached GET /institutions. When that cache
 *     was stale it could offer a bank Yapily would then refuse, and the
 *     user would only find out after clicking through.
 *   • Yapily's picker reflects live coverage, including banks enabled on
 *     the application after our cache was warmed.
 *   • Bank logos, search, and accessibility are Yapily's problem now,
 *     and they maintain it against every institution they support.
 *
 * What's left here is the part that IS ours: telling the person what
 * they're about to agree to, in our voice, before we hand them over.
 * The component's props are unchanged so existing call sites compile
 * untouched.
 */

interface BankPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Legacy export kept so existing onClick handlers compile without
 * change. Returns false to mean "open the modal — there is no direct
 * redirect path".
 */
export function connectBankDirect() {
  return false;
}

const ASSURANCES = [
  {
    Icon: Eye,
    title: 'Read-only',
    body: 'We can see your transactions. We can never move money.',
  },
  {
    Icon: Ban,
    title: 'No credentials',
    body: 'You log in at your bank, not here. We never see your password.',
  },
  {
    Icon: ShieldCheck,
    title: 'Revocable anytime',
    body: 'Disconnect from your dashboard, and your data is deleted.',
  },
];

export default function BankPickerModal({ isOpen, onClose }: BankPickerModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      // No institutionId — that omission is what makes Yapily show its
      // own bank list. See src/app/api/auth/yapily/route.ts.
      const returnTo = encodeURIComponent(window.location.pathname);
      const res = await fetch(`/api/auth/yapily?returnTo=${returnTo}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setConnecting(false);
        return;
      }

      const url = data.hostedUrl || data.authorisationUrl;
      if (!url) {
        setError('Could not start the bank connection. Please try again.');
        setConnecting(false);
        return;
      }

      // Top-level navigation, never an iframe — banks block framing and
      // Yapily's hosted pages require a full-page redirect.
      window.location.href = url;
    } catch {
      setError('Failed to start bank connection. Please check your connection and try again.');
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div className="pr-4">
            <h2 className="text-lg font-bold text-slate-900">Connect your bank</h2>
            <p className="text-slate-500 text-sm mt-0.5">
              You&apos;ll pick your bank on the next screen and approve access with them
              directly.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900 p-1 -mt-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* What they're agreeing to */}
        <div className="p-5 space-y-4">
          {ASSURANCES.map(({ Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                <Icon className="h-4 w-4 text-emerald-600" />
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-900">{title}</span>
                <span className="block text-xs text-slate-500">{body}</span>
              </span>
            </div>
          ))}

          {error && (
            <div
              role="alert"
              className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm"
            >
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Taking you to your bank...
              </>
            ) : (
              <>
                Choose your bank
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex-shrink-0">
          <p className="text-xs text-slate-500 text-center">
            Open Banking, FCA regulated via Yapily. Read-only access. We never store your
            bank credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
