/**
 * Session-based portal auth for B2B customers.
 *
 * Magic-link is used for *first* sign-in and after a 30-day session
 * expiry. After consuming a magic link, we mint a long-lived session
 * cookie (HttpOnly, Secure, SameSite=Lax) so the customer signs in
 * once per month, not every time they open the portal.
 *
 * Multi-seat: each member has their own session keyed to their own
 * email. resolveOwner() handles the visibility model.
 */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'pbk_b2b_session';
const SESSION_TTL_DAYS = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function createSession(email: string, ip: string | null, ua: string | null): Promise<string> {
  const supabase = getAdmin();
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000).toISOString();
  await supabase.from('b2b_sessions').insert({
    email: email.toLowerCase(),
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_address: ip,
    user_agent: ua,
  });
  return token;
}

/**
 * Verify a session cookie. Returns the email on success, or null.
 * Bumps last_used_at so we know which sessions are active.
 */
export async function verifySession(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const supabase = getAdmin();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase
    .from('b2b_sessions')
    .select('id, email, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  // Don't await — fire and forget bump.
  void supabase.from('b2b_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data.email as string;
}

export async function revokeSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const supabase = getAdmin();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await supabase.from('b2b_sessions').update({ revoked_at: new Date().toISOString() }).eq('token_hash', tokenHash);
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0,
  });
}

export function readSessionCookie(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Unified portal auth: returns the authenticated email if either a
 * valid session cookie OR a valid magic-link token is presented.
 *
 * Magic-link path also validates the original 30-min one-time token
 * via b2b_portal_tokens — used on first sign-in.
 */
export async function authPortal(
  request: NextRequest,
  body?: { token?: string; email?: string } | null,
  searchParams?: { token?: string | null; email?: string | null } | null,
): Promise<{ email: string; via: 'session' | 'magic' } | null> {
  // 1) Session cookie
  const cookie = readSessionCookie(request);
  const sessionEmail = await verifySession(cookie);
  if (sessionEmail) return { email: sessionEmail, via: 'session' };

  // 2) Magic-link token (body or query). Coerce to string defensively
  // so a malformed `token: 1` body doesn't crash the runtime.
  const tokenRaw = body?.token ?? searchParams?.token ?? null;
  const emailRaw = body?.email ?? searchParams?.email ?? '';
  const token = typeof tokenRaw === 'string' ? tokenRaw : null;
  const email = (typeof emailRaw === 'string' ? emailRaw : '').toLowerCase();
  if (token && email) {
    const supabase = getAdmin();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { data } = await supabase
      .from('b2b_portal_tokens')
      .select('id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .eq('email', email)
      .maybeSingle();
    if (data && !data.used_at && new Date(data.expires_at) >= new Date()) {
      // Don't burn the token here — let the calling endpoint decide
      // (mutating endpoints burn via burnMagicLinkToken, GETs don't).
      return { email, via: 'magic' };
    }
  }
  return null;
}

/**
 * Burn a magic-link token after a mutating action. Cookie sessions are
 * unaffected. Call this from POST handlers after authPortal succeeded
 * via the magic-link path.
 */
export async function burnMagicLinkToken(
  body?: { token?: unknown; email?: unknown } | null,
): Promise<void> {
  const tokenRaw = body?.token;
  const emailRaw = body?.email;
  const token = typeof tokenRaw === 'string' ? tokenRaw : null;
  const email = (typeof emailRaw === 'string' ? emailRaw : '').toLowerCase();
  if (!token || !email) return;
  const supabase = getAdmin();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await supabase
    .from('b2b_portal_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .eq('email', email)
    .is('used_at', null);
}
