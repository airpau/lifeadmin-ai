/**
 * POST /api/v1/free-pilot — self-serve mint for the Starter tier.
 *
 * Body: { name, work_email, company, use_case }
 *
 * Mints a 1k/mo key, emails plaintext ONCE, also pings founder.
 * No Stripe involved — the £0 tier is an acquisition surface, not
 * a billing surface.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateKey } from '@/lib/b2b/auth';
import { createKeyRevealLink } from '@/lib/b2b/key-reveal';
import { audit, extractClientMeta } from '@/lib/b2b/audit';
import { resend } from '@/lib/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, work_email, company, use_case } = body ?? {};
  if (!name || !work_email || !company || !use_case) {
    return NextResponse.json({ error: 'name, work_email, company and use_case are required' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(work_email)) {
    return NextResponse.json({ error: 'A valid work_email is required' }, { status: 400 });
  }
  if (use_case.length < 20) {
    return NextResponse.json({ error: 'use_case must be at least 20 characters' }, { status: 400 });
  }

  const supabase = getAdmin();
  const lower = work_email.trim().toLowerCase();

  // One free key per work_email. If they already have a non-revoked
  // starter key, return a friendly message rather than minting a duplicate.
  const { data: existing } = await supabase
    .from('b2b_api_keys')
    .select('id')
    .eq('owner_email', lower)
    .is('revoked_at', null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      already_minted: true,
      message: 'A key has already been issued to this email. Check your inbox or contact hello@paybacker.co.uk.',
    });
  }

  const minted = generateKey();
  const { data: inserted, error } = await supabase.from('b2b_api_keys').insert({
    name: `${company} (free pilot)`,
    key_hash: minted.hash,
    key_prefix: minted.prefix,
    tier: 'starter',
    monthly_limit: 1000,
    owner_email: lower,
    notes: `Free pilot · contact: ${name} · use case: ${use_case.slice(0, 200)}`,
  }).select('id').single();
  if (error) {
    console.error('[v1/free-pilot] insert failed', error.message);
    return NextResponse.json({ error: 'Could not mint key' }, { status: 500 });
  }
  const meta = extractClientMeta(request);
  audit({ email: lower, action: 'key_created', key_id: inserted?.id ?? null, ...meta, metadata: { tier: 'starter', source: 'free_pilot', company, prefix: minted.prefix } });

  // Email a SINGLE-USE reveal link instead of plaintext. Forwarded
  // and archived emails can't be replayed once the link is consumed.
  if (process.env.RESEND_API_KEY) {
    try {
      const revealLink = await createKeyRevealLink(minted.plaintext, lower);
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
        to: lower,
        replyTo: 'business@paybacker.co.uk',
        subject: 'Your Paybacker API key — view once',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
            <p>Hi ${escapeHtml(name)},</p>
            <p>Your Paybacker UK Consumer Rights API key is ready. Click below to reveal it — the link works once and expires in 24 hours.</p>
            <p style="margin:24px 0;"><a href="${revealLink}" style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">View my API key</a></p>
            <p style="color:#64748b;font-size:13px;">Tier: <strong>Starter</strong> · Monthly cap: <strong>1,000 calls</strong> · Resets on the 1st (UTC).</p>
            <p style="color:#64748b;font-size:13px;">Docs: <a href="https://paybacker.co.uk/for-business/docs">paybacker.co.uk/for-business/docs</a> · Portal: <a href="https://paybacker.co.uk/dashboard/api-keys">paybacker.co.uk/dashboard/api-keys</a></p>
            <p style="color:#64748b;font-size:13px;">Lost the key after viewing? Sign in to the portal and click <strong>Re-issue</strong> — that revokes the old key and issues a new one.</p>
            <p>Reply to this email with what you build — Paul, founder.</p>
          </div>`,
      });
    } catch (e: any) {
      console.error('[v1/free-pilot] email failed', e?.message);
    }
  }

  // Founder ping (Telegram + email)
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(tgChat),
          text: `🆕 *Free pilot key minted*\n\n${name} @ ${company}\n${lower}\n\n_${use_case.slice(0, 400)}_`,
          parse_mode: 'Markdown',
        }),
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, minted: true });
}
