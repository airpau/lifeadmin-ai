/**
 * Twilio request signature verification.
 *
 * Twilio signs every webhook request with HMAC-SHA1 using your account
 * Auth Token. The signature is computed from:
 *   1. The full URL Twilio called (including query string)
 *   2. The form-encoded body parameters, sorted alphabetically by key,
 *      concatenated as key+value
 *
 * Result is base64-encoded and sent as the `X-Twilio-Signature` header.
 *
 * Reference: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export async function validateTwilioSignature(req: NextRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const sig = req.headers.get('x-twilio-signature');
  if (!sig) return false;

  // Twilio signs the URL it actually called. We must reconstruct it
  // exactly — Vercel terminates TLS so the request scheme arrives as
  // "http", but Twilio will have called https://. Use the X-Forwarded
  // headers when present, otherwise the request URL.
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';
  const url = new URL(req.url);
  const reconstructed = `${proto}://${host}${url.pathname}${url.search}`;

  // Twilio sends form-encoded body for webhooks. Read it without
  // consuming the request stream — we clone first because the route
  // handler needs to read it again for the actual payload.
  const cloned = req.clone();
  const params: Record<string, string> = {};
  try {
    const form = await cloned.formData();
    for (const [k, v] of form.entries()) {
      params[k] = typeof v === 'string' ? v : '';
    }
  } catch {
    // Not form-encoded — JSON or empty. Fall through with empty params.
  }

  const sortedKeys = Object.keys(params).sort();
  const concatenated = sortedKeys.reduce((acc, k) => acc + k + params[k], reconstructed);

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(concatenated)
    .digest('base64');

  // Constant-time comparison to avoid timing attacks
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
