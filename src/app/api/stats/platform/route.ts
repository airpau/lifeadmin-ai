import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public, unauthenticated endpoint — aggregate platform stats only.
// Powers the live "money recovered" counter on the homepage. Returns
// no PII; counts and a single sum only.
//
// Force-dynamic for the same reason as the sibling stats routes
// (/api/disputes/stats, /api/stats/public): build-time prerender hangs
// when Supabase is saturated. Edge caching absorbs spikes.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ZEROED = {
  total_disputes_won: 0,
  total_recovered_gbp: 0,
  total_users: 0,
};

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(ZEROED);
  }

  const supabase = getAdmin();

  // Schema: status = 'resolved_won' is the won state. Money lives in
  // `recovered_amount_gbp` (canonical going forward); the legacy
  // `money_recovered` column is the fallback for rows that predate
  // the platform-wide backfill on 2026-05-12.
  const [won, recovered, users] = await Promise.all([
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'resolved_won'),
    supabase
      .from('disputes')
      .select('recovered_amount_gbp, money_recovered')
      .eq('status', 'resolved_won'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true }),
  ]);

  const total_recovered_gbp = (recovered.data ?? []).reduce(
    (sum, d) => sum + Number(d.recovered_amount_gbp ?? d.money_recovered ?? 0),
    0,
  );

  return NextResponse.json({
    total_disputes_won: won.count ?? 0,
    total_recovered_gbp: Math.round(total_recovered_gbp * 100) / 100,
    total_users: users.count ?? 0,
  });
}
