/**
 * Signed OAuth `state` for the consumer connect flows (Gmail, Outlook,
 * Google Sheets).
 *
 * Before this, Gmail and Outlook sent base64(userId:timestamp) and the
 * callbacks either compared only the userId (Gmail), ignored state
 * entirely (Outlook) or sent none at all (Sheets). That let an attacker
 * who could get a logged-in user to open a crafted callback URL attach
 * the attacker's mailbox to the victim's account (login CSRF on the
 * connect step).
 *
 * Now:
 *  - state = base64url(JSON {u, n, iat, p}) + "." + base64url(HMAC-SHA256)
 *  - n (a random nonce) is also set in an httpOnly, SameSite=Lax cookie
 *    scoped to /api/auth at the start of the flow
 *  - the callback checks signature, purpose, age (15 minutes), that the
 *    nonce matches the cookie, and that u is the logged-in user; then
 *    clears the cookie whatever the outcome
 *
 * Secret: OAUTH_STATE_SECRET. If that is not set we derive a key from
 * CRON_SECRET (server only, always set in production) with an HMAC
 * label, so the raw cron secret is never used as the signing key. If
 * neither exists, starting a connect fails closed.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

export type OAuthStatePurpose = 'gmail' | 'outlook' | 'google_sheets';

export const OAUTH_STATE_MAX_AGE_SECONDS = 15 * 60;
const CLOCK_SKEW_MS = 60_000;
const COOKIE_PATH = '/api/auth';

interface StatePayload {
  u: string; // user id
  n: string; // nonce
  iat: number; // issued at, ms since epoch
  p: OAuthStatePurpose;
}

export type OAuthStateFailure =
  | 'missing_state'
  | 'malformed_state'
  | 'bad_signature'
  | 'wrong_purpose'
  | 'expired'
  | 'missing_cookie'
  | 'nonce_mismatch'
  | 'user_mismatch'
  | 'no_secret';

export type OAuthStateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: OAuthStateFailure };

let warnedFallback = false;

function signingKey(): Buffer | null {
  const dedicated = (process.env.OAUTH_STATE_SECRET || '').trim();
  if (dedicated) return Buffer.from(dedicated, 'utf8');
  const fallback = (process.env.CRON_SECRET || '').trim();
  if (fallback) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn('[oauth-state] OAUTH_STATE_SECRET not set, deriving the state key from CRON_SECRET');
    }
    return createHmac('sha256', fallback).update('paybacker-oauth-state-v1').digest();
  }
  return null;
}

function sign(body: string, key: Buffer): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function oauthNonceCookieName(purpose: OAuthStatePurpose): string {
  return `pb_oauth_nonce_${purpose}`;
}

/**
 * Create a signed state. Returns null when no signing secret is
 * configured (caller should refuse to start the flow).
 */
export function createOAuthState(
  userId: string,
  purpose: OAuthStatePurpose,
  now: number = Date.now(),
): { state: string; nonce: string } | null {
  const key = signingKey();
  if (!key) {
    console.error('[oauth-state] no OAUTH_STATE_SECRET or CRON_SECRET, refusing to start OAuth');
    return null;
  }
  const nonce = randomBytes(16).toString('base64url');
  const payload: StatePayload = { u: userId, n: nonce, iat: now, p: purpose };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { state: `${body}.${sign(body, key)}`, nonce };
}

/**
 * Pure verification (no cookies, no request). Exported for tests and
 * used by verifyOAuthCallback below.
 */
export function verifyOAuthState(
  state: string | null | undefined,
  opts: {
    purpose: OAuthStatePurpose;
    nonceCookie: string | null | undefined;
    sessionUserId: string | null | undefined;
    now?: number;
  },
): OAuthStateResult {
  if (!state) return { ok: false, reason: 'missing_state' };
  const key = signingKey();
  if (!key) return { ok: false, reason: 'no_secret' };

  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return { ok: false, reason: 'malformed_state' };
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!safeEqual(sig, sign(body, key))) return { ok: false, reason: 'bad_signature' };

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed_state' };
  }
  if (
    !payload ||
    typeof payload.u !== 'string' ||
    typeof payload.n !== 'string' ||
    typeof payload.iat !== 'number'
  ) {
    return { ok: false, reason: 'malformed_state' };
  }
  if (payload.p !== opts.purpose) return { ok: false, reason: 'wrong_purpose' };

  const now = opts.now ?? Date.now();
  const age = now - payload.iat;
  if (age > OAUTH_STATE_MAX_AGE_SECONDS * 1000 || age < -CLOCK_SKEW_MS) {
    return { ok: false, reason: 'expired' };
  }
  if (!opts.nonceCookie) return { ok: false, reason: 'missing_cookie' };
  if (!safeEqual(payload.n, opts.nonceCookie)) return { ok: false, reason: 'nonce_mismatch' };
  if (!opts.sessionUserId || payload.u !== opts.sessionUserId) {
    return { ok: false, reason: 'user_mismatch' };
  }
  return { ok: true, userId: payload.u };
}

/** Set the nonce cookie on the redirect that starts the OAuth flow. */
export function setOAuthNonceCookie(
  res: NextResponse,
  purpose: OAuthStatePurpose,
  nonce: string,
): NextResponse {
  res.cookies.set(oauthNonceCookieName(purpose), nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return res;
}

/** Clear the nonce cookie on whatever response the callback returns. */
export function clearOAuthNonceCookie(res: NextResponse, purpose: OAuthStatePurpose): NextResponse {
  res.cookies.set(oauthNonceCookieName(purpose), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 0,
  });
  return res;
}

/** Read the nonce cookie from the callback request. */
export function readOAuthNonceCookie(req: NextRequest, purpose: OAuthStatePurpose): string | null {
  return req.cookies.get(oauthNonceCookieName(purpose))?.value ?? null;
}
