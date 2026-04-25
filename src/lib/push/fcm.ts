/**
 * FCM (Firebase Cloud Messaging) sender — Android push transport.
 *
 * Uses firebase-admin with a service-account JSON pasted into the
 * FCM_SERVICE_ACCOUNT_JSON env var. Lazily initialised so Vercel
 * preview deploys without FCM creds don't crash on import.
 *
 * Env vars:
 *   FCM_SERVICE_ACCOUNT_JSON  — single-line JSON of the service
 *                                account from Firebase Console →
 *                                Project Settings → Service accounts
 *                                → Generate new private key.
 *
 *   The JSON's `private_key` field contains a multi-line PEM. When the
 *   JSON is stored on a single line in an env var, the PEM's newlines
 *   typically come through as literal "\n" sequences. We restore real
 *   newlines after JSON.parse so firebase-admin's cert() accepts it.
 */

import type { App } from 'firebase-admin/app';

export type FcmSendResult =
  | { ok: true }
  | { ok: false; kind: 'bad-token'; reason: string }
  | { ok: false; kind: 'transient'; reason: string }
  | { ok: false; kind: 'fatal'; reason: string };

let cachedApp: App | null = null;

async function getMessaging() {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!json) return null;

  const { getApps, initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');

  if (!cachedApp) {
    const existing = getApps().find((a) => a.name === 'paybacker-fcm');
    if (existing) {
      cachedApp = existing;
    } else {
      let serviceAccount: Record<string, unknown>;
      try {
        serviceAccount = JSON.parse(json);
      } catch {
        throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
      }
      // Restore newlines in the PEM private_key. JSON encodes "\n" as
      // "\\n" inside string values, which firebase-admin's cert() does
      // NOT auto-decode — we have to do it ourselves. JSON.parse already
      // decoded the outer JSON's escape sequences, so private_key here
      // may contain either real \n (good) or literal "\\n" (bad). The
      // .replace handles the bad case idempotently.
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = (serviceAccount.private_key as string).replace(/\\n/g, '\n');
      }
      cachedApp = initializeApp(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { credential: cert(serviceAccount as any) },
        'paybacker-fcm',
      );
    }
  }
  return getMessaging(cachedApp);
}

export interface FcmPayload {
  title: string;
  body: string;
  deepLink?: string;
  data?: Record<string, string>;
  /** Notification channel id — Android 8+. Defaults to 'paybacker-default'. */
  channelId?: string;
}

const FCM_BAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

const FCM_FATAL_CODES = new Set([
  'messaging/invalid-credential',
  'app/invalid-credential',
  'messaging/authentication-error',
]);

export async function sendFcmOne(
  token: string,
  payload: FcmPayload,
): Promise<FcmSendResult> {
  let messaging;
  try {
    messaging = await getMessaging();
  } catch (err) {
    return {
      ok: false,
      kind: 'fatal',
      reason: err instanceof Error ? err.message : 'fcm init failed',
    };
  }
  if (!messaging) {
    return {
      ok: false,
      kind: 'fatal',
      reason: 'FCM env vars not configured (FCM_SERVICE_ACCOUNT_JSON)',
    };
  }

  const data: Record<string, string> = { ...(payload.data ?? {}) };
  if (payload.deepLink) data.deepLink = payload.deepLink;

  try {
    await messaging.send({
      token,
      notification: { title: payload.title, body: payload.body },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: payload.channelId ?? 'paybacker-default',
        },
      },
    });
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code && FCM_BAD_TOKEN_CODES.has(code)) {
      return { ok: false, kind: 'bad-token', reason: code };
    }
    if (code && FCM_FATAL_CODES.has(code)) {
      return { ok: false, kind: 'fatal', reason: code };
    }
    return {
      ok: false,
      kind: 'transient',
      reason: code ?? (err instanceof Error ? err.message : 'unknown'),
    };
  }
}

export function fcmConfigured(): boolean {
  return !!process.env.FCM_SERVICE_ACCOUNT_JSON;
}
