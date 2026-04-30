/**
 * APNs (Apple Push Notification service) sender.
 *
 * Singleton client (HTTP/2 connection is expensive — keep it warm).
 * The .p8 private key, key ID, and team ID are all configured via env
 * vars so we never check them into the repo.
 *
 * Env vars (all required to send anything):
 *   APNS_KEY_ID        — 10-char ID from Apple Dev → Keys (2LF842ST9Q)
 *   APNS_TEAM_ID       — 10-char Apple Developer Team ID (S4AQZPYZ34)
 *   APNS_KEY_P8        — PEM contents of the .p8 file. Vercel/Netlify/
 *                         Heroku store env vars on a single line, so
 *                         the canonical pattern is to store the PEM
 *                         with literal "\n" sequences instead of real
 *                         newlines. We `replace(/\\n/g, '\n')` below
 *                         to restore newlines at runtime. If the
 *                         deploy target preserves real newlines (e.g.
 *                         a .env file), that's fine too — the regex
 *                         matches zero times in that case.
 *   APNS_HOST          — 'api.push.apple.com' (App Store + TestFlight)
 *                         or 'api.sandbox.push.apple.com' (dev). The
 *                         APNs key was created with environment
 *                         "Sandbox & Production" so either host works.
 *   APNS_BUNDLE_ID     — defaults to co.uk.paybacker.app
 *
 * Errors callers care about:
 *   { kind: 'bad-token' }  — APNs returned 410 BadDeviceToken; the
 *                            device uninstalled. Caller should delete
 *                            the row from push_tokens.
 *   { kind: 'transient' }  — network/5xx; safe to retry later.
 *   { kind: 'fatal', ... } — auth key wrong, etc.
 */

import { ApnsClient, Notification, Errors } from 'apns2';

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; kind: 'bad-token'; reason: string }
  | { ok: false; kind: 'transient'; reason: string }
  | { ok: false; kind: 'fatal'; reason: string };

let cached: ApnsClient | null = null;
let cachedConfigKey: string | null = null;

/**
 * Restore real newlines in PEM-style env vars.
 *
 * Vercel and most other PaaS providers store env vars on a single line.
 * Pasting a multi-line .p8 directly silently strips newlines, which
 * then breaks JWT signing (PEM parser needs the line breaks). The
 * standard workaround is to store the PEM with literal "\n" sequences
 * (e.g. "-----BEGIN PRIVATE KEY-----\nMIG...\n-----END PRIVATE KEY-----\n")
 * and convert at runtime here.
 *
 * This is idempotent: if the env already contains real newlines, the
 * regex matches zero times and the value is returned unchanged.
 */
function normalisePem(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function getClient(): ApnsClient | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const rawSigningKey = process.env.APNS_KEY_P8;
  const host = process.env.APNS_HOST ?? 'api.push.apple.com';
  if (!keyId || !teamId || !rawSigningKey) return null;

  const signingKey = normalisePem(rawSigningKey);

  const configKey = `${keyId}|${teamId}|${host}|${signingKey.length}`;
  if (cached && cachedConfigKey === configKey) return cached;

  cached = new ApnsClient({
    team: teamId,
    keyId,
    signingKey,
    defaultTopic: process.env.APNS_BUNDLE_ID ?? 'co.uk.paybacker.app',
    host,
    requestTimeout: 5_000,
  });
  cachedConfigKey = configKey;
  return cached;
}

export interface ApnsPayload {
  title: string;
  body: string;
  /** Routed via the data dictionary so the shell can navigate. */
  deepLink?: string;
  /** Extra string-only key/value pairs, merged into data. */
  data?: Record<string, string>;
  /** Override the badge count. Set to 0 to clear. */
  badge?: number;
  /** Notification sound; default 'default'. Pass null for silent. */
  sound?: string | null;
}

function classifyError(err: unknown): ApnsSendResult {
  if (err && typeof err === 'object' && 'reason' in err) {
    const reason = String((err as { reason: string }).reason);
    if (
      reason === Errors.badDeviceToken ||
      reason === Errors.unregistered ||
      reason === 'Unregistered' ||
      reason === 'BadDeviceToken'
    ) {
      return { ok: false, kind: 'bad-token', reason };
    }
    if (
      reason === Errors.invalidProviderToken ||
      reason === Errors.expiredProviderToken
    ) {
      return { ok: false, kind: 'fatal', reason };
    }
    return { ok: false, kind: 'transient', reason };
  }
  return {
    ok: false,
    kind: 'transient',
    reason: err instanceof Error ? err.message : 'unknown error',
  };
}

/** Send one push to one device token. Idempotent — safe to retry. */
export async function sendApnsOne(
  token: string,
  payload: ApnsPayload,
): Promise<ApnsSendResult> {
  const client = getClient();
  if (!client) {
    return {
      ok: false,
      kind: 'fatal',
      reason: 'APNs env vars not configured (APNS_KEY_ID/TEAM_ID/KEY_P8)',
    };
  }

  const data: Record<string, string> = { ...(payload.data ?? {}) };
  if (payload.deepLink) data.deepLink = payload.deepLink;

  const notification = new Notification(token, {
    alert: { title: payload.title, body: payload.body },
    sound: payload.sound === null ? undefined : (payload.sound ?? 'default'),
    badge: payload.badge,
    topic: process.env.APNS_BUNDLE_ID ?? 'co.uk.paybacker.app',
    data,
  });

  try {
    await client.send(notification);
    return { ok: true };
  } catch (err) {
    return classifyError(err);
  }
}

/** Returns true iff the env is set up well enough to attempt sends. */
export function apnsConfigured(): boolean {
  return getClient() !== null;
}
