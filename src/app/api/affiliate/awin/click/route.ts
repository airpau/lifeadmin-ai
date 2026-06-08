/**
 * POST /api/affiliate/awin/click
 *
 * Phase 3 — affiliate funnel substrate.
 *
 * Body: {
 *   deal_id?: string,
 *   merchant?: string,
 *   category?: string,            // energy / broadband / insurance / etc.
 *   awin_advertiser_id?: number,
 *   target_url: string,           // Awin deep link the user is being redirected to
 * }
 *
 * Behaviour:
 *   1. Look up the authenticated user (if any).
 *   2. Emit an `affiliate_click` event scoped to the deal/category so
 *      the daily rollup can compute per-category click-through and
 *      conversion rates.
 *   3. Return `{ ok: true, redirect_url }`. The caller (consumer
 *      switch button) is expected to use the returned URL — we don't
 *      do a 302 here so the client can attach a click-id query param
 *      if needed.
 *
 * Awin attribution:
 *   The corresponding postback hits /api/affiliate/awin/conversion
 *   with the transaction id Awin gave us. That handler closes the loop.
 *
 * This endpoint is intentionally low-stakes — no validation beyond
 * shape, no auth required. Worst case is a noisy click row, which
 * the aggregator's sample-size gate filters out.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAction } from '@/lib/intelligence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  deal_id?: string;
  merchant?: string;
  category?: string;
  awin_advertiser_id?: number;
  target_url?: string;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.target_url) {
    return NextResponse.json({ error: 'target_url required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const category = (body.category ?? 'unknown').toLowerCase();
  // subject_id = '<category>:<merchant>' so the aggregator can roll up
  // per category AND per (category, merchant). Falls back to category
  // alone if merchant is missing.
  const subjectId = body.merchant
    ? `${category}:${body.merchant.toLowerCase()}`
    : category;

  void recordAction({
    userId: user?.id ?? null,
    actor: user ? 'user' : 'system',
    actionKind: 'affiliate_click',
    subjectKind: 'affiliate_deal',
    subjectId,
    predicted: {
      deal_id: body.deal_id ?? null,
      merchant: body.merchant ?? null,
      category,
      awin_advertiser_id: body.awin_advertiser_id ?? null,
      target_url: body.target_url,
    },
  }).catch((err) =>
    console.warn('[affiliate/awin/click] non-fatal emit failure:', err),
  );

  return NextResponse.json({ ok: true, redirect_url: body.target_url });
}
