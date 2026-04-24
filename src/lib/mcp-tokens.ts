// src/lib/mcp-tokens.ts
// Personal access tokens for the Paybacker MCP server.
// Lets Pro users expose their own data to Claude Desktop via @paybacker/mcp.
//
// Token format:  pbk_<32 random base32 chars>   (total 36 chars)
// We store:
//   - token_hash   SHA-256 hex of the full token (used to verify a request)
//   - token_prefix first 8 chars of the plaintext, so users can identify
//                  a token in the UI without needing the secret itself
// Plaintext is returned ONCE on mint and never persisted.

import { randomBytes, createHash } from 'crypto';

// Base32 alphabet (Crockford-like) — excludes look-alike chars 0/O, 1/I/L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const PREFIX = 'pbk_';
const SECRET_LEN = 32;         // chars of random secret after the prefix
const PREFIX_STORE_LEN = 8;    // how many chars of plaintext to display (e.g. "pbk_ABCD")

/**
 * Generate a fresh personal access token.
 * Returns both the plaintext (show once) and the metadata we persist.
 */
export function mintToken(): {
  plaintext: string;
  tokenHash: string;
  tokenPrefix: string;
} {
  // Rejection sampling — a plain `byte % 30` would bias the last 6 alphabet
  // symbols because 256 is not a multiple of 30. We only accept bytes in
  // [0, MAX_VALID) where MAX_VALID is the largest multiple of 30 ≤ 256.
  const MAX_VALID = 256 - (256 % ALPHABET.length); // 240
  let secret = '';
  while (secret.length < SECRET_LEN) {
    const buf = randomBytes(SECRET_LEN);
    for (let i = 0; i < buf.length && secret.length < SECRET_LEN; i++) {
      if (buf[i] < MAX_VALID) secret += ALPHABET[buf[i] % ALPHABET.length];
    }
  }
  const plaintext = `${PREFIX}${secret}`;
  const tokenHash = createHash('sha256').update(plaintext).digest('hex');
  const tokenPrefix = plaintext.slice(0, PREFIX_STORE_LEN);
  return { plaintext, tokenHash, tokenPrefix };
}

/**
 * Hash a submitted token so we can look it up in the DB.
 * Uses the same SHA-256 as mintToken(), so verification is O(1).
 */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Surface-level sanity check — is this string even shaped like our token?
 * Cheap filter before we bother the DB with a lookup.
 */
export function looksLikeToken(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!value.startsWith(PREFIX)) return false;
  if (value.length !== PREFIX.length + SECRET_LEN) return false;
  return true;
}
