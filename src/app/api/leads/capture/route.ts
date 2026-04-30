/**
 * POST /api/leads/capture — public endpoint, lightweight + best-effort.
 *
 * Used by the pricing page when a logged-out user clicks "Subscribe":
 * we capture their email + intended tier so we can re-engage if they
 * never finish signup. Does not authenticate (the email IS the
 * identifier) but rate-limits by IP and dedupes via the capture helper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { captureConsumerLead } from '@/lib/consumer-leads/capture';

export const runtime = 'nodejs';

interface Body {
  email?: string;
  name?: string;
  intended_tier?: 'essential' | 'pro';
  intended_billing_interval?: 'monthly' | 'yearly';
  source?: 'signup_form' | 'pricing_page_exit';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const email = (body.email || '').trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  const userAgent = req.headers.get('user-agent') || null;

  const result = await captureConsumerLead({
    email,
    name: body.name ?? null,
    source: body.source === 'pricing_page_exit' ? 'pricing_page_exit' : 'signup_form',
    intendedTier: body.intended_tier ?? null,
    intendedBillingInterval: body.intended_billing_interval ?? null,
    utmSource: body.utm_source ?? null,
    utmMedium: body.utm_medium ?? null,
    utmCampaign: body.utm_campaign ?? null,
    ipAddress: ip,
    userAgent,
  });

  if (!result.ok) {
    // Don't reveal internal details to the public — capture is best-effort.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true, lead_id: result.leadId, created: result.created });
}
