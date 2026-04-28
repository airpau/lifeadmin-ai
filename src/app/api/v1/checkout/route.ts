/**
 * POST /api/v1/checkout — public, returns a Stripe Checkout URL.
 *
 * Body: { tier: 'growth' | 'enterprise', email: string, name?: string, company?: string }
 *
 * On payment success the Stripe webhook (`checkout.session.completed`)
 * mints a B2B API key tied to the new subscription and emails the
 * plaintext to the customer ONCE. We never store the plaintext.
 *
 * Free "starter" tier does not flow through here — it has its own
 * self-serve mint at /api/v1/free-pilot to avoid a Stripe round-trip
 * for £0 customers.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
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

async function captureLead(args: {
  email: string;
  name: string;
  company: string;
  tier: string;
  sessionId: string;
}) {
  const supabase = getAdmin();
  const lower = args.email.trim().toLowerCase();

  // Upsert by work_email so a returning lead bumps to the latest tier
  // intent rather than silently failing the unique constraint.
  const { data: existing } = await supabase
    .from('b2b_waitlist')
    .select('id, status')
    .eq('work_email', lower)
    .maybeSingle();

  if (existing) {
    await supabase.from('b2b_waitlist').update({
      name: args.name || 'Unknown',
      company: args.company || 'Unknown',
      intended_tier: args.tier,
      stripe_session_id: args.sessionId,
      status: 'checkout_started',
      reviewed_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await supabase.from('b2b_waitlist').insert({
      name: args.name || 'Unknown',
      work_email: lower,
      company: args.company || 'Unknown',
      intended_tier: args.tier,
      stripe_session_id: args.sessionId,
      status: 'checkout_started',
    });
  }

  // Founder email
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
        to: process.env.FOUNDER_EMAIL || 'business@paybacker.co.uk',
        replyTo: lower,
        subject: `🛒 Checkout started — ${args.company} (${args.tier})`,
        html: `
          <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
            <h2 style="margin:0 0 6px;">B2B checkout started</h2>
            <p style="margin:0 0 4px;"><strong>${escapeHtml(args.name)}</strong> @ <strong>${escapeHtml(args.company)}</strong></p>
            <p style="margin:0 0 4px;"><a href="mailto:${escapeHtml(lower)}">${escapeHtml(lower)}</a></p>
            <p style="margin:0 0 16px;">Tier intended: <strong>${escapeHtml(args.tier)}</strong></p>
            <p style="background:#fefce8;border-left:3px solid #ca8a04;padding:10px 14px;color:#854d0e;border-radius:6px;font-size:14px;">Lead may convert or abandon. If you don't see a "B2B API sale" message within 30 minutes, this is a chase candidate.</p>
            <p><a href="https://paybacker.co.uk/dashboard/admin/b2b" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Open admin</a></p>
          </div>`,
      });
    } catch {}
  }

  // Telegram
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(tgChat),
          text: `🛒 *B2B checkout started*\n\n*${args.name}* @ *${args.company}*\n${lower}\nTier: *${args.tier}*\n\n_Will fire a sale alert if they convert. If silent in 30 min, chase._`,
          parse_mode: 'Markdown',
        }),
      });
    } catch {}
  }
}

const TIER_PRICE_ENV: Record<string, string> = {
  growth: 'STRIPE_PRICE_API_GROWTH_MONTHLY',
  enterprise: 'STRIPE_PRICE_API_ENTERPRISE_MONTHLY',
};

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tier, email, name, company } = body ?? {};
  const envKey = TIER_PRICE_ENV[tier];
  if (!envKey) {
    return NextResponse.json({ error: '`tier` must be growth or enterprise' }, { status: 400 });
  }
  const priceId = process.env[envKey];
  if (!priceId) {
    return NextResponse.json({ error: `${envKey} env var not set` }, { status: 500 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid `email` is required' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${baseUrl}/for-business/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/for-business#pricing`,
      metadata: {
        product: 'b2b_api',
        tier,
        contact_name: name ?? '',
        company: company ?? '',
      },
      subscription_data: {
        metadata: {
          product: 'b2b_api',
          tier,
          contact_name: name ?? '',
          company: company ?? '',
        },
      },
      allow_promotion_codes: true,
    });

    // Fire-and-forget lead capture so the redirect isn't blocked.
    captureLead({
      email,
      name: name ?? '',
      company: company ?? '',
      tier,
      sessionId: session.id,
    }).catch((e) => console.error('[v1/checkout] captureLead failed', e?.message));

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e: any) {
    console.error('[v1/checkout] stripe error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Stripe error' }, { status: 500 });
  }
}
