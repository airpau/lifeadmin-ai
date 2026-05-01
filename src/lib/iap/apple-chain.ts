/**
 * Apple JWS x5c chain validation. Split out from apple.ts so it can
 * be unit-tested under `node --experimental-strip-types --test`
 * without dragging in the jose / @supabase / Anthropic SDK imports.
 *
 * Used by both surfaces:
 *   - /api/iap/verify        (client-callable JWS round-trip)
 *   - /api/iap/webhook/apple (ASN v2 server notifications)
 *
 * What we assert:
 *   1. x5c has at least 2 entries (a leaf and at least one issuer)
 *   2. Every cert parses as X.509 and is currently within its
 *      validity window
 *   3. Each cert (except the last) is signed by the next cert's
 *      public key — i.e. the chain hangs together
 *   4. The terminating cert matches one of TRUSTED_APPLE_ROOT_PEMS
 *      by SHA-256 fingerprint — defeats a malicious chain that
 *      appends its own self-signed "root"
 *
 * Throws on any failure. Caller passes `decodedHeader.x5c` from
 * jose.decodeProtectedHeader().
 */

import { X509Certificate } from 'node:crypto';
import { TRUSTED_APPLE_ROOT_PEMS } from './apple-root-ca.ts';

export function verifyJwsChain(x5c: string[]): void {
  if (x5c.length < 2) {
    throw new Error(
      `JWS x5c chain too short (${x5c.length}) — expected leaf + intermediate(s) + root`,
    );
  }

  const certs = x5c.map((b64, i) => {
    try {
      return new X509Certificate(Buffer.from(b64, 'base64'));
    } catch (err) {
      throw new Error(
        `JWS x5c[${i}] is not a valid X.509 certificate: ${(err as Error).message}`,
      );
    }
  });

  const trustedFingerprints = TRUSTED_APPLE_ROOT_PEMS.map(
    (pem) => new X509Certificate(pem).fingerprint256,
  );

  // Leaf cannot itself be a pinned root — would let an attacker bypass
  // signature verification by submitting [apple_root, apple_root].
  // (Self-signed roots verify against themselves; the JWS signature
  // check would still catch this in practice because they don't have
  // Apple's private key, but rejecting up-front is clearer.)
  if (trustedFingerprints.includes(certs[0].fingerprint256)) {
    throw new Error(
      'JWS x5c leaf cert is itself a pinned Apple root — refusing to treat as a valid leaf',
    );
  }

  const now = new Date();
  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i];
    if (new Date(cert.validFrom) > now || new Date(cert.validTo) < now) {
      throw new Error(
        `JWS x5c[${i}] is outside its validity window (${cert.validFrom} → ${cert.validTo})`,
      );
    }
  }

  // Each cert must be signed by the next cert in the chain.
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw new Error(`JWS x5c chain link ${i} → ${i + 1} failed signature verification`);
    }
  }

  // Terminator must be a pinned Apple root by SHA-256 fingerprint.
  // We compare against a pinned constant rather than trusting any
  // self-styled "Apple Root" the chain might present.
  const terminatorFingerprint = certs[certs.length - 1].fingerprint256;
  if (!trustedFingerprints.includes(terminatorFingerprint)) {
    throw new Error(
      `JWS x5c chain does not terminate at a pinned Apple root — terminator fingerprint ${terminatorFingerprint} is not trusted`,
    );
  }
}
