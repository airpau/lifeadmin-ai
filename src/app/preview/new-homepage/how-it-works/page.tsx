// Preview route for the 6-section how-it-works walkthrough from the design handoff.
import Link from 'next/link';

export const metadata = {
  title: 'Paybacker — design preview (how it works)',
  description: 'Internal design review. Not for public consumption.',
  robots: { index: false, follow: false },
};

export default function DesignPreviewHowItWorks() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="sticky top-0 z-50 bg-slate-900 text-white px-5 py-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Design preview — 6-section walkthrough</span>
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
        src="/design-preview/how-it-works.html"
        title="Paybacker 6-section walkthrough design preview"
        className="block w-full"
        style={{ height: 'calc(100vh - 46px)', border: 'none' }}
      />
    </div>
  );
}
