'use client';

/**
 * Global error boundary — catches anything the per-route error.tsx files
 * don't, including layout-level crashes and (critically) ChunkLoadError
 * from stale browser caches after a deploy.
 *
 * After a Vercel rebuild, every JS chunk gets a new content-hashed
 * filename. Browsers with the previous build's HTML in memory may try
 * to lazy-load chunks that no longer exist on the edge — that 404s the
 * chunk fetch and React surfaces it as ChunkLoadError. Without a
 * recovery handler users see "this page couldn't load" with no way out
 * but a manual hard-refresh.
 *
 * This boundary detects the chunk-load class of error and auto-reloads
 * the page once. SessionStorage gates the reload to a single attempt
 * per tab so we don't trap users in a refresh loop if there's a real
 * chunk-serving outage.
 */

import { useEffect } from 'react';

const CHUNK_PATTERN =
  /chunk|loading\s+(css\s+)?chunk|failed\s+to\s+(fetch|load)|importing\s+a\s+module|webpackChunk/i;
const RELOAD_KEY = 'pb_chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 60_000;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    typeof error?.message === 'string' && CHUNK_PATTERN.test(error.message);

  useEffect(() => {
    if (!isChunkError) return;
    if (typeof window === 'undefined') return;

    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? '0');
      const now = Date.now();
      if (now - last > RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(RELOAD_KEY, String(now));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [isChunkError]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          color: '#0f172a',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '32px 28px',
            textAlign: 'center',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12, lineHeight: 1 }} aria-hidden>
            🔄
          </div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: '0 0 8px',
              letterSpacing: '-0.01em',
            }}
          >
            {isChunkError ? 'Loading the latest version…' : 'Something went wrong'}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#475569',
              margin: '0 0 16px',
              lineHeight: 1.55,
            }}
          >
            {isChunkError
              ? "We've just shipped an update. Refreshing now to pick up the new files."
              : 'An unexpected error occurred. You can try again, or reload the page.'}
          </p>

          {/*
            Surface the underlying error message + digest so users can
            send it to support (and so we can grep Vercel runtime logs
            by digest). Hidden when the boundary fires for the chunk
            case because the auto-reload makes it irrelevant.
          */}
          {!isChunkError && (error?.message || error?.digest) && (
            <details
              style={{
                textAlign: 'left',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                margin: '0 0 20px',
                fontSize: 12,
                color: '#334155',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 600,
                  marginBottom: 4,
                  outline: 'none',
                }}
              >
                Technical details
              </summary>
              {error?.message && (
                <pre
                  style={{
                    margin: '8px 0 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: 11.5,
                    color: '#475569',
                  }}
                >
                  {error.message}
                </pre>
              )}
              {error?.digest && (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 11,
                    color: '#64748b',
                  }}
                >
                  Reference: <code>{error.digest}</code>
                </p>
              )}
            </details>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              style={{
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 600,
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            {!isChunkError && (
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: 'transparent',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
