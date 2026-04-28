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
  const { error } = await supabase.from('b2b_api_keys').insert({
    name: `${company} (free pilot)`,
    key_hash: minted.hash,
    key_prefix: minted.prefix,
    tier: 'starter',
    monthly_limit: 1000,
    owner_email: lower,
    notes: `Free pilot · contact: ${name} · use case: ${use_case.slice(0, 200)}`,
  });
  if (error) {
    console.error('[v1/free-pilot] insert failed', error.message);
    return NextResponse.json({ error: 'Could not mint key' }, { status: 500 });
  }

  // Email plaintext to customer ONCE.
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || 'Paybacker for Business <business@paybacker.co.uk>',
        to: lower,
        replyTo: 'business@paybacker.co.uk',
        subject: 'Your Paybacker API key (Starter — 1,000 calls/month)',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
            <p>Hi ${escapeHtml(name)},</p>
            <p>Your Paybacker UK Consumer Rights API key is ready.</p>
            <p style="background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:14px;word-break:break-all;">${minted.plaintext}</p>
            <p><strong>Save this now — it is only shown once.</strong> If you lose it, contact us to revoke and re-issue.</p>
            <p>Tier: <strong>Starter</strong> · Monthly cap: <strong>1,000 calls</strong> · Resets on the 1st (UTC).</p>
            <p>Docs: <a href="https://paybacker.co.uk/for-business/docs">paybacker.co.uk/for-business/docs</a></p>
            <p>Quick test:</p>
            <pre style="background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto;font-size:12px;">curl -X POST https://paybacker.co.uk/api/v1/disputes \\
  -H "Authorization: Bearer ${minted.plaintext}" \\
  -H "Content-Type: application/json" \\
  -d '{"scenario":"Ryanair cancelled my flight 6h before departure, refusing compensation","amount":350}'</pre>
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
