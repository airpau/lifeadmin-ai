/**
 * OAuth token encryption at rest for `email_connections` and `gmail_tokens`.
 *
 * Format written to the database:
 *
 *   enc:v1:<iv b64url>.<auth tag b64url>.<ciphertext b64url>
 *
 * AES-256-GCM with EMAIL_ENCRYPTION_KEY, the same key (64 hex chars,
 * 32 bytes) that already protects IMAP app passwords in
 * src/lib/imap-scanner.ts. The IMAP helper is left untouched: it has its
 * own `iv:tag:ciphertext` hex format and throws when the key is missing,
 * which is right for passwords the user typed but wrong for OAuth tokens
 * that existing users already rely on.
 *
 * Backward compatibility is the whole point of this module:
 *
 *  - decryptToken() returns any value WITHOUT the `enc:v1:` prefix
 *    unchanged, so every legacy plain-text row keeps working.
 *  - encryptToken() returns the plain value (and logs one warning per
 *    process) when EMAIL_ENCRYPTION_KEY is missing or malformed, so a
 *    deploy that lands before the env var is set does not break a single
 *    connection. Rows written in that window stay plain text and are
 *    upgraded the next time the token is refreshed with the key present.
 *  - decryptToken() returns null (never the ciphertext) when a value IS
 *    encrypted but cannot be decrypted (key removed or changed). Callers
 *    must treat that as "temporarily unavailable", NOT as "user must
 *    reconnect": use isTokenUnreadable() to tell the two apart.
 *
 * Never rotate or remove EMAIL_ENCRYPTION_KEY once rows have been
 * encrypted with it. Doing so makes every encrypted token unreadable
 * until the old key is restored.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const TOKEN_PREFIX = 'enc:v1:';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let warnedMissingKey = false;

function loadKey(): Buffer | null {
  const hex = (process.env.EMAIL_ENCRYPTION_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function warnOnce(): void {
  if (warnedMissingKey) return;
  warnedMissingKey = true;
  console.warn(
    '[token-crypto] EMAIL_ENCRYPTION_KEY is missing or not 64 hex chars. ' +
      'OAuth tokens are being stored as plain text until it is set in Vercel.',
  );
}

/** True when the stored value carries our encryption prefix. */
export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(TOKEN_PREFIX);
}

/** True when encryption is configured for this process. */
export function tokenEncryptionEnabled(): boolean {
  return loadKey() !== null;
}

/**
 * Encrypt a token for storage. null/undefined/'' pass through untouched.
 * Already-encrypted values are returned as is (idempotent).
 */
export function encryptToken(plain: string): string;
export function encryptToken(plain: string | null | undefined): string | null;
export function encryptToken(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return plain ?? null;
  if (isEncryptedToken(plain)) return plain;
  const key = loadKey();
  if (!key) {
    warnOnce();
    return plain;
  }
  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return TOKEN_PREFIX + [iv, tag, ct].map((b) => b.toString('base64url')).join('.');
  } catch (err) {
    console.error('[token-crypto] encrypt failed, storing plain text:', err instanceof Error ? err.message : err);
    return plain;
  }
}

/**
 * Decrypt a stored token. Plain (legacy) values come back unchanged.
 * Returns null if an encrypted value cannot be decrypted.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return stored ?? null;
  if (!isEncryptedToken(stored)) return stored;
  const key = loadKey();
  if (!key) {
    console.error('[token-crypto] encrypted token found but EMAIL_ENCRYPTION_KEY is not set');
    return null;
  }
  try {
    const parts = stored.slice(TOKEN_PREFIX.length).split('.');
    if (parts.length !== 3) throw new Error('malformed payload');
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[token-crypto] decrypt failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * True when the stored value is encrypted but this process cannot read
 * it. Use this to avoid flagging a connection as needs_reauth because of
 * a server misconfiguration.
 */
export function isTokenUnreadable(stored: string | null | undefined): boolean {
  return isEncryptedToken(stored) && decryptToken(stored) === null;
}

/**
 * Return a copy of a connection-like row with access_token and
 * refresh_token decrypted. Other fields are untouched.
 */
export function decryptConnectionTokens<
  T extends { access_token?: string | null; refresh_token?: string | null },
>(row: T): T {
  if (!row) return row;
  const out = { ...row };
  if ('access_token' in row) out.access_token = decryptToken(row.access_token);
  if ('refresh_token' in row) out.refresh_token = decryptToken(row.refresh_token);
  return out;
}
