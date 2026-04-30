import type { Metadata } from 'next';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import './styles.css';

/**
 * Layout for the 11 /(marketing)/* SEO landing pages.
 *
 * Wraps children in `.m-land-root` so the scoped stylesheet applies,
 * and uses the same MarkNav/MarkFoot as the blog + marketing hub.
 * Individual page bodies render via `<LandingPage data={...} />`.
 *
 * Twitter card default lives here so every lander gets a consistent
 * tweet preview without needing each page to author its own twitter
 * block. Individual pages still own their OG copy + canonical URL —
 * Next.js merges metadata field-by-field, so overriding `openGraph`
 * on a page leaves this `twitter` default in place. If any specific
 * lander wants page-specific twitter copy, it can declare its own
 * `twitter: {...}` block and override this default.
 */

export const metadata: Metadata = {
  twitter: {
    card: 'summary',
    title: 'Paybacker — Free UK consumer-rights tools',
    description:
      'AI dispute letters citing exact UK law in 30 seconds. Free to try. Generates formal complaint letters for energy, broadband, mobile, council tax, parking, debt, insurance and more.',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-land-root">
      <MarkNav />
      {children}
      <MarkFoot />
    </div>
  );
}
