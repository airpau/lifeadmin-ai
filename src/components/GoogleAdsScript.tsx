'use client';

/**
 * Loads the Google Ads global site tag (gtag.js) with the AW-XXX
 * conversion-tracking property.
 *
 * Companion to TrackingScripts.tsx, which loads GA4 (G-XXX). Both
 * scripts share the same gtag() command queue, so this one only adds
 * the `gtag('config', 'AW-XXX')` line — the gtag.js library itself
 * is already loaded by TrackingScripts.
 *
 * Marketing-cookie consent is required (Google Ads is an advertising
 * cookie under ICO PECR rules). If consent isn't granted, this
 * component renders nothing.
 *
 * Wire-up: import and place inside <body> in src/app/layout.tsx,
 * directly after <TrackingScripts />:
 *
 *   import GoogleAdsScript from '@/components/GoogleAdsScript';
 *   ...
 *   <TrackingScripts />
 *   <GoogleAdsScript />
 *
 * Then set in Vercel env vars (Production + Preview):
 *   NEXT_PUBLIC_GOOGLE_ADS_ID=AW-1234567890
 */

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { hasConsent } from '@/lib/consent';

export default function GoogleAdsScript() {
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const [marketingAllowed, setMarketingAllowed] = useState(false);

  useEffect(() => {
    const update = () => setMarketingAllowed(hasConsent('marketing'));
    update();
    window.addEventListener('consent-updated', update);
    return () => window.removeEventListener('consent-updated', update);
  }, []);

  // Don't render anything until env var is set or consent given
  if (!adsId || !marketingAllowed) return null;

  return (
    <Script id="google-ads-config" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${adsId}');
      `}
    </Script>
  );
}
