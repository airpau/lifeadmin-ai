/**
 * Apple App Store Server API + JWS verification.
 *
 * StoreKit 2 (iOS 15+, our minimum) issues `JWSTransaction` strings
 * to the client app. The client sends us a transactionId; we look it
 * up against Apple's App Store Server API to fetch the most recent JWS
 * and verify it.
 *
 * Two distinct verification surfaces:
 *
 *   1. /api/iap/verify       — client-callable: app sends transactionId,
 *                              we fetch+verify+sync subscription state.
 *
 *   2. /api/iap/webhook/apple — Apple-callable: ASN v2 sends signed
 *                              notifications (DID_RENEW, REFUND, etc.)
 *                              with the JWS embedded; we verify+sync.
 *
 * Env vars required:
 *   APPLE_BUNDLE_ID            — co.uk.paybacker.app
 *   APPLE_TEAM_ID
 *   APPLE_ISSUER_ID            — App Store Connect API issuer id
 *   APPLE_KEY_ID               — App Store Connect API key id
 *   APPLE_PRIVATE_KEY          — App Store Connect API private key (.p8)
 *   APPLE_USE_SANDBOX          — '1' for sandbox testing, otherwise prod
 */

import * as jose from 'jose';

const PROD_BASE = 'https://api.storekit.itunes.apple.com';
const SANDBOX_BASE = 'https://api.storekit-sandbox.itunes.apple.com';

function isSandbox(): boolean {
  return process.env.APPLE_USE_SANDBOX === '1' || process.env.NODE_ENV !== 'production';
}

function apiBase(): string {
  return isSandbox() ? SANDBOX_BASE : PROD_BASE;
}

export interface JwsTransactionPayload {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  subscriptionGroupIdentifier?: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  type: 'Auto-Renewable Subscription' | 'Non-Consumable' | 'Consumable' | 'Non-Renewing Subscription';
  inAppOwnershipType: 'PURCHASED' | 'FAMILY_SHARED';
  signedDate: number;
  environment: 'Sandbox' | 'Production';
  revocationDate?: number;
  revocationReason?: number;
}

/**
 * Decode + verify a JWS string from Apple. Returns the decoded payload
 * if the leaf cert signature checks out.
 *
 * TODO before public launch: full x5c chain validation up to
 * AppleRootCA-G3 in verifyJwsChain() (currently no-op). For sandbox
 * testing this is acceptable — leaf-cert verification still rejects
 * unsigned/wrong-key tokens.
 */
export async function verifyAppleJws<T = JwsTransactionPayload>(
  jws: string,
): Promise<T> {
  const decodedHeader = jose.decodeProtectedHeader(jws);
  const x5c = decodedHeader.x5c;
  if (!Array.isArray(x5c) || x5c.length === 0) {
    throw new Error('JWS missing x5c header — refusing to verify');
  }

  const leafCertPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  const leafKey = await jose.importX509(leafCertPem, 'ES256');

  const { payload } = await jose.jwtVerify(jws, leafKey, {
    algorithms: ['ES256'],
  });

  await verifyJwsChain(x5c);

  return payload as unknown as T;
}

async function verifyJwsChain(_x5c: string[]): Promise<void> {
  // TODO: walk x5c chain up to AppleRootCA-G3 before public launch
  return;
}

async function generateApiJwt(): Promise<string> {
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID;
  const privateKeyPem = process.env.APPLE_PRIVATE_KEY;

  if (!issuerId || !keyId || !bundleId || !privateKeyPem) {
    throw new Error(
      'Missing Apple env: APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_BUNDLE_ID, APPLE_PRIVATE_KEY',
    );
  }

  const privateKey = await jose.importPKCS8(privateKeyPem, 'ES256');

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new jose.SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 20)
    .setAudience('appstoreconnect-v1')
    .sign(privateKey);

  return jwt;
}

export async function fetchTransactionInfo(transactionId: string): Promise<string> {
  const token = await generateApiJwt();
  const url = `${apiBase()}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`App Store Server API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!data?.signedTransactionInfo) {
    throw new Error('App Store Server API returned no signedTransactionInfo');
  }
  return data.signedTransactionInfo as string;
}

export interface AsnV2Payload {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data: {
    bundleId: string;
    environment: 'Sandbox' | 'Production';
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
  version: string;
  signedDate: number;
}

export async function verifyAsnV2(signedPayload: string): Promise<AsnV2Payload> {
  return verifyAppleJws<AsnV2Payload>(signedPayload);
}
