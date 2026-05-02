import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Without this middleware, the Supabase access token (1-hour TTL) is
// never refreshed server-side. Once it expires, the next request to a
// Server Component sees `getUser() === null` and bounces the user to
// /auth/login — the symptom users hit as "Paybacker keeps logging me
// out". `updateSession` rotates the cookie pair on every request and
// also handles the dashboard / admin redirects.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on every path except Next.js internals and static asset
  // requests — those don't need cookie rotation and matching them
  // would just add latency. Mirrors the matcher in the official
  // @supabase/ssr Next.js example.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|otf)$).*)',
  ],
};
