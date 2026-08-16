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
  title: 'Paybacker — Your AI financial helper for unfair UK bills. Keep 100%.',
  description:
    'Paybacker is your AI financial helper. It tracks bills and subscriptions, spots overcharges and quiet price rises, drafts dispute letters citing UK consumer law in 30 seconds, and follows every dispute through to the end. You keep 100% of anything you get back. £4.99/month. Free tier available.',
  alternates: { canonical: 'https://paybacker.co.uk' },
  openGraph: {
    title: 'Paybacker — Your AI financial helper for unfair UK bills. Keep 100%.',
    description:
      'Your AI financial helper for UK bills. Spots overcharges and price rises, drafts dispute letters citing the exact UK statute in 30 seconds, and follows each dispute to the end. You keep 100% of anything you get back.',
    url: 'https://paybacker.co.uk',
    siteName: 'Paybacker',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'Paybacker — Your AI financial helper for unfair UK bills.',
    description:
      'Spots overcharges and price rises, drafts dispute letters citing the exact UK statute in 30 seconds, and tracks each dispute to the end. Free tier available.',
    images: ['/logo.png'],
  },
};

export default function HomePage() {
  return <HomepageContent />;
}
