/**
 * Accountant register share tokens. Pure apart from crypto.
 *
 * Format: pbr_<8 hex prefix>_<43 char base64url secret> (256 bits of
 * randomness in the secret, so tokens are unguessable). Only the SHA-256
 * hash and the prefix are stored, the same approach as the B2B API keys
 * and portal tokens. The plaintext is shown to the user once.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_RE = /^pbr_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;

export const SHARE_LINK_DEFAULT_DAYS = 30;
export const SHARE_LINK_MAX_DAYS = 90;
export const SHARE_LINK_MAX_ACTIVE = 5;

export function hashShareToken(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

export function looksLikeShareToken(v: string | null | undefined): v is string {
  return typeof v === 'string' && TOKEN_RE.test(v);
}

export function shareTokenPrefix(plaintext: string): string | null {
  const m = TOKEN_RE.exec(plaintext);
  return m ? m[1] : null;
}

export function generateShareToken(): { plaintext: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString('hex');
  const secret = randomBytes(32).toString('base64url'); // 43 chars
  const plaintext = `pbr_${prefix}_${secret}`;
  return { plaintext, prefix, hash: hashShareToken(plaintext) };
}

/** Constant-time compare of a presented token against a stored hash. */
export function shareTokenMatches(plaintext: string, storedHash: string): boolean {
  const a = Buffer.from(hashShareToken(plaintext), 'hex');
  const b = Buffer.from(storedHash || '', 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Expiry in days, clamped to 1..90, default 30. */
export function clampShareDays(days: unknown): number {
  const n = typeof days === 'number' ? days : Number(days);
  if (!Number.isFinite(n)) return SHARE_LINK_DEFAULT_DAYS;
  return Math.min(SHARE_LINK_MAX_DAYS, Math.max(1, Math.round(n)));
}

export interface ShareLinkState {
  expires_at: string;
  revoked_at: string | null;
}

export type ShareLinkStatus = 'active' | 'expired' | 'revoked';

export function shareLinkStatus(row: ShareLinkState, now: Date = new Date()): ShareLinkStatus {
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'active';
}
