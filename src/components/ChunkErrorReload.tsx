'use client';

/**
 * ChunkErrorReload — global window-level listener that catches stale-cache
 * chunk-load errors that escape React's error boundary.
 *
 * React's error boundary catches errors thrown DURING render. But chunk
 * loads happen via dynamic import promises — when one rejects (because
 * the file 404s after a deploy), the rejection bubbles up as an
 * `unhandledrejection` event on the window, NOT through React's boundary.
 * Without this listener, the user sees a half-rendered page or a Vercel
 * "this page couldn't load" with no recovery.
 *
 * We listen for both `error` and `unhandledrejection`, sniff the message
 * for chunk-load patterns, and trigger a one-shot page reload. The
 * sessionStorage cooldown keeps us out of refresh loops if the chunk
 * really is permanently broken.
 *
 * Mounted once in src/app/layout.tsx. Renders nothing.
 */

import { useEffect } from 'react';

const CHUNK_PATTERN =
  /chunk|loading\s+(css\s+)?chunk|failed\s+to\s+(fetch|load)|importing\s+a\s+module|webpackChunk/i;
const RELOAD_KEY = 'pb_chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 60_000;

function shouldReload(message: string): boolean {
  return CHUNK_PATTERN.test(message);
}

function attemptReload(): void {
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
}

export default function ChunkErrorReload() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onError = (event: ErrorEvent) => {
      const msg = String(event.error?.message ?? event.message ?? '');
      if (shouldReload(msg)) attemptReload();
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = String((reason && (reason.message || reason)) ?? '');
      if (shouldReload(msg)) attemptReload();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
