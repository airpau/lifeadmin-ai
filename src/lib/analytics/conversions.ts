/**
 * Conversion tracking helpers.
 *
 * Fires events to whichever ad platforms have already loaded their script
 * via src/components/TrackingScripts.tsx. Safe to call from any client
 * component — every helper checks consent + script presence before
 * pushing anything.
 *
 * Currently wired:
 *   - Meta Pixel (auto, ID 722806327584909, set in TrackingScripts.tsx)
 *   - Google Analytics 4 (auto, ID G-GRL9XKYTN1, set in TrackingScripts.tsx)
 *
 * Pending — drop the IDs into the env vars listed below to activate:
 *   - Google Ads conversion tracking
 *     NEXT_PUBLIC_GOOGLE_ADS_ID            (format: AW-1234567890)
 *     NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL  (format: AbCdEfGhIj-Kl12345)
 *     NEXT_PUBLIC_GOOGLE_ADS_UPGRADE_LABEL (format: AbCdEfGhIj-Kl12345)
 *
 * To get the IDs: Google Ads → Tools → Conversions → New conversion action →
 * Website → fill in details → publish → click "Tag setup" → "Use Google tag".
 * The page shows AW-XXXXXXXXXX (your account ID) and a per-conversion
 * "send_to" label of the form AW-xxx/yyy. Save the parts to Vercel.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function gtag(...args: unknown[]): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;
  try {
    window.gtag(...args);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[conversions] gtag call failed:', err);
    }
  }
}

function fbq(...args: unknown[]): void {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq !== 'function') return;
  try {
    window.fbq(...args);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[conversions] fbq call failed:', err);
    }
  }
}

/**
 * Fire on the very first successful signup (e.g. inside the redirect
 * after Supabase confirms the new user). Safe to call multiple times —
 * Meta dedupes by event_id and Google Ads dedupes by transaction_id when
 * provided, so callers should pass a stable user ID as `dedupeKey`.
 */
export function trackSignupCompleted(opts: { dedupeKey?: string; email?: string } = {}): void {
  // Meta Pixel: standard event for new account / lead
  fbq('track', 'CompleteRegistration', {
    content_name: 'Paybacker free signup',
    status: 'complete',
    ...(opts.dedupeKey ? { eventID: opts.dedupeKey } : {}),
  });

  // GA4: custom event mirrored to Google Ads via the linked Ads account
  gtag('event', 'sign_up', {
    method: 'email',
    ...(opts.dedupeKey ? { user_id: opts.dedupeKey } : {}),
  });

  // Google Ads conversion (fires only if the env vars are set)
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const signupLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL;
  if (adsId && signupLabel) {
    gtag('event', 'conversion', {
      send_to: `${adsId}/${signupLabel}`,
      ...(opts.dedupeKey ? { transaction_id: opts.dedupeKey } : {}),
    });
  }
}

/**
 * Fire when a user upgrades from Free to a paid tier (Essential or Pro).
 * Best to call this from the `/dashboard/billing/success` page after the
 * Stripe Checkout `?session_id=` round-trip, OR from the Stripe webhook
 * handler (server-side) by stamping a one-shot "fire conversion" flag on
 * the user record and reading it on the next page load.
 *
 * Note: Server-side server-to-server conversion uploads (Google Ads
 * Enhanced Conversions / Meta Conversions API) are more reliable than
 * browser-fired pixel events because they're not blocked by ad blockers,
 * Safari ITP, or third-party-cookie restrictions. We can layer those in
 * later — these client-side hits are a sensible v1.
 */
export function trackPaidUpgrade(opts: {
  tier: 'essential' | 'pro';
  billingPeriod: 'monthly' | 'annual';
  amountGbp: number;
  /** Stripe payment_intent or checkout_session id, used for dedupe */
  dedupeKey?: string;
}): void {
  const value = opts.amountGbp;
  const currency = 'GBP';

  // Meta Pixel: standard purchase event with revenue
  fbq('track', 'Purchase', {
    value,
    currency,
    content_name: `Paybacker ${opts.tier} (${opts.billingPeriod})`,
    content_type: 'product',
    ...(opts.dedupeKey ? { eventID: opts.dedupeKey } : {}),
  });

  // GA4: standard purchase event
  gtag('event', 'purchase', {
    value,
    currency,
    transaction_id: opts.dedupeKey,
    items: [
      {
        item_id: `paybacker-${opts.tier}-${opts.billingPeriod}`,
        item_name: `Paybacker ${opts.tier}`,
        item_variant: opts.billingPeriod,
        price: value,
        quantity: 1,
      },
    ],
  });

  // Google Ads conversion (fires only if the env vars are set)
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const upgradeLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_UPGRADE_LABEL;
  if (adsId && upgradeLabel) {
    gtag('event', 'conversion', {
      send_to: `${adsId}/${upgradeLabel}`,
      value,
      currency,
      transaction_id: opts.dedupeKey,
    });
  }
}
