'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import {
  getIapPlugin,
  getPlatform,
  type IapProduct,
  type IapProductId,
  type IapPurchaseResult,
} from '@/lib/native-shell';
import { createClient } from '@/lib/supabase/client';

/**
 * Native IAP buttons — rendered inside the Capacitor shell only.
 *
 * Loads the 4 subscription products from the device store (Apple or Google)
 * and exposes Buy / Restore / Manage Subscriptions buttons. Each purchase
 * triggers Apple's native Face ID / Touch ID sheet (or Google Play sheet
 * on Android), and on success the plugin POSTs the JWS receipt to
 * /api/iap/verify before resolving.
 *
 * Cross-source guard: before showing a purchase button we hit
 * /api/subscription/active to check whether the user already has an active
 * subscription via Stripe (web) — if so, we render an "Already subscribed"
 * notice instead of risking a double-charge.
 */

/**
 * Subset of /api/subscription/active's response that the guard cares
 * about. Full shape is documented at the route handler — keep these
 * field names in sync if the API shape changes.
 */
type SubscriptionActiveResponse = {
  ok: boolean;
  effectiveTier?: 'free' | 'essential' | 'pro';
  primarySource?: 'stripe' | 'apple_iap' | 'google_play_billing' | null;
  trialActive?: boolean;
  subscriptions?: Array<{
    source: string;
    tier: string;
    status: string;
    expiresAt: string | null;
  }>;
};

type CrossSourceCheck = {
  hasActive: boolean;
  source?: 'stripe' | 'apple_iap' | 'google_play_billing';
  tier?: 'free' | 'essential' | 'pro';
};

const TIER_DISPLAY: Record<IapProductId, { tier: 'essential' | 'pro'; period: 'month' | 'year' }> = {
  'paybacker.essential.monthly': { tier: 'essential', period: 'month' },
  'paybacker.essential.annual': { tier: 'essential', period: 'year' },
  'paybacker.pro.monthly': { tier: 'pro', period: 'month' },
  'paybacker.pro.annual': { tier: 'pro', period: 'year' },
};

