'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, Suspense, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const POSTHOG_KEY = 'phc_GNRV5alJCSp3SMcZzo4BgdTy0HcbttVIH4hakfBjv97';

// Init at module level — runs once when JS loads in browser
if (typeof window !== 'undefined') {
  console.log('[PostHog] Initializing...');
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
      loaded: (ph) => {
        console.log('[PostHog] Loaded successfully, distinct_id:', ph.get_distinct_id());
      },
    });
    console.log('[PostHog] init() called, __loaded:', posthog.__loaded);
  } catch (e) {
    console.error('[PostHog] Init failed:', e);
  }
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      if (searchParams?.toString()) url += '?' + searchParams.toString();
      console.log('[PostHog] Capturing pageview:', url);
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        console.log('[PostHog] Identifying user:', user.id);
        posthog.identify(user.id, { email: user.email });
      }
    });
  }, []);

  return null;
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    // Debug: check PostHog state after a delay
    setTimeout(() => {
      const info = [
        `loaded: ${posthog.__loaded}`,
        `distinct_id: ${posthog.get_distinct_id?.() || 'N/A'}`,
        `key: ${POSTHOG_KEY.substring(0, 10)}...`,
      ].join(', ');
      console.log('[PostHog] Debug:', info);
      setDebugInfo(info);
    }, 2000);
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
        <PostHogIdentify />
      </Suspense>
      {children}
      {/* Temporary debug banner — remove after confirming PostHog works */}
      {debugInfo && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, background: '#1a1a2e', color: '#0f0', fontSize: '10px', padding: '2px 8px', zIndex: 9999, opacity: 0.7 }}>
          PH: {debugInfo}
        </div>
      )}
    </PHProvider>
  );
}
