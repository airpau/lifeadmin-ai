import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Public endpoint — no auth required.
// Returns platform-wide dispute totals for the public "claims resolved" counter.
export const revalidate = 300; // Cache for 5 minutes

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

    // Sum of money_recovered across all disputes
    supabase
      .from('disputes')
      .select('money_recovered')
      .not('money_recovered', 'is', null)
      .gt('money_recovered', 0),
  ]);

  const total_money_saved = (savings.data ?? []).reduce(
    (sum, d) => sum + Number(d.money_recovered ?? 0),
    0,
  );

  return NextResponse.json({
    total_filed: filed.count ?? 0,
    total_resolved: resolved.count ?? 0,
    total_money_saved: Math.round(total_money_saved * 100) / 100,
  });
}