export default function NativeIapButtons() {
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<IapProductId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crossSource, setCrossSource] = useState<CrossSourceCheck | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const plugin = getIapPlugin();
      if (!plugin) {
        if (!cancelled) {
          setError('Native IAP plugin not available on this platform.');
          setLoading(false);
        }
        return;
      }

      try {
        // /api/subscription/active requires Bearer auth (it's the same
        // endpoint the iOS app calls, and that path uses Supabase
        // access tokens, not cookies). Without the header we'd hit 401
        // and the guard would silently fail-open — meaning a user with
        // an active Stripe subscription could buy again on iOS and be
        // double-charged. Pull the access token from the browser
        // Supabase session before the fetch.
        const supabase = createClient();
        const sessionRes = await supabase.auth.getSession();
        const accessToken = sessionRes.data.session?.access_token;

        const guardFetch = (async (): Promise<CrossSourceCheck> => {
          if (!accessToken) {
            // Logged-out / unknown user — IAP shouldn't surface here
            // anyway (the page is gated upstream), but be conservative
            // and treat as "no active sub elsewhere" rather than
            // blocking purchase.
            return { hasActive: false };
          }
          try {
            const r = await fetch('/api/subscription/active', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!r.ok) return { hasActive: false };
            const data = (await r.json()) as SubscriptionActiveResponse;
            const subs = Array.isArray(data.subscriptions) ? data.subscriptions : [];
            // We only block IAP when the user already has a NON-IAP
            // active subscription — i.e. Stripe-on-web. An existing
            // apple_iap/google_play sub means "tap Restore", not
            // "you'll be double-charged".
            const blocking = subs.find(
              (s) =>
                s.status !== 'expired' &&
                s.source !== 'apple_iap' &&
                s.source !== 'google_play_billing',
            );
            if (!blocking) return { hasActive: false };
            return {
              hasActive: true,
              source: blocking.source as CrossSourceCheck['source'],
              tier: data.effectiveTier ?? (blocking.tier as CrossSourceCheck['tier']),
            };
          } catch {
            // Conservative default: don't block purchase on a network
            // hiccup. The /verify call after a successful purchase
            // catches double-pay server-side via iap_source_tracking.
            return { hasActive: false };
          }
        })();

        // Fire both lookups in parallel
        const [productsResp, crossResp] = await Promise.all([
          plugin.getProducts(),
          guardFetch,
        ]);
        if (cancelled) return;
        setProducts(productsResp.products);
        setCrossSource(crossResp);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePurchase(productId: IapProductId) {
    const plugin = getIapPlugin();
    if (!plugin) return;
    setError(null);
    setSuccessMessage(null);
    setPurchasingId(productId);
    try {
      const result: IapPurchaseResult = await plugin.purchase({ productId });
      switch (result.state) {
        case 'success':
          setSuccessMessage('Subscription active. Welcome to ' + TIER_DISPLAY[productId].tier + '.');
          // Refresh the cross-source state so the UI re-renders the upgraded tier
          setCrossSource({
            hasActive: true,
            source: getPlatform() === 'ios' ? 'apple_iap' : 'google_play_billing',
            tier: TIER_DISPLAY[productId].tier,
          });
          // Trigger any parent listener (e.g. close the modal)
          window.dispatchEvent(new CustomEvent('paybacker:iap-purchased', { detail: { productId } }));
          break;
        case 'pending_server_verify':
          setError(
            "Purchase succeeded but we couldn't confirm with our servers. We'll retry automatically — check back in a minute."
          );
          break;
        case 'pending':
          setSuccessMessage('Purchase awaiting approval (Family Sharing or bank verification).');
          break;
        case 'cancelled':
          // Silent — user dismissed the sheet
          break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestore() {
    const plugin = getIapPlugin();
    if (!plugin) return;
    setError(null);
    setSuccessMessage(null);
    setRestoring(true);
    try {
      const { restored } = await plugin.restorePurchases();
      if (restored.length === 0) {
        setError('No previous purchases found on this Apple ID.');
      } else {
        setSuccessMessage(`Restored ${restored.length} purchase${restored.length > 1 ? 's' : ''}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  async function handleManage() {
    const plugin = getIapPlugin();
    if (!plugin) return;
    try {
      await plugin.openManageSubscriptions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open subscription management');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-mint-400" />
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-700">
        <AlertCircle className="h-4 w-4 inline mr-2" />
        {error}
      </div>
    );
  }

  // Cross-source guard: user already paying via Stripe
  if (crossSource?.hasActive && crossSource.source === 'stripe') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">You&apos;re already subscribed via the web</p>
        <p>
          You currently have an active {crossSource.tier} subscription paid through paybacker.co.uk. To
          avoid being charged twice, please cancel your web subscription before subscribing through the
          App Store.
        </p>
      </div>
    );
  }

  // Already subscribed via the same store — show manage instead
  if (crossSource?.hasActive && (crossSource.source === 'apple_iap' || crossSource.source === 'google_play_billing')) {
    return (
      <div className="space-y-3">
        <div className="bg-mint-400/10 border border-mint-400/20 rounded-xl p-4 text-sm text-slate-900">
          <p className="font-semibold mb-1">
            You&apos;re subscribed to {crossSource.tier === 'pro' ? 'Pro' : 'Essential'}
          </p>
          <p className="text-slate-600">Manage or cancel your subscription via the App Store.</p>
        </div>
        <button
          onClick={handleManage}
          className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold rounded-xl transition-all"
        >
          Manage subscription
        </button>
      </div>
    );
  }

  // Order: Pro Annual, Pro Monthly, Essential Annual, Essential Monthly
  const sortedProducts = [...products].sort((a, b) => {
    const order: IapProductId[] = [
      'paybacker.pro.annual',
      'paybacker.pro.monthly',
      'paybacker.essential.annual',
      'paybacker.essential.monthly',
    ];
    return order.indexOf(a.id as IapProductId) - order.indexOf(b.id as IapProductId);
  });

  return (
    <div className="space-y-3">
      {successMessage && (
        <div className="bg-mint-400/10 border border-mint-400/20 rounded-xl p-3 text-sm text-slate-900">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {error}
        </div>
      )}
      {sortedProducts.map((product) => {
        const meta = TIER_DISPLAY[product.id as IapProductId];
        if (!meta) return null;
        const isPurchasing = purchasingId === product.id;
        const isPro = meta.tier === 'pro';
        return (
          <button
            key={product.id}
            onClick={() => handlePurchase(product.id as IapProductId)}
            disabled={isPurchasing}
            className={`w-full py-4 px-4 rounded-xl font-bold transition-all text-left flex items-center justify-between ${
              isPro
                ? 'bg-mint-400 hover:bg-mint-500 text-navy-950 disabled:bg-mint-400/50'
                : 'bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 disabled:bg-slate-100'
            }`}
          >
            <span className="flex items-center gap-2">
              {isPro && <Sparkles className="h-4 w-4" />}
              <span className="flex flex-col items-start">
                <span>{product.displayName}</span>
                <span className="text-xs font-normal opacity-70">
                  {meta.period === 'year' ? 'Best value — billed annually' : 'Billed monthly'}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span>{product.displayPrice}</span>
              {isPurchasing && <Loader2 className="h-4 w-4 animate-spin" />}
            </span>
          </button>
        );
      })}

      <div className="pt-2 flex flex-col gap-2 border-t border-slate-200">
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors py-2"
        >
          {restoring ? 'Restoring…' : 'Restore previous purchases'}
        </button>
      </div>

      <p className="text-xs text-slate-400 text-center pt-2">
        Subscriptions auto-renew unless cancelled at least 24 hours before the period ends. Manage or
        cancel anytime via the App Store.
      </p>
    </div>
  );
}
