/**
 * POST /api/v1/portal-login — send a one-time portal-access token to
 * a B2B customer's work email.
 *
 * Body: { email: string }
 *
 * We don't use Supabase Auth for B2B customers because they aren't
 * Paybacker users — they're API customers. Instead we mint a short-
 * lived signed token tied to the email + a key the email owns, and
 * email it as a one-click link. Token lives in `b2b_portal_tokens`
 * with single-use semantics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { resend } from '@/lib/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const supabase = getAdmin();

  // We always return ok=true even if no key exists for this email, so
  // the response can't be used as an enumeration oracle.
  const { data: hasKey } = await supabase
    .from('b2b_api_keys')
    .select('id')
    .eq('owner_email', email)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  if (hasKey) {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    await supabase.from('b2b_portal_tokens').insert({
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (process.env.RESEND_API_KEY) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';
      const link = `${baseUrl}/dashboard/api-keys?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
      try {
        await resend.emails.send({
          from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
          to: email,
          replyTo: 'business@paybacker.co.uk',
          subject: 'Your Paybacker API portal link',
          html: `
            <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
              <p>Click below to access your Paybacker API portal. The link expires in 30 minutes and can only be used once.</p>
              <p style="margin:24px 0;"><a href="${link}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Open portal</a></p>
              <p style="color:#64748b;font-size:13px;">If you didn't request this, ignore this email — no action required.</p>
              <p style="color:#64748b;font-size:13px;">Direct link: <a href="${link}">${link}</a></p>
            </div>`,
        });
      } catch (e: any) {
        console.error('[portal-login] email failed:', e?.message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
