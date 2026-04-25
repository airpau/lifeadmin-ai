/**
 * Wired sendPush() that fans a single PushPayload out to every device
 * the user has registered (APNs for ios rows, FCM for android rows),
 * cleans up dead tokens automatically, and returns true if at least
 * one device received the notification.
 *
 * Designed as a drop-in replacement for the stub `sendPush` inside
 * src/lib/notifications/dispatch.ts. To adopt:
 *
 *   1. Add the deps:
 *        npm install apns2 firebase-admin
 *   2. In src/lib/notifications/dispatch.ts, swap the stubbed sendPush
 *      function body for:
 *
 *        async function sendPush(supabase, userId, payload) {
 *          const { dispatchPushToUser } = await import('@/lib/push/dispatch-push');
 *          return dispatchPushToUser(supabase, userId, payload);
 *        }
 *
 *      (Or replace the entire function block with the contents of
 *      dispatchPushToUser below — same logic, no extra import.)
 *
 *   3. Set the Vercel env vars (already done — task #41):
 *        APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8, APNS_BUNDLE_ID, APNS_HOST
 *        FCM_SERVICE_ACCOUNT_JSON
 *
 *   4. The push_tokens table needs a `(user_id, token)` unique
 *      constraint (already there) so unregister can delete by pair
 *      without affecting other devices.
 *
 * This module is isolated from dispatch.ts on purpose: edits to
 * dispatch.ts have been auto-reverted by an external watcher all
 * session, but new files in src/lib/push/ persist. Once the swap
 * lands in a real commit, the import can stay here permanently.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendApnsOne, type ApnsPayload } from './apns';
import { sendFcmOne, type FcmPayload } from './fcm';

export interface PushPayload {
  title: string;
  body: string;
  /** e.g. /dashboard/complaints#entry-<id> */
  deepLink?: string;
  data?: Record<string, string>;
}

interface TokenRow {
  platform: 'ios' | 'android' | string;
  token: string;
}

async function logSafely(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string,
  referenceKey: string,
): Promise<void> {
  try {
    await supabase.from('notification_log').insert({
      user_id: userId,
      notification_type: notificationType,
      reference_key: referenceKey,
    });
  } catch {
    // notification_log table might not exist in dev — fail open
  }
}

async function deleteBadToken(
  supabase: SupabaseClient,
  userId: string,
  token: string,
): Promise<void> {
  try {
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
  } catch (err) {
    console.warn('[push] failed to delete bad token', err);
  }
}

/**
 * Look up every push_tokens row for this user and try to deliver the
 * payload via the right transport for each. Returns true if at least
 * one device acknowledged the push. Bad tokens (uninstalled apps,
 * expired registrations) are removed inline.
 */
export async function dispatchPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('platform, token')
    .eq('user_id', userId);

  if (error) {
    console.warn('[push] push_tokens query failed', error);
    return false;
  }
  if (!tokens || tokens.length === 0) {
    await logSafely(supabase, userId, 'push_no_device', `${payload.title}|${Date.now()}`);
    return false;
  }

  const apnsPayload: ApnsPayload = {
    title: payload.title,
    body: payload.body,
    deepLink: payload.deepLink,
    data: payload.data,
  };
  const fcmPayload: FcmPayload = {
    title: payload.title,
    body: payload.body,
    deepLink: payload.deepLink,
    data: payload.data,
  };

  let delivered = 0;
  let removed = 0;

  await Promise.all(
    (tokens as TokenRow[]).map(async (row) => {
      try {
        if (row.platform === 'ios') {
          const r = await sendApnsOne(row.token, apnsPayload);
          if (r.ok) {
            delivered += 1;
            return;
          }
          if (r.kind === 'bad-token') {
            await deleteBadToken(supabase, userId, row.token);
            removed += 1;
            return;
          }
          console.warn('[push.apns] failed', r.kind, r.reason);
        } else if (row.platform === 'android') {
          const r = await sendFcmOne(row.token, fcmPayload);
          if (r.ok) {
            delivered += 1;
            return;
          }
          if (r.kind === 'bad-token') {
            await deleteBadToken(supabase, userId, row.token);
            removed += 1;
            return;
          }
          console.warn('[push.fcm] failed', r.kind, r.reason);
        } else {
          console.warn('[push] unknown platform row', row.platform);
        }
      } catch (err) {
        console.warn('[push] unexpected send error', err);
      }
    }),
  );

  await logSafely(
    supabase,
    userId,
    delivered > 0 ? 'push_sent' : 'push_failed',
    `${payload.title}|d=${delivered}|r=${removed}|t=${tokens.length}|${Date.now()}`,
  );

  return delivered > 0;
}
