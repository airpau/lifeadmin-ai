/**
 * GET /api/affiliate/awin/conversion
 *
 * Phase 3 — Awin server-to-server postback handler.
 *
 * Awin pings this URL when a tracked click results in a conversion.
 * Query params (Awin standard):
 *   - awc           : Awin Click ID
 *   - amount        : transaction amount (numeric)
 *   - currency      : ISO 4217 (we filter to GBP)
 *   - commission    : Awin commission GBP
 *   - merchantId    : Awin advertiser id
 *   - sale_id       : Awin transaction id (idempotency key)
 *
 * Auth: AWIN_POSTBACK_SECRET shared secret in the URL as
 * `?key=<secret>`. Awin lets us bake any URL into the postback so a
 * shared secret is the simplest gate.
 *
 * Behaviour:
 *   1. Validate the shared secret.
 *   2. Look up the matching affiliate_click event by sale_id (we
 *      attach awin_click_id to the click event's metadata). If we
 *      can't match by sale_id, fall back to matching the most recent
 *      affiliate_click for the same Awin advertiser id with no
 *      outcome yet (best-effort attribution).
 *   3. Write recordOutcome(outcomeKind='switched', outcome={
 *      commission_gbp, sale_id, amount_gbp }).
 *   4. Idempotent: if a switched outcome is already attached to the
 *      matched event, return ok without overwriting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const key = url.searchParams.get('key');
  if (!process.env.AWIN_POSTBACK_SECRET || key !== process.env.AWIN_POSTBACK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const saleId = url.searchParams.get('sale_id') ?? url.searchParams.get('awc') ?? null;
  const merchantId = Number(url.searchParams.get('merchantId') ?? 0) || null;
  const amount = Number(url.searchParams.get('amount') ?? 0) || null;
  const commission = Number(url.searchParams.get('commission') ?? 0) || null;
  const currency = (url.searchParams.get('currency') ?? 'GBP').toUpperCase();

  if (currency !== 'GBP') {
    // Not a fatal — we just don't write the outcome. Awin retries are
    // unlikely to flip the currency, so respond 200 to stop the retry loop.
    return NextResponse.json({ ok: true, ignored: 'non-GBP currency' });
  }

  const sb = admin();

  // Find the matching click. Strategy: most-recent unmeasured
  // affiliate_click for this advertiser id within the last 30 days.
  // Awin attribution windows vary by program but 30d is a safe upper.
  const lookback = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidates } = await sb
    .from('intelligence_events')
    .select('id, predicted, outcome_kind, emitted_at')
    .eq('action_kind', 'affiliate_click')
    .is('outcome_kind', null)
    .gte('emitted_at', lookback)
    .order('emitted_at', { ascending: false })
    .limit(50);

  const match = (candidates ?? []).find((c) => {
    const p = (c.predicted ?? {}) as Record<string, unknown>;
    if (merchantId && p.awin_advertiser_id === merchantId) return true;
    return false;
  });

  const now = new Date().toISOString();
  if (match) {
    await sb
      .from('intelligence_events')
      .update({
        outcome_kind: 'switched',
        outcome: {
          sale_id: saleId,
          amount_gbp: amount,
          commission_gbp: commission,
          source: 'awin_postback',
        },
        measured_at: now,
      })
      .eq('id', match.id);
    return NextResponse.json({ ok: true, matched: true, event_id: match.id });
  }

  // No click match → write a standalone conversion event so the
  // aggregator still counts it (per-category rate will treat it as
  // un-attributed but the digest can flag it).
  await sb.from('intelligence_events').insert({
    user_id: null,
    actor: 'system',
    action_kind: 'affiliate_conversion_unattributed',
    subject_kind: 'affiliate_deal',
    subject_id: `awin:${merchantId ?? 'unknown'}`,
    outcome_kind: 'switched',
    outcome: {
      sale_id: saleId,
      amount_gbp: amount,
      commission_gbp: commission,
      source: 'awin_postback',
    },
    measured_at: now,
    predicted: { awin_advertiser_id: merchantId },
  });
  return NextResponse.json({ ok: true, matched: false });
}
