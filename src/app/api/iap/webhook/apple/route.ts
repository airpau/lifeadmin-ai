/**
 * POST /api/iap/webhook/apple
 *
 * App Store Server Notifications v2 endpoint. Apple POSTs here for
 * SUBSCRIBED, DID_RENEW, REFUND, EXPIRED, GRACE_PERIOD_EXPIRED,
 * REVOKE, and ~15 others.
 *
 * Configure URL in App Store Connect → Your App → App Information →
 * App Store Server Notifications → Production Server URL:
 *   https://paybacker.co.uk/api/iap/webhook/apple
 *
 * Apple retries non-2xx responses for up to 5 days. We always return 200
 * unless the body is malformed at the JSON-parsing level — that way Apple
 * stops retrying for permanent errors.
 *
 * Idempotency:
 *   - Dedupe by notificationUUID via iap_processed_notifications table.
 *   - syncAppleSubscription is itself idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAsnV2, verifyAppleJws, type JwsTransactionPayload } from '@/lib/iap/apple';
import { syncAppleSubscription } from '@/lib/iap/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  let body: { signedPayload?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  if (!body.signedPayload) {
    return NextResponse.json({ ok: false, error: 'signedPayload required' }, { status: 400 });
  }

  let envelope;
  try {
    envelope = await verifyAsnV2(body.signedPayload);
  } catch (err) {
    console.error('[iap/webhook/apple] outer JWS verify failed', err);
    return NextResponse.json({ ok: false, error: 'invalid jws' });
  }

  const admin = getAdmin();
  try {
    const { error: insertErr } = await admin
      .from('iap_processed_notifications')
      .insert({
        source: 'apple_iap',
        notification_uuid: envelope.notificationUUID,
        notification_type: envelope.notificationType,
        payload: envelope as unknown,
      });
    if (insertErr && /duplicate|unique/.test(insertErr.message)) {
      return NextResponse.json({ ok: true, deduped: true, notificationUUID: envelope.notificationUUID });
    }
    if (insertErr) {
      console.warn('[iap/webhook/apple] dedupe insert failed (continuing)', insertErr);
    }
  } catch (err) {
    console.warn('[iap/webhook/apple] dedupe insert threw (continuing)', err);
  }

  if (!envelope.data?.signedTransactionInfo) {
    return NextResponse.json({ ok: true, skipped: 'no signedTransactionInfo', type: envelope.notificationType });
  }

  let txPayload: JwsTransactionPayload;
  try {
    txPayload = await verifyAppleJws<JwsTransactionPayload>(envelope.data.signedTransactionInfo);
  } catch (err) {
    console.error('[iap/webhook/apple] inner JWS verify failed', err);
    return NextResponse.json({ ok: false, error: 'invalid inner jws' });
  }

  const expectedBundle = process.env.APPLE_BUNDLE_ID;
  if (expectedBundle && txPayload.bundleId && txPayload.bundleId !== expectedBundle) {
    console.warn('[iap/webhook/apple] bundleId mismatch — ignoring', {
      expected: expectedBundle,
      got: txPayload.bundleId,
    });
    return NextResponse.json({ ok: true, skipped: 'bundleId mismatch' });
  }

  const result = await syncAppleSubscription(txPayload);

  if (result.userId) {
    try {
      await admin
        .from('iap_processed_notifications')
        .update({ user_id: result.userId })
        .eq('source', 'apple_iap')
        .eq('notification_uuid', envelope.notificationUUID);
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({
    ok: true,
    notificationType: envelope.notificationType,
    syncResult: result,
  });
}
