'use client';

/**
 * Fires the paid-upgrade conversion exactly once after Stripe
 * Checkout confirms a successful payment. Designed for the post-
 * checkout success page (e.g. /dashboard/billing/success?session_id=cs_...)
 *
 * Dedupe: persists a `pb_upgrade_fired_<sessionId>` marker in
 * sessionStorage so the conversion doesn't double-fire if the user
 * refreshes the success page.
 *
 * Usage from the success page:
 *
 *   const session = await stripe.checkout.sessions.retrieve(
 *     searchParams.session_id,
 *     { expand: ['line_items'] },
 *   );
 *   const tier = session.metadata?.tier ?? 'essential';
 *   const billingPeriod = session.metadata?.billing_period ?? 'monthly';
 *   const amountGbp = (session.amount_total ?? 0) / 100;
 *
 *   return (
 *     &lt;&gt;
 *       &lt;UpgradeConversionTracker
 *         dedupeKey={session.id}
 *         tier={tier as 'essential' | 'pro'}
 *         billingPeriod={billingPeriod as 'monthly' | 'annual'}
 *         amountGbp={amountGbp}
 *       /&gt;
 *       &lt;ThankYou /&gt;
 *     &lt;/&gt;
 *   );
 */

import { useEffect } from 'react';
import { trackPaidUpgrade } from '@/lib/analytics/conversions';

export default function UpgradeConversionTracker({
  dedupeKey,
  tier,
  billingPeriod,
  amountGbp,
}: {
  dedupeKey: string;
  tier: 'essential' | 'pro';
  billingPeriod: 'monthly' | 'annual';
  amountGbp: number;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `pb_upgrade_fired_${dedupeKey}`;
    if (window.sessionStorage.getItem(key)) return;
    trackPaidUpgrade({ dedupeKey, tier, billingPeriod, amountGbp });
    window.sessionStorage.setItem(key, '1');
  }, [dedupeKey, tier, billingPeriod, amountGbp]);

  return null;
}
