// src/lib/posthog-server.ts
// Fire-and-forget server-side PostHog capture.
//
// The browser client in src/lib/posthog.ts forwards events through
// /api/analytics so ad-blockers can't eat them. Backend code doesn't need
// that hop — it can POST directly to PostHog's capture endpoint.
//
// Every call is best-effort:
//   - no await on the hot path
//   - errors are swallowed (analytics must never break a user request)
//   - if POSTHOG_API_KEY is unset, this is a no-op

const POSTHOG_HOST = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
// Fallback is the public project write key already used client-side, so
// events land in the same project even if the server-only env var isn't set.
const POSTHOG_KEY =
  process.env.POSTHOG_API_KEY ??
  'phc_GNRV5alJCSp3SMcZzo4BgdTy0HcbttVIH4hakfBjv97';

export function captureServer(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): void {
  if (!POSTHOG_KEY) return;
  try {
    // Fire-and-forget — do NOT await.
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        properties: {
          distinct_id: distinctId,
          $lib: 'paybacker-server',
          ...properties,
        },
      }),
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}
