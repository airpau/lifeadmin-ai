'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Top-level (App Router root) error boundary. Catches runtime errors from
 * public pages — homepage, auth, pricing, marketing routes — that the
 * dashboard error boundary wouldn't see.
 *
 * Addresses UX_AUDIT.md A1.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const posthog = (window as unknown as { posthog?: { capture: (e: string, p: Record<string, unknown>) => void } }).posthog;
    if (posthog?.capture) {
      posthog.capture('root_error', {
        message: error.message,
        digest: error.digest,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
    } else {
      console.error('[root/error]', error);
    }
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 10px 30px -10px rgba(11,18,32,0.14)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 48, width: 48, borderRadius: '50%', background: '#FEF3C7', marginBottom: 16 }}>
          <AlertTriangle style={{ height: 24, width: 24, color: '#D97706' }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', margin: '0 0 8px' }}>Something went wrong.</h1>
        <p style={{ fontSize: 14, color: '#475569', margin: '0 0 24px', lineHeight: 1.6 }}>
          The page hit an unexpected error. Try again, or head back to the homepage.
        </p>
        {error.digest && (
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 24px', fontFamily: 'monospace' }}>
            Reference: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => reset()}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#10B981', color: 'white', fontWeight: 600, fontSize: 14, padding: '0 16px', height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }}
          >
            <RefreshCw style={{ height: 16, width: 16 }} /> Try again
          </button>
          <Link
            href="/"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#F1F5F9', color: '#334155', fontWeight: 600, fontSize: 14, padding: '0 16px', height: 40, borderRadius: 8, textDecoration: 'none' }}
          >
            <Home style={{ height: 16, width: 16 }} /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
