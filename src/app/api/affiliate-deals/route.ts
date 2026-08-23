import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

/**
 * GET /api/affiliate-deals?category=mobile
 *
 * Returns only deals for advertisers we are ACTUALLY partnered with.
 *
 * That gate is the point of this route. Awin's redirect
 * (awin1.com/cread.php) 302s for any merchant id and sets a tracking
 * cookie, so a link to a programme we never joined is indistinguishable
 * from a working one at a glance: the user lands on the advertiser, the
 * URL carries an `awc` parameter, everything looks right. It just
 * cannot pay, because a sale only tracks where we are an approved
 * publisher.
 *
 * That is how this product ended up advertising thirty merchant ids in
 * 2026, none of which belonged to a joined programme. `affiliate_programmes`
 * is synced daily from the Awin API and is the authority; joining here
 * makes it structurally impossible to show a deal we earn nothing from.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  // Two queries, not an embedded join.
  //
  // The first version used `.select('*, affiliate_programmes!inner(...)')`.
  // PostgREST can only embed across a DECLARED foreign key, and there is
  // none between affiliate_deals.programme_id and
  // affiliate_programmes.awin_advertiser_id — a FK cannot be added while
  // legacy rows carry programme_id 0. So every request 500'd and the
  // deals page silently lost its database-backed catalogue entirely.
  //
  // An explicit id filter is less elegant and actually works.
  const { data: programmes, error: progError } = await supabase
    .from('affiliate_programmes')
    .select('awin_advertiser_id')
    .eq('is_joined', true);

  if (progError) {
    console.error('[affiliate-deals] programme lookup failed:', progError.message);
    // Fail closed: no verified partner list means no deals.
    return NextResponse.json([]);
  }

  const joinedIds = (programmes ?? []).map((p) => p.awin_advertiser_id);
  if (joinedIds.length === 0) return NextResponse.json([]);

  let query = supabase
    .from('affiliate_deals')
    .select('*')
    .eq('is_active', true)
    .in('programme_id', joinedIds)
    .order('price_monthly', { ascending: true });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    console.error('[affiliate-deals] fetch failed:', error.message);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/**
 * POST /api/affiliate-deals — record a deal click.
 *
 * Records the savings figure that was ON SCREEN at the moment of the
 * click. Nothing did this before, which meant the accuracy of our
 * headline claim was unauditable: if a user ever said "you told me I'd
 * save £300", there was no record of what we had actually shown them,
 * or of the price it was derived from.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // deal_clicks.user_id is under an RLS policy of `auth.uid() = user_id`,
  // so an anonymous insert was silently discarded. Say so instead.
  if (!user) {
    return NextResponse.json({ ok: false, reason: 'not_signed_in' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // `plan_name` was being written here and has no column on deal_clicks,
  // so every insert on this path failed the schema and was thrown away
  // unchecked. Dropped, and the result is now inspected.
  const { error } = await supabase.from('deal_clicks').insert({
    user_id: user.id,
    provider: body.provider,
    category: body.category,
    deal_id: body.deal_id,
    awin_mid: body.awin_mid ?? null,
  });

  if (error) {
    console.error('[affiliate-deals] click insert failed:', error.message);
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  // Audit trail for what we claimed, separate from the click itself so
  // a schema change to one cannot silently drop the other.
  if (body.shown_saving_yearly != null || body.shown_deal_price != null) {
    try {
      const admin = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await admin.from('business_log').insert({
        category: 'deal_click_claim',
        title: `Deal click: ${body.provider} (${body.category})`,
        content: JSON.stringify({
          user_id: user.id,
          deal_id: body.deal_id,
          provider: body.provider,
          shown_deal_price: body.shown_deal_price ?? null,
          shown_user_price: body.shown_user_price ?? null,
          shown_saving_yearly: body.shown_saving_yearly ?? null,
          price_provenance: body.price_provenance ?? null,
          price_source_url: body.price_source_url ?? null,
        }),
        created_by: 'api/affiliate-deals',
      });
    } catch {
      // Non-fatal. The click itself is already recorded.
    }
  }

  return NextResponse.json({ ok: true });
}
