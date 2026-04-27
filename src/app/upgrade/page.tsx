/**
 * /upgrade?plan=pro&cycle=monthly
 *
 * Stripe-Checkout-style in-app upgrade confirmation page.
 *
 * Background — bug fixed 2026-04-27
 * ---------------------------------
 * The pricing page used to call /api/stripe/checkout the moment a
 * logged-in user clicked "Upgrade". For users with an existing sub,
 * that route silently called Stripe's `subscriptions.update` with
 * `proration_behavior=always_invoice`, which charges the saved card
 * IMMEDIATELY. Paul was charged £4.97 without ever seeing a price,
 * a card, or a confirm button. window.confirm in PricingCTA helps,
 * but it's a browser-native dialog — it doesn't show the card on
 * file or itemise the proration credit, which is exactly the
 * information a normal Stripe Checkout page would display.
 *
 * This page replaces that dialog. The flow is:
 *
 *   1. Logged-in user clicks "Upgrade" on /pricing.
 *   2. PricingCTA routes them to /upgrade?plan=pro&cycle=monthly
 *      (NOT /api/stripe/checkout).
 *   3. This page loads:
 *        - /api/stripe/upgrade-preview → prorated breakdown
 *        - /api/stripe/payment-method  → card brand + last4
 *      and renders a full confirmation card that mirrors what Stripe
 *      Checkout would show: target plan, current plan, prorated total
 *      due today, line items, the card that will be charged.
 *   4. User clicks "Confirm and pay £X.XX". Only THEN do we POST to
 *      /api/stripe/checkout. After that, two outcomes:
 *        a) hasExistingSub → Stripe charges the saved card via
 *           proration_behavior=always_invoice; route returns
 *           { upgraded: true, redirectUrl: '/dashboard?upgrade=success' }.
 *        b) no existing sub → route returns { url } pointing to a
 *           hosted Stripe Checkout. We redirect there.
 *   5. On success we land on /dashboard?upgrade=success which the
 *      dashboard already knows how to handle (banner + sync call).
 *
 * If the user has no payment method on file (somehow lost their card,
 * or fresh account) we still show the breakdown but the button copy
 * changes to "Continue to secure checkout" and we route them through
 * Stripe's hosted Checkout to enter a new card.
 */

'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS } from '@/lib/stripe';
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';

type Plan = 'essential' | 'pro';
type Cycle = 'monthly' | 'yearly';

interface Preview {
  hasExistingSub: boolean;
  current_price_id?: string;
  prorated_amount_pennies: number;
  prorated_amount_display: string;
  next_period_amount_pennies: number;
  next_period_amount_display: string;
  next_billing_date?: string | null;
  currency?: string;
}

