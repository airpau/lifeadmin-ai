'use client';

/**
 * Fires the signup conversion exactly once after Supabase confirms a
 * new user's account. Designed to be mounted on the page the user
 * lands on immediately after signup (typically /dashboard or
 * /onboarding/welcome).
 *
 * Dedupe: persists a `pb_signup_fired_<userId>` marker in
 * sessionStorage so the conversion doesn't double-fire if the user
 * refreshes within the same tab. We deliberately use sessionStorage
 * rather than localStorage so the marker dies with the tab — if the
 * user later clicks a paid Google Ad and signs up on a fresh device,
 * we want the second signup to attribute the second click.
 *
 * Usage:
 *   import SignupConversionTracker from
 *     '@/components/analytics/SignupConversionTracker';
 *
 *   // inside the post-signup landing page server component
 *   const { data: { user } } = await supabase.auth.getUser();
 *   const isFreshSignup = ... // e.g. user.created_at within last 5 mins
 *   if (isFreshSignup && user) {
 *     return &lt;SignupConversionTracker userId={user.id} email={user.email} /&gt;;
 *   }
 */

import { useEffect } from 'react';
import { trackSignupCompleted } from '@/lib/analytics/conversions';

export default function SignupConversionTracker({
  userId,
  email,
}: {
  userId: string;
  email?: string | null;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `pb_signup_fired_${userId}`;
    if (window.sessionStorage.getItem(key)) return;
    trackSignupCompleted({ dedupeKey: userId, email: email ?? undefined });
    window.sessionStorage.setItem(key, '1');
  }, [userId, email]);

  return null;
}
