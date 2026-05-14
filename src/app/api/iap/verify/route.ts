/**
 * POST /api/iap/verify
 *
 * Called by the iOS app immediately after a successful StoreKit 2 purchase.
 * Body: { transactionId: string }
 *
 * Flow:
 *   1. Authenticate the caller via Supabase session (the app passes its
 *      Supabase access token in Authorization: Bearer …).
 *   2. Fetch the latest signed transaction info from Apple's App Store
 *      Server API for that transactionId.
 *   3. Verify the JWS signature.
 *   4. Sync the result to the database via syncAppleSubscription().
 *      This is what links the originalTransactionId to this Supabase user
 *      so future ASN v2 webhooks can find them.
 *
 * Idempotent — calling this multiple times with the same transactionId
 * is a no-op after the first one (upsert keyed on originalTransactionId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchTransactionInfo, verifyAppleJws, type JwsTransactionPayload } from '@/lib/iap/apple';
import { syncAppleSubscription } from '@/lib/iap/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getUserFromAuthHeader(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const transactionId = (body as { transactionId?: unknown })?.transactionId;
  if (typeof transactionId !== 'string' || !transactionId) {
    return NextResponse.json({ ok: false, error: 'transactionId required' }, { status: 400 });
  }

  const userId = await getUserFromAuthHeader(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let payload: JwsTransactionPayload;
  try {
    const jws = await fetchTransactionInfo(transactionId);
    payload = await verifyAppleJws<JwsTransactionPayload>(jws);
  } catch (err) {
    console.error('[iap/verify] Apple lookup/verify failed', err);
    return NextResponse.json(
      { ok: false, error: 'apple verification failed', detail: (err as Error).message },
      { status: 502 },
    );
  }

  const expectedBundle = process.env.APPLE_BUNDLE_ID;
  if (expectedBundle && payload.bundleId && payload.bundleId !== expectedBundle) {
    return NextResponse.json(
      { ok: false, error: 'bundleId mismatch', expected: expectedBundle, got: payload.bundleId },
      { status: 400 },
    );
  }

  const result = await syncAppleSubscription(payload, userId);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
