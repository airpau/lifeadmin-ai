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
  title: 'Paybacker — Your AI consumer champion for unfair UK bills. Keep 100%.',
  description:
    'Solicitors charge £250/hour. Claims firms take 30%. Paybacker drafts UK-law-cited complaint letters in 30 seconds, runs every dispute end-to-end through provider escalation and Ombudsman, and you keep 100% of every refund. £4.99/month. Free tier available.',
  alternates: { canonical: 'https://paybacker.co.uk' },
  openGraph: {
    title: 'Paybacker — Your AI consumer champion for unfair UK bills. Keep 100%.',
    description:
      'AI complaint letters citing the exact UK statute, escalated end-to-end through Ombudsman if needed. Solicitors charge £250/hr. Claims firms take 30%. We charge £4.99/mo and you keep every penny.',
    url: 'https://paybacker.co.uk',
    siteName: 'Paybacker',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'Paybacker — Your AI consumer champion for unfair UK bills.',
    description:
      'AI complaint letters citing the exact UK statute. Solicitors: £250/hr. Claims firms: 30%. Paybacker: £4.99/mo, you keep 100%.',
    images: ['/logo.png'],
  },
};

export default function HomePage() {
  return <HomepageContent />;
}
