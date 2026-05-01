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

type CrossSourceCheck = {
  hasActive: boolean;
  source?: 'stripe' | 'apple_iap' | 'google_iap';
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
        // Fire both lookups in parallel
        const [productsResp, crossResp] = await Promise.all([
          plugin.getProducts(),
          fetch('/api/subscription/active', { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : { hasActive: false }))
            .catch(() => ({ hasActive: false })),
        ]);
        if (cancelled) return;
        setProducts(productsResp.products);
        setCrossSource(crossResp as CrossSourceCheck);
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
            source: getPlatform() === 'ios' ? 'apple_iap' : 'google_iap',
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
  if (crossSource?.hasActive && (crossSource.source === 'apple_iap' || crossSource.source === 'google_iap')) {
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
