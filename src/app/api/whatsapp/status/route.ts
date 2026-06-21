/**
 * WhatsApp delivery-status callback endpoint (self-learning loop).
 *
 * Twilio POSTs message-status updates (queued → sent → delivered → read, or
 * failed/undelivered) here when TWILIO_STATUS_CALLBACK_URL points at this route
 * (set on every send by twilio-provider.ts). We update the delivery telemetry
 * columns on whatsapp_message_log so the founder dashboard + coach cron can see
 * deliver/read rates per template.
 *
 * Deliberately SEPARATE from /api/whatsapp/webhook: status callbacks carry the
 * same From/MessageSid shape as inbound messages, and the inbound parser would
 * otherwise treat them as empty user messages and wake the agent. Keeping them
 * apart is the safe design.
 *
 * Signature: Twilio signs the callback against the exact StatusCallback URL, so
 * we verify against TWILIO_STATUS_CALLBACK_URL (not the inbound webhook URL).
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { ingestStatusReceipt } from '@/lib/whatsapp/alert-loop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyTwilioStatusSignature(rawBody: string, signature: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const url = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (!authToken || !url || !signature) return false;
  const params = new URLSearchParams(rawBody);
  const sortedKeys = [...params.keys()].sort();
  const data = url + sortedKeys.map((k) => `${k}${params.get(k) ?? ''}`).join('');
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get('x-twilio-signature') || req.headers.get('X-Twilio-Signature');

  if (
    process.env.NODE_ENV === 'production' &&
    !verifyTwilioStatusSignature(rawBody, signature)
  ) {
    return new NextResponse('Invalid signature', { status: 403 });
  }

  const params = new URLSearchParams(rawBody);
  const sid = params.get('MessageSid') || params.get('SmsSid');
  const status = params.get('MessageStatus') || params.get('SmsStatus');
  const errorCode = params.get('ErrorCode');

  if (!sid || !status) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  await ingestStatusReceipt({ providerMessageId: sid, status, errorCode });
  return NextResponse.json({ ok: true });
}