interface PaymentMethod {
  hasPaymentMethod: boolean;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

const PLAN_HEADLINE: Record<Plan, { monthly: string; yearly: string; cadence: string }> = {
  essential: { monthly: '£4.99', yearly: '£44.99', cadence: 'Essential' },
  pro: { monthly: '£9.99', yearly: '£94.99', cadence: 'Pro' },
};

function priceIdFor(plan: Plan, cycle: Cycle): string | undefined {
  if (plan === 'essential') return cycle === 'yearly' ? PRICE_IDS.essential_yearly : PRICE_IDS.essential_monthly;
  if (plan === 'pro')       return cycle === 'yearly' ? PRICE_IDS.pro_yearly       : PRICE_IDS.pro_monthly;
  return undefined;
}

function brandLabel(brand?: string): string {
  if (!brand) return 'Card';
  const b = brand.toLowerCase();
  if (b === 'visa') return 'Visa';
  if (b === 'mastercard') return 'Mastercard';
  if (b === 'amex' || b === 'american_express') return 'American Express';
  if (b === 'discover') return 'Discover';
  return brand[0].toUpperCase() + brand.slice(1);
}

function UpgradeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const planParam = (params.get('plan') ?? 'pro') as Plan;
  const cycleParam = (params.get('cycle') ?? 'monthly') as Cycle;
  const plan: Plan = planParam === 'essential' ? 'essential' : 'pro';
  const cycle: Cycle = cycleParam === 'yearly' ? 'yearly' : 'monthly';
  const priceId = priceIdFor(plan, cycle);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pm, setPm] = useState<PaymentMethod | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auth check — bounce to signup with plan+cycle preserved if not signed in.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        router.replace(`/auth/signup?plan=${plan}&cycle=${cycle}`);
        return;
      }
      setAuthed(true);
    }).catch(() => {
      if (!cancelled) setAuthed(false);
    });
    return () => { cancelled = true; };
  }, [supabase, router, plan, cycle]);

  // Load preview + payment method in parallel.
  useEffect(() => {
    if (!authed || !priceId) return;
    let cancelled = false;
    (async () => {
      try {
        const [pr, pmRes] = await Promise.all([
          fetch(`/api/stripe/upgrade-preview?priceId=${encodeURIComponent(priceId)}`, { cache: 'no-store', credentials: 'include' }),
          fetch('/api/stripe/payment-method', { cache: 'no-store', credentials: 'include' }),
        ]);
        if (!pr.ok) {
          const body = await pr.json().catch(() => ({}));
          throw new Error(body.error || `Could not load price preview (${pr.status})`);
        }
        const previewData: Preview = await pr.json();
        const pmData: PaymentMethod = pmRes.ok ? await pmRes.json() : { hasPaymentMethod: false };
        if (cancelled) return;
        setPreview(previewData);
        setPm(pmData);
      } catch (err: unknown) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load upgrade details. Please try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [authed, priceId]);

  const onConfirm = async () => {
    if (submitting || !priceId || !preview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `confirmed: true` is required by the route — it's the
        // signal that the user has seen the prorated breakdown +
        // card on file (this very page) and clicked Confirm. Any
        // POST without this flag returns 409 redirecting back to
        // /upgrade, so a legacy / cached client cannot silently
        // charge the saved card.
        body: JSON.stringify({ priceId, billingCycle: cycle, confirmed: true }),
      });
      const text = await res.text();
      let data: {
        url?: string;
        upgraded?: boolean;
        redirectUrl?: string;
        alreadySubscribed?: boolean;
        error?: string;
      };
      try { data = JSON.parse(text); }
      catch { throw new Error(`Checkout returned ${res.status}: ${text.slice(0, 200)}`); }

      if (data.url) {
        // Fresh subscription — hand off to Stripe Checkout.
        try { sessionStorage.setItem('awin_checkout', JSON.stringify({ tier: plan })); }
        catch { /* sessionStorage may be blocked */ }
        window.location.href = data.url;
        return;
      }
      if (data.upgraded && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      if (data.alreadySubscribed) {
        setSubmitError('You are already on this plan.');
        setSubmitting(false);
        return;
      }
      throw new Error(data.error || `Upgrade failed (status ${res.status})`);
    } catch (err: unknown) {
      console.error('Upgrade confirm error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Could not complete upgrade. Please try again.');
      setSubmitting(false);
    }
  };

  if (!priceId) {
    return (
      <Shell>
        <ErrorCard
          title="Unknown plan"
          message="That upgrade link is missing a valid plan. Head back to pricing to start over."
        />
      </Shell>
    );
  }

  if (authed === null || (authed && preview === null && !loadError)) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-3 text-slate-600 text-sm">Preparing your upgrade…</span>
        </div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <ErrorCard title="Could not load upgrade details" message={loadError} />
      </Shell>
    );
  }

  // Already on this exact price — bounce them away with a friendly notice.
  const onThisPlan = preview?.current_price_id && preview.current_price_id === priceId;
  if (onThisPlan) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-900 mb-2">You're already on this plan</h1>
          <p className="text-sm text-slate-600 mb-6">No upgrade needed.</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
          >
            Back to dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  const headline = PLAN_HEADLINE[plan];
  const headlinePrice = cycle === 'yearly' ? headline.yearly : headline.monthly;
  const cadenceLabel = cycle === 'yearly' ? '/year' : '/month';
  const isUpgrade = preview!.hasExistingSub;
  const dueToday = preview!.prorated_amount_display;
  const dueTodayPennies = preview!.prorated_amount_pennies;
  const renewalAmount = preview!.next_period_amount_display;
  const renewalDate = preview!.next_billing_date
    ? new Date(preview!.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  // Net-credit case: existing sub but proration leaves £0 (or negative)
  // due today. We still ask for confirmation but make it clear no
  // money moves now.
  const noChargeToday = isUpgrade && dueTodayPennies <= 0;

  const buttonLabel = submitting
    ? 'Processing…'
    : pm?.hasPaymentMethod
      ? noChargeToday
        ? `Confirm upgrade — £0.00 today`
        : `Confirm and pay ${dueToday}`
      : isUpgrade
        ? `Confirm upgrade — ${dueToday}`
        : `Continue to secure checkout`;

  return (
    <Shell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
                {isUpgrade ? 'Confirm upgrade' : 'Confirm subscription'}
              </p>
              <h1 className="text-2xl font-bold text-slate-900">
                Paybacker {headline.cadence}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {headlinePrice}{cadenceLabel} after this period
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Secured by Stripe
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {isUpgrade ? (
              <Row label="New plan" value={`${headline.cadence} ${cycle === 'yearly' ? 'yearly' : 'monthly'}`} />
            ) : (
              <Row label="Plan" value={`${headline.cadence} ${cycle === 'yearly' ? 'yearly' : 'monthly'}`} />
            )}
            <Row label={isUpgrade ? 'Prorated total today' : 'Today'} value={dueToday} bold />
            {isUpgrade && (
              <p className="text-xs text-slate-500 -mt-2 leading-relaxed">
                Stripe credits you for the unused days on your current plan and
                charges only the difference to upgrade you for the rest of this
                billing cycle. Your renewal date does not change.
              </p>
            )}
            {renewalDate && (
              <Row
                label={isUpgrade ? 'Next renewal' : `Then ${headlinePrice}${cadenceLabel}`}
                value={`${renewalAmount} on ${renewalDate}`}
              />
            )}
          </div>

          <div className="px-6 py-5 border-t border-slate-200 bg-slate-50">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">Payment method</p>
            {pm?.hasPaymentMethod ? (
              <div className="flex items-center gap-3">
                <div className="h-10 w-14 rounded-md bg-white border border-slate-200 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {brandLabel(pm.brand)} ending in {pm.last4}
                  </p>
                  {pm.expMonth && pm.expYear && (
                    <p className="text-xs text-slate-500">
                      Expires {String(pm.expMonth).padStart(2, '0')}/{String(pm.expYear).slice(-2)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-slate-500 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">No card on file yet</p>
                  <p className="text-xs text-slate-600 mt-1">
                    We'll redirect you to a secure Stripe checkout page to enter
                    your card details. You won't be charged anything until you
                    confirm there.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-5 border-t border-slate-200 space-y-3">
            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
            <button
              onClick={onConfirm}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {buttonLabel}
            </button>
            <Link
              href="/pricing"
              className="block text-center text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel and go back
            </Link>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4 text-xs text-slate-600 leading-relaxed">
          <p className="font-semibold text-slate-800 mb-1">What happens after I confirm?</p>
          <ul className="space-y-1 list-disc pl-4">
            {isUpgrade ? (
              <>
                <li>Your card on file is charged the prorated total above.</li>
                <li>Your account flips to {headline.cadence} immediately — no waiting.</li>
                <li>You'll be billed {renewalAmount} on your existing renewal date.</li>
                <li>Cancel anytime from the billing settings.</li>
              </>
            ) : (
              <>
                <li>You'll enter your card details on a secure Stripe page.</li>
                <li>Your account flips to {headline.cadence} as soon as the payment clears.</li>
                <li>Renews at {headlinePrice}{cadenceLabel}. Cancel anytime.</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-xl mx-auto px-4 py-10">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to pricing
        </Link>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={bold ? 'text-lg font-bold text-slate-900' : 'text-sm font-semibold text-slate-900'}>
        {value}
      </span>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
      <h1 className="text-xl font-semibold text-slate-900 mb-2">{title}</h1>
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
      >
        Back to pricing
      </Link>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={
      <Shell>
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </Shell>
    }>
      <UpgradeInner />
    </Suspense>
  );
}
