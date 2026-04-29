'use client';

/**
 * Native IAP upgrade buttons rendered inside the Capacitor app shell.
 *
 * Replaces the web Stripe/Pricing link with Apple-IAP-compliant native
 * purchase buttons. Cross-source check (CRITICAL): before rendering
 * buttons, fetches /api/subscription/active. If the user already has
 * an active non-IAP subscription (Stripe/web), shows a "manage on web"
 * panel instead — prevents the user from being charged twice.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { isNativeShell, nativeBridge, type NativePurchaseResult } from '@/lib/native-shell';
import { createClient } from '@supabase/supabase-js';

interface ActiveSub {
  source: 'stripe' | 'apple_iap' | 'google_play_billing';
  tier: 'free' | 'essential' | 'pro';
  billingPeriod: 'monthly' | 'annual';
  productId: string | null;
  status: string;
  expiresAt: string | null;
  autoRenew: boolean | null;
}

interface ActiveSubsResponse {
  ok: boolean;
  effectiveTier: 'free' | 'essential' | 'pro';
  primarySource: ActiveSub['source'] | null;
  trialActive: boolean;
  subscriptions: ActiveSub[];
}

const PRODUCTS = [
  { id: 'paybacker.essential.monthly', tier: 'essential', period: 'monthly', priceLabel: '£4.99/mo' },
  { id: 'paybacker.essential.annual',  tier: 'essential', period: 'annual',  priceLabel: '£44.99/yr' },
  { id: 'paybacker.pro.monthly',       tier: 'pro',       period: 'monthly', priceLabel: '£9.99/mo' },
  { id: 'paybacker.pro.annual',        tier: 'pro',       period: 'annual',  priceLabel: '£94.99/yr' },
] as const;

export default function NativeIapButtons({ onClose }: { onClose?: () => void }) {
  const [active, setActive] = useState<ActiveSubsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setError('Not signed in');
            setLoading(false);
          }
          return;
        }
        const res = await fetch('/api/subscription/active', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json()) as ActiveSubsResponse;
        if (!cancelled) {
          setActive(data);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Could not check subscription state');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handlePurchase(productId: string) {
    if (!isNativeShell()) {
      setError('Not in native shell — cannot purchase');
      return;
    }
    setError(null);
    setPurchasing(productId);
    try {
      const bridge = nativeBridge();
      if (!bridge.startPurchase) {
        throw new Error('Native bridge does not support purchase');
      }
      const result: NativePurchaseResult = await bridge.startPurchase(productId);
      if (result.ok) {
        location.reload();
      } else if (result.error === 'cancelled') {
        // silent
      } else {
        setError(result.message || `Purchase ${result.error}`);
      }
    } catch (err) {
      setError((err as Error).message || 'Purchase failed');
    } finally {
      setPurchasing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-mint-400" />
      </div>
    );
  }

  const externalSub = active?.subscriptions.find((s) => s.source !== 'apple_iap' && s.source !== 'google_play_billing');
  if (externalSub) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
        <Sparkles className="h-8 w-8 text-mint-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 mb-2">You&apos;re subscribed via the web</h3>
        <p className="text-sm text-slate-500 mb-4">
          Your <strong>{externalSub.tier}</strong> plan is managed on paybacker.co.uk.
          To change or cancel it, sign in there from a browser.
        </p>
        <a
          href="https://paybacker.co.uk/dashboard/billing"
          className="inline-flex items-center gap-2 text-mint-400 font-semibold text-sm"
        >
          Open paybacker.co.uk <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  const iapSub = active?.subscriptions.find((s) => s.source === 'apple_iap' || s.source === 'google_play_billing');
  if (iapSub) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
        <Sparkles className="h-8 w-8 text-mint-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          You&apos;re on {iapSub.tier} ({iapSub.billingPeriod})
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Manage or cancel your subscription in the App Store / Play Store.
        </p>
        <button
          onClick={() => isNativeShell() && nativeBridge().openManageSubscriptions?.()}
          className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-sm px-4 py-2 rounded-lg"
        >
          Manage subscription <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="text-center mb-5">
        <Sparkles className="h-8 w-8 text-mint-400 mx-auto mb-2" />
        <h3 className="text-lg font-bold text-slate-900">Choose your plan</h3>
        <p className="text-xs text-slate-500 mt-1">Cancel anytime in App Store settings</p>
      </div>

      <div className="grid gap-3">
        {PRODUCTS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePurchase(p.id)}
            disabled={purchasing !== null}
            className={`
              w-full flex items-center justify-between gap-4 p-4 rounded-xl border transition-all
              ${p.tier === 'pro'
                ? 'border-mint-400 bg-mint-400/5 hover:bg-mint-400/10'
                : 'border-slate-200 hover:bg-slate-50'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900 capitalize">{p.tier}</p>
              <p className="text-xs text-slate-500 capitalize">{p.period} billing</p>
            </div>
            <div className="text-right">
              {purchasing === p.id ? (
                <Loader2 className="h-5 w-5 animate-spin text-mint-400 ml-auto" />
              ) : (
                <p className="text-sm font-semibold text-slate-900">{p.priceLabel}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 text-xs text-red-600 text-center">{error}</div>
      )}

      {onClose && (
        <button
          onClick={onClose}
          className="mt-4 w-full text-slate-500 hover:text-slate-900 text-sm transition-colors"
        >
          Maybe later
        </button>
      )}
    </div>
  );
}
