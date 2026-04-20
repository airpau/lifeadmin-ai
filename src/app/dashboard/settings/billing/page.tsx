'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CreditCard, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface BillingProfile {
  subscription_tier: string | null;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
}

export default function BillingSettingsPage() {
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [syncedTier, setSyncedTier] = useState<string | null>(null);
  // Track the synced subscription status too — otherwise isActive is
  // computed from pre-sync profile.subscription_status and paid controls
  // hide for a user whose Stripe sync just moved them from incomplete →
  // active (e.g. immediately after checkout).
  const [syncedStatus, setSyncedStatus] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Memoise the Supabase client so its reference is stable. Calling
  // createClient() in the render body produced a new instance every
  // render, and the effect below depended on it — meaning each setState
  // (setProfile, setSyncedTier, setRenewalDate, setLoading) retriggered
  // the effect, which re-POSTed /api/stripe/sync, ad infinitum.
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_status, stripe_subscription_id, stripe_customer_id')
        .eq('id', user.id)
        .single();

      setProfile(data || null);

      // Sync from Stripe
      try {
        const res = await fetch('/api/stripe/sync', { method: 'POST' });
        const syncData = await res.json();
        if (syncData.tier) setSyncedTier(syncData.tier);
        if (syncData.status) setSyncedStatus(syncData.status);
        if (syncData.currentPeriodEnd) {
          setRenewalDate(new Date(syncData.currentPeriodEnd).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          }));
        }
      } catch {}

      if (searchParams.get('billing') === 'updated') {
        setSuccessMessage('Your subscription has been updated.');
        setTimeout(() => setSuccessMessage(null), 5000);
      }

      setLoading(false);
    };
    init();
    // Init-on-mount only. supabase is memoised (stable) and searchParams
    // is only read once here; we deliberately omit both to avoid the
    // infinite sync-loop flagged in the Codex review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalError(data.error || 'Could not open billing portal. Please try again or contact support@paybacker.co.uk');
        setPortalLoading(false);
      }
    } catch {
      setPortalError('Failed to open billing portal. Please contact support@paybacker.co.uk');
      setPortalLoading(false);
    }
  };

  const effectiveTier = syncedTier || profile?.subscription_tier || 'free';
  // Prefer the freshly-synced status from Stripe over the cached profile
  // value. This matters right after checkout where profile.subscription_status
  // may still be "incomplete" while Stripe has already flipped to "active".
  const effectiveStatus = syncedStatus || profile?.subscription_status || '';
  const isActive = ['active', 'trialing'].includes(effectiveStatus);
  // Portal actions require a Stripe customer — the /api/stripe/portal
  // endpoint returns 400 without one. Users flagged trialing/active by
  // internal mechanisms (manual grants, imported legacy accounts) must
  // see the subscribe CTA rather than a broken Manage/Cancel button.
  const hasStripeCustomer = Boolean(profile?.stripe_customer_id);
  const hasPaidPlan = effectiveTier !== 'free' && isActive && hasStripeCustomer;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-mint-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <Link href="/dashboard/profile" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-4 transition-all">
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </Link>
        <h1 className="text-3xl font-bold text-white font-[family-name:var(--font-heading)]">Billing & Subscription</h1>
        <p className="text-slate-400 mt-1">Manage your plan, payment method, and cancellation.</p>
      </div>

      {successMessage && (
        <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      {/* Current Plan */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Current Plan</h2>

        <div className="flex items-center justify-between p-4 bg-navy-950/50 rounded-xl border border-navy-700/50 mb-4">
          <div>
            <p className="text-white font-semibold capitalize">
              {effectiveTier === 'free' ? 'Free Plan' : `${effectiveTier.charAt(0).toUpperCase()}${effectiveTier.slice(1)} Plan`}
            </p>
            {hasPaidPlan && (
              <p className="text-sm text-slate-400 mt-0.5">
                {effectiveTier === 'essential' ? '£4.99/month' : '£9.99/month'}
              </p>
            )}
            {renewalDate && hasPaidPlan && (
              <p className="text-xs text-slate-500 mt-1">Renews {renewalDate}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            effectiveTier === 'pro'
              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
              : effectiveTier === 'essential'
              ? 'bg-mint-400/10 text-mint-400 border-mint-400/30'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
          }`}>
            {effectiveTier === 'free' ? 'Free' : effectiveTier === 'pro' ? 'Pro' : 'Essential'}
          </span>
        </div>

        {hasPaidPlan ? (
          <div className="space-y-3">
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="w-full inline-flex items-center justify-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-5 py-3 rounded-xl transition-all disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              {portalLoading ? 'Opening portal...' : 'Manage Subscription'}
            </button>

            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="w-full inline-flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-red-400 hover:text-red-300 font-semibold px-5 py-3 rounded-xl transition-all border border-red-900/30 disabled:opacity-50"
            >
              {portalLoading ? 'Opening portal...' : 'Cancel Subscription'}
            </button>

            {portalError && (
              <p className="text-xs text-red-400 text-center">{portalError}</p>
            )}

            <p className="text-xs text-slate-500 text-center">
              The billing portal lets you change plan, update payment method, or cancel. You keep access until the end of your billing period.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">
              You are on the Free plan. Upgrade to get unlimited letters, daily bank sync, and full Money Hub access.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-5 py-2.5 rounded-xl transition-all text-sm"
            >
              View Plans & Upgrade
            </Link>
          </div>
        )}
      </div>

      {/* Billing info */}
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-slate-400" />
          Billing information
        </h2>
        <ul className="space-y-2 text-sm text-slate-400">
          <li>Payments are processed securely by Stripe.</li>
          <li>Subscriptions renew automatically. Cancel before your renewal date to avoid being charged.</li>
          <li>After cancellation, you keep access until the end of your current billing period.</li>
          <li>Need help? Email <a href="mailto:support@paybacker.co.uk" className="text-mint-400 hover:underline">support@paybacker.co.uk</a></li>
        </ul>
      </div>
    </div>
  );
}
