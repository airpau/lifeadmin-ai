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

/*
 * Positioning note for whoever edits this next.
 *
 * The metadata deliberately leads with recovery and the 0% success fee,
 * not with a feature count or a price comparison. Leading on price
 * invites a straight comparison with free UK trackers on the one axis a
 * paid product cannot win. The defensible claim is what happens after
 * the overcharge is found: the letter cites a real provision from an
 * official source, and the case is tracked to the ombudsman deadline.
 *
 * Two hard limits on any rewrite here:
 *   - No outcome guarantees, success rates or "we will get your money
 *     back". We say what the product does, never what a company or an
 *     ombudsman will decide.
 *   - The success-fee benchmark is "services that take a percentage",
 *     never solicitors or law firms. That framing was removed
 *     deliberately for regulatory reasons and must not return.
 */
export const metadata: Metadata = {
  title: 'Paybacker: find what you are owed on UK bills, and keep 100% of it',
  description:
    'Paybacker reads your bank and your inbox to find charges that should not be there, drafts the dispute letter citing the exact UK statute or regulator rule with a link to the official source, and tracks the case to the ombudsman deadline. No success fee at any tier, while services that work on a percentage commonly take 25% to 35% of what you recover. Free tier available.',
  alternates: { canonical: 'https://paybacker.co.uk' },
  openGraph: {
    title: 'Paybacker: find what you are owed on UK bills, and keep 100% of it',
    description:
      'We find the overcharge in your bank and inbox, write the letter that cites the actual law, and chase it to the ombudsman deadline. You keep every penny that comes back, because we never take a cut.',
    url: 'https://paybacker.co.uk',
    siteName: 'Paybacker',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'Paybacker: find what you are owed, and keep 100% of it',
    description:
      'Finds the overcharge, cites the actual UK law from an official source, and tracks the case to the ombudsman deadline. No success fee, ever. Free tier available.',
    images: ['/logo.png'],
  },
};

export default function HomePage() {
  return <HomepageContent />;
}
