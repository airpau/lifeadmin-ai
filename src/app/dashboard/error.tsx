'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, MessageCircle } from 'lucide-react';

/**
 * Dashboard route-group error boundary. Catches runtime errors in any
 * /dashboard/* page so a single crash doesn't take down the whole shell.
 * Logs to PostHog (if available) and the console; users get an actionable
 * recovery card rather than a Next.js error overlay.
 *
 * Addresses UX_AUDIT.md A1.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to PostHog if it's loaded; otherwise console.
    const posthog = (window as unknown as { posthog?: { capture: (e: string, p: Record<string, unknown>) => void } }).posthog;
    if (posthog?.capture) {
      posthog.capture('dashboard_error', {
        message: error.message,
        digest: error.digest,
        stack: error.stack?.split('\n').slice(0, 6).join('\n'),
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
    } else {
      console.error('[dashboard/error]', error);
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full card shadow-lg p-8 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 mb-4">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong here.</h1>
        <p className="text-sm text-slate-600 mb-6">
          We hit an unexpected error loading this page. The rest of Paybacker is still
          working &mdash; you can retry, head back to the dashboard, or message support
          and we&apos;ll pick it up.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-400 mb-6 font-mono">Reference: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 bg-mint-500 hover:bg-mint-600 active:bg-mint-700 text-white font-semibold text-sm px-4 h-10 rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-semibold text-sm px-4 h-10 rounded-lg transition-colors"
          >
            <Home className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
        <a
          href="mailto:support@paybacker.co.uk?subject=Dashboard error"
          className="inline-flex items-center gap-1.5 mt-4 text-xs text-slate-500 hover:text-slate-700"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Email support
        </a>
      </div>
    </div>
  );
}
