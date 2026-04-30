import type { Metadata } from 'next';
import HomepageContent from './preview/homepage/page';

/**
 * Public homepage.
 *
 * The visual + interactive content lives in
 * `src/app/preview/homepage/page.tsx` (a 'use client' component) so the
 * design series can keep iterating there. This file is the server-component
 * shell — it owns the route's <head> metadata and renders the client
 * homepage as its body.
 *
 * Previously this file used `export { default } from ...` which dragged
 * the 'use client' boundary up to the route level and left the homepage
 * inheriting only the root layout's title/description. SEO-wise that
 * meant our highest-traffic page had no homepage-specific copy in OG /
 * Twitter cards or canonical title — so this server-component wrapper
 * exists to fix that.
 */

export const metadata: Metadata = {
  title: 'Paybacker — Find hidden overcharges. Fight unfair bills. Get your money back.',
  description:
    'AI that scans your bank and inbox for overcharges, drafts UK-law-cited dispute letters in 30 seconds, and tracks every case until you get refunded. Founder has personally recovered £2,000+. Free to try.',
  alternates: { canonical: 'https://paybacker.co.uk' },
  openGraph: {
    title: 'Paybacker — Fight unfair bills. Recover your money.',
    description:
      'AI dispute letters citing exact UK consumer law in 30 seconds. Bank + inbox scanner finds hidden overcharges. Free to try, no credit card.',
    url: 'https://paybacker.co.uk',
    siteName: 'Paybacker',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'Paybacker — Fight unfair bills. Recover your money.',
    description:
      'AI dispute letters citing exact UK consumer law in 30 seconds. Free to try.',
    images: ['/logo.png'],
  },
};

export default function HomePage() {
  return <HomepageContent />;
}
