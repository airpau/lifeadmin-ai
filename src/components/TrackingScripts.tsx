'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { hasConsent } from '@/lib/consent';

export default function TrackingScripts() {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [marketingAllowed, setMarketingAllowed] = useState(false);

  function checkConsent() {
    setAnalyticsAllowed(hasConsent('analytics'));
    setMarketingAllowed(hasConsent('marketing'));
  }

  useEffect(() => {
    checkConsent();
    window.addEventListener('consent-updated', checkConsent);
    return () => window.removeEventListener('consent-updated', checkConsent);
  }, []);

  return (
    <>
      {/* Google Analytics GA4 — analytics category */}
      {analyticsAllowed && (
        <>
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-GRL9XKYTN1"
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-GRL9XKYTN1');
            `}
          </Script>
        </>
      )}

      {/* Meta Pixel — marketing category */}
      {marketingAllowed && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '722806327584909');
              fbq('track', 'PageView');
            `}
          </Script>
        </>
      )}

      {/* Awin — marketing category */}
      {marketingAllowed && process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID && (
        <Script
          src={`https://www.dwin1.com/${process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID}.js`}
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
