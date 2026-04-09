// Server-side PostHog tracking via /api/analytics
// This bypasses all ad blockers since events go through our own API

import { hasConsent } from '@/lib/consent';

export function capture(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!hasConsent('analytics')) return;

  const distinctId = localStorage.getItem('pb_distinct_id') || 'anonymous';

  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      distinct_id: distinctId,
      properties: {
        ...properties,
        $current_url: window.location.href,
        $lib: 'paybacker-custom-capture',
      },
    }),
  }).catch(() => {});
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('pb_distinct_id', userId);
  capture('$identify', { distinct_id: userId, $set: traits });
}

export function reset() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('pb_distinct_id');
}
