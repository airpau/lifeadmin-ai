// GET  /api/documents/price-rises: price rises the vault has found in the
//      user's bills and renewals, biggest yearly cost first.
// POST /api/documents/price-rises: check now (on demand). The same check
//      also runs after every filing run.
// Essential and above (PlanLimits.priceRiseWatch). Pure computation, no
// AI call. See src/lib/documents/price-rise-watch.ts for how monthly
// rises are fed into the existing price increase alerts.

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { runPriceRiseWatch } from '@/lib/documents/price-rise-watch';

export const runtime = 'nodejs';

const COLUMNS =
  'id, supplier, doc_type, cadence, old_document_id, new_document_id, old_amount, new_amount, old_date, new_date, increase_pct, annual_increase, price_alert_id, status, created_at';

async function list(userId: string) {
  return documentsAdmin()
    .from('document_price_rises')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('annual_increase', { ascending: false })
    .limit(50);
}

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.priceRiseWatch) return upgradeRequired(UPGRADE_COPY.priceRiseWatch, 'essential');
  const { data, error } = await list(user.id);
  if (error) return NextResponse.json({ error: 'Could not load price rises.' }, { status: 500 });
  return NextResponse.json({ rises: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.priceRiseWatch) return upgradeRequired(UPGRADE_COPY.priceRiseWatch, 'essential');
  try {
    const result = await runPriceRiseWatch(documentsAdmin(), user.id);
    const { data } = await list(user.id);
    return NextResponse.json({ ...result, rises: data ?? [] });
  } catch (err) {
    console.error('[documents.price-rises] run failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not check for price rises. Please try again.' }, { status: 500 });
  }
}
