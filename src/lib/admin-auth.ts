/**
 * Shared auth guard for admin-only endpoints that also need to accept
 * legitimate cron invocations. Callers should pass both the request
 * (for the Bearer header) and let this helper resolve the session
 * cookie via the server Supabase client.
 *
 * Why two auth modes:
 *   - Vercel cron jobs and server-side internal calls use
 *     `Authorization: Bearer ${CRON_SECRET}` because they have no
 *     user session.
 *   - The admin dashboard UI calls these endpoints from the browser.
 *     Putting CRON_SECRET in the client bundle leaks it to anyone
 *     who views source — so the browser path authenticates via the
 *     Supabase session cookie + a fixed admin-email allowlist.
 *
 * If neither path validates, return `{ ok: false, status }` and the
 * caller should early-return with the corresponding 401/403.
 */

import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const ADMIN_EMAIL = 'aireypaul@googlemail.com';

function getAdminEmails(): string[] {
  // Founder gate via NEXT_PUBLIC_ADMIN_EMAILS (comma-separated). Falls back
  // to the canonical ADMIN_EMAIL so localhost / preview deploys without the
  // env var still authorise the founder.
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length === 0) return [ADMIN_EMAIL.toLowerCase()];
  return fromEnv.includes(ADMIN_EMAIL.toLowerCase())
    ? fromEnv
    : [...fromEnv, ADMIN_EMAIL.toLowerCase()];
}

export interface AuthResult {
  ok: boolean;
  status: 401 | 403 | 200;
  reason?: string;
  userId?: string;
}

export async function authorizeAdminOrCron(request: NextRequest | Request): Promise<AuthResult> {
  // Path 1 — Bearer CRON_SECRET (cron, server-to-server)
  const auth = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return { ok: true, status: 200 };
  }

  // Path 2 — logged-in admin session
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const allow = getAdminEmails();
    if (user?.email && allow.includes(user.email.toLowerCase())) {
      return { ok: true, status: 200, userId: user.id };
    }
    if (user) {
      return { ok: false, status: 403, reason: 'Not an admin' };
    }
  } catch {
    // Fall through to 401
  }

  return { ok: false, status: 401, reason: 'Unauthorized' };
}
