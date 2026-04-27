'use client';

/**
 * PricingCTA — client-side subscribe / upgrade button for /pricing.
 *
 * Four states based on the user's auth + subscription status:
 *
 *   Logged-out
 *     → Plain link to /auth/signup with plan query param. Checkout
 *       runs after they confirm their email.
 *
 *   Logged-in, free / no active sub
 *     → Links to /upgrade?plan=...&cycle=... — a Stripe-Checkout-style
 *       confirmation page that shows the price + card on file before
 *       any money moves. The /upgrade page POSTs /api/stripe/checkout
 *       only after the user clicks Confirm.
 *
 *   Logged-in, has active paid sub on a DIFFERENT price (Essential→Pro,
 *   monthly→yearly, etc.)
 *     → Same /upgrade route. The /upgrade page fetches the proration
 *       preview + card on file, shows the user the prorated total
 *       and the card that will be charged, and only then submits.
 *
 *     We still fetch /api/stripe/upgrade-preview here so the BUTTON
 *     LABEL shows the real prorated amount inline ("Upgrade — £4.83
 *     today") — this anchors the price expectation before the user
 *     even clicks through to the confirmation page.
 *
 *   Logged-in, has active sub on the SAME price (already on this plan)
 *     → Disabled state with "Current plan" label.
 *
 * Why /upgrade and not window.confirm
 * ------------------------------------
 * Until 2026-04-27 this component called /api/stripe/checkout directly
 * after a window.confirm. Two problems with that:
 *   1. window.confirm is a blocking native dialog — it doesn't show
 *      the card last-4 or itemise the proration credit, which is
 *      exactly what users expect to see before being charged.
 *   2. A fast click could race ahead of the preview fetch and skip
 *      the dialog entirely (Paul hit this — was charged £4.97 with
 *      no confirmation at all).
 * Routing to a dedicated /upgrade page eliminates both: the user has
 * to land on a real confirmation screen with full breakdown + card
 * details, and there's no race because the page does its own loading
 * spinner before showing the Confirm button.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS } from '@/lib/stripe';

type Plan = 'free' | 'essential' | 'pro';

interface Props {
  plan: Plan;
  className: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** billing cycle to charge. Defaults to monthly. */
  billingCycle?: 'monthly' | 'yearly';
}

interface PreviewState {
  hasExistingSub: boolean;
  prorated_amount_pennies: number;
  prorated_amount_display: string;
  current_price_id?: string;
}

function priceIdFor(plan: Plan, cycle: 'monthly' | 'yearly'): string | undefined {
  if (plan === 'essential') {
    return cycle === 'yearly' ? PRICE_IDS.essential_yearly : PRICE_IDS.essential_monthly;
  }
  if (plan === 'pro') {
    return cycle === 'yearly' ? PRICE_IDS.pro_yearly : PRICE_IDS.pro_monthly;
  }
  return undefined;
}

export default function PricingCTA({ plan, className, children, style, billingCycle = 'monthly' }: Props) {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const supabase = createClient();
  const priceId = priceIdFor(plan, billingCycle);

  // Resolve auth state
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setIsAuthed(!!data.user);
    }).catch(() => {
      if (!cancelled) setIsAuthed(false);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  // For paid plans, once we know the user is authed, ask Stripe what
  // an upgrade would actually cost right now. This is what lets us
  // show "Upgrade — £4.83 today" instead of the headline £9.99 to a
  // user who already paid for Essential earlier in the cycle.
  useEffect(() => {
    if (!isAuthed || plan === 'free' || !priceId) return;
    let cancelled = false;
    fetch(`/api/stripe/upgrade-preview?priceId=${encodeURIComponent(priceId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) setPreview(data);
      })
      .catch(() => { /* preview is best-effort; fall back to headline price */ });
    return () => { cancelled = true; };
  }, [isAuthed, plan, priceId]);

  // Free tier always routes to signup
  if (plan === 'free') {
    return (
      <Link className={className} href="/auth/signup" style={style}>
        {children}
      </Link>
    );
  }

  // While auth is loading, render a non-interactive placeholder that
  // looks the same so the button doesn't pop in.
  if (isAuthed === null) {
    return (
      <Link className={className} href={`/auth/signup?plan=${plan}`} style={style} aria-busy="true">
        {children}
      </Link>
    );
  }

  // Logged-out → preserve original behaviour
  if (!isAuthed) {
    return (
      <Link className={className} href={`/auth/signup?plan=${plan}`} style={style}>
        {children}
      </Link>
    );
  }

  // Already on this exact plan → disabled "Current plan" pill.
  const onThisPlan = preview?.current_price_id && preview.current_price_id === priceId;
  if (onThisPlan) {
    return (
      <span
        className={className}
        style={{ ...style, opacity: 0.6, cursor: 'default' }}
        aria-disabled="true"
      >
        Current plan
      </span>
    );
  }

  // Logged-in user, paid plan, not already on it → /upgrade confirmation.
  // We surface the real prorated amount inline as the button label so the
  // user sees the price BEFORE clicking through. The /upgrade page then
  // shows the full breakdown + card on file + Confirm button.
  const showProratedLabel =
    preview?.hasExistingSub && preview.prorated_amount_pennies > 0;

  const upgradeHref = `/upgrade?plan=${plan}&cycle=${billingCycle}`;

  return (
    <Link className={className} href={upgradeHref} style={style}>
      {showProratedLabel
        ? `Upgrade — ${preview!.prorated_amount_display} today`
        : children}
    </Link>
  );
}
