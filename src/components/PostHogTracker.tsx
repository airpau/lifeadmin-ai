'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/components/PostHogProvider';

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

export default function PostHogTracker() {
  return (
    <>
      <PostHogPageView />
      <PostHogIdentify />
    </>
  );
}
