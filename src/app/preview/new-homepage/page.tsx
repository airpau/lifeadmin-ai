// Preview route for the new homepage design (handoff from Claude Design, 20 April 2026).
// When this branch (claude/new-homepage-apr20) is deployed to Vercel, the preview URL is:
//   <branch-preview>.vercel.app/preview/new-homepage
//   <branch-preview>.vercel.app/preview/new-homepage/how-it-works
// These are the raw design-team HTML files served from /public/design-preview,
// embedded in an <iframe> so the site chrome (nav/footer) stays out of the way.
// NOT a production route — do not link from the live site. Will be removed once
// the design is ported into the real React/Tailwind homepage.

import Link from 'next/link';

export const metadata = {
  title: 'Paybacker — design preview (homepage)',
  description: 'Internal design review. Not for public consumption.',
  robots: { index: false, follow: false },
};

export default function DesignPreviewHomepage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="sticky top-0 z-50 bg-slate-900 text-white px-5 py-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Design preview — new homepage</span>
          <span className="text-slate-400">Handoff 20 Apr 2026 · not live</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/preview/new-homepage"
            className="underline-offset-4 hover:underline"
          >
            Homepage
          </Link>
          <Link
            href="/preview/new-homepage/how-it-works"
            className="underline-offset-4 hover:underline"
          >
            6-section walkthrough
          </Link>
        </div>
      </div>
      <iframe
        src="/design-preview/index.html"
        title="Paybacker homepage design preview"
        className="block w-full"
        style={{ height: 'calc(100vh - 46px)', border: 'none' }}
      />
    </div>
  );
}
