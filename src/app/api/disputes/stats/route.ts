import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public endpoint — no auth required.
// Returns platform-wide dispute totals for the public "claims resolved" counter.
// Switched from ISR to force-dynamic 2026-04-28 — build-time prerender
// hangs when Supabase is saturated. Per-request fetch is cheap.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RESOLVED_STATUSES = ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'];

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ZEROED = {
  total_filed: 0,
  total_resolved: 0,
  total_money_saved: 0,
};

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(ZEROED);
  }

  const supabase = getAdmin();

  const [filed, resolved, savings] = await Promise.all([
    // Total disputes ever filed
    supabase.from('disputes').select('id', { count: 'exact', head: true }),

    // Total disputes with a resolved/closed status
    supabase
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .in('status', RESOLVED_STATUSES),

    // Sum of recovered_amount_gbp across resolved disputes, falling
    // back to money_recovered for rows that predate the backfill.
    // recovered_amount_gbp is the canonical column going forward.
    supabase
      .from('disputes')
      .select('recovered_amount_gbp, money_recovered')
      .in('status', RESOLVED_STATUSES),
  ]);

  const total_money_saved = (savings.data ?? []).reduce(
    (sum, d) => sum + Number(d.recovered_amount_gbp ?? d.money_recovered ?? 0),
    0,
  );

  return NextResponse.json({
    total_filed: filed.count ?? 0,
    total_resolved: resolved.count ?? 0,
    total_money_saved: Math.round(total_money_saved * 100) / 100,
  });
}
