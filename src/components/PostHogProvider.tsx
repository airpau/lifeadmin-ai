'use client';

import { useEffect, Suspense, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Server-side tracking — guaranteed to work, no ad blockers
function trackEvent(event: string, properties?: Record<string, unknown>) {
  const distinctId = typeof window !== 'undefined'
    ? localStorage.getItem('pb_distinct_id') || crypto.randomUUID()
    : 'server';

  if (typeof window !== 'undefined' && !localStorage.getItem('pb_distinct_id')) {
    localStorage.setItem('pb_distinct_id', distinctId);
  }

  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      distinct_id: distinctId,
      properties: {
        ...properties,
        $current_url: typeof window !== 'undefined' ? window.location.href : undefined,
        $host: typeof window !== 'undefined' ? window.location.host : undefined,
        $pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
        $referrer: typeof window !== 'undefined' ? document.referrer : undefined,
        $screen_width: typeof window !== 'undefined' ? window.screen.width : undefined,
        $screen_height: typeof window !== 'undefined' ? window.screen.height : undefined,
        $lib: 'paybacker-server-track',
      },
    }),
  }).catch(() => {});
}

// Export for use in other components
if (typeof window !== 'undefined') {
  (window as any).__pbTrack = trackEvent;
}

export { trackEvent };

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      trackEvent('$pageview');
    }
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && typeof window !== 'undefined') {
        localStorage.setItem('pb_distinct_id', user.id);
        trackEvent('$identify', {
          distinct_id: user.id,
          $set: { email: user.email },
        });
      }
    });
  }, []);

  return null;
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
        <PostHogIdentify />
      </Suspense>
      {children}
    </>
  );
}
