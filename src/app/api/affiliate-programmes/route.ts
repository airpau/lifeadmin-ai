import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/affiliate-programmes
 *
 * The Awin advertiser ids we have actually joined, synced daily from
 * the Awin API by cron/awin-programme-sync.
 *
 * Exists so the deals page can filter its hardcoded catalogue the same
 * way /api/affiliate-deals filters the database one. Before this, the
 * two paths disagreed: the DB path was gated to joined programmes while
 * the hardcoded `DEALS` constant rendered 59 deals across 54 merchant
 * ids, 49 of which belong to programmes we have never joined. Those
 * links redirect and set a tracking cookie, so they look like they
 * work, and earn nothing.
 *
 * Returns ids only. The page already has names and logos; what it
 * lacks is permission to show them.
 */
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('affiliate_programmes')
    .select('awin_advertiser_id, name')
    .eq('is_joined', true);

  if (error) {
    console.error('[affiliate-programmes] fetch failed:', error.message);
    // Fail CLOSED. An empty list hides every hardcoded deal, which is
    // the safe direction: showing nothing is recoverable, showing
    // partners we do not have is not.
    return NextResponse.json({ joined: [], error: true }, { status: 200 });
  }

  return NextResponse.json({
    joined: (data ?? []).map((p) => p.awin_advertiser_id),
    names: Object.fromEntries((data ?? []).map((p) => [p.awin_advertiser_id, p.name])),
  });
}
