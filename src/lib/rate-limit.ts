/**
 * IP-based sliding-window rate limiter backed by Supabase.
 *
 * Privacy-first: raw IPs are SHA-256 hashed before storage so we never
 * persist identifiable addresses. Designed for Vercel serverless —
 * stateless, no Redis required.
 */

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const WINDOW_MS = 60 * 1000; // 1 minute
const DEFAULT_MAX_REQUESTS = 5;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

function getWindowStart(now: number): Date {
  const t = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  return new Date(t);
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number;
}

/**
 * Check whether a request from the given IP is within the rate limit
 * for the specified route. If the limit is exceeded, returns allowed=false
 * with Retry-After timing.
 */
export async function checkIpRateLimit(
  ip: string | null,
  route: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
): Promise<RateLimitResult> {
  if (!ip) {
    // No IP available (unusual in production) — allow but log
    console.warn('[rate-limit] no client IP available for', route);
    return { allowed: true, remaining: maxRequests, resetAt: new Date(Date.now() + WINDOW_MS), retryAfterMs: 0 };
  }

  const ipHash = hashIp(ip);
  const now = Date.now();
  const windowStart = getWindowStart(now);
  const resetAt = new Date(windowStart.getTime() + WINDOW_MS);
  const retryAfterMs = Math.max(0, resetAt.getTime() - now);

  const sb = admin();

  // Upsert-increment: try insert with count=1, or increment on conflict.
  const { error: upsertError } = await sb
    .from('api_rate_limits')
    .upsert(
      {
        ip_hash: ipHash,
        route,
        window_start: windowStart.toISOString(),
        request_count: 1,
      },
      {
        onConflict: 'ip_hash,route,window_start',
        ignoreDuplicates: false,
      },
    );

  if (upsertError) {
    console.error('[rate-limit] upsert failed', upsertError.message);
    // Fail open — don't block users because of a DB blip
    return { allowed: true, remaining: maxRequests, resetAt, retryAfterMs: 0 };
  }

  // Increment the counter atomically via RPC-style update (no atomic inc
  // in Supabase REST, but the upsert above inserts 1; we then increment).
  const { data: current } = await sb
    .from('api_rate_limits')
    .select('request_count')
    .eq('ip_hash', ipHash)
    .eq('route', route)
    .eq('window_start', windowStart.toISOString())
    .single();

  const currentCount = current?.request_count ?? 1;

  if (currentCount > maxRequests) {
    return { allowed: false, remaining: 0, resetAt, retryAfterMs };
  }

  // Increment
  const { error: incError } = await sb
    .from('api_rate_limits')
    .update({ request_count: currentCount + 1 })
    .eq('ip_hash', ipHash)
    .eq('route', route)
    .eq('window_start', windowStart.toISOString());

  if (incError) {
    console.error('[rate-limit] increment failed', incError.message);
    return { allowed: true, remaining: maxRequests - currentCount, resetAt, retryAfterMs: 0 };
  }

  const remaining = Math.max(0, maxRequests - currentCount);
  return { allowed: true, remaining, resetAt, retryAfterMs: 0 };
}

/**
 * Extract the best-effort client IP from a NextRequest.
 * Trusts x-forwarded-for first, falls back to x-real-ip.
 */
export function getClientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    return fwd.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || null;
}
