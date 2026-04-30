/**
 * GET /api/admin/consumer-leads — list + aggregate metrics for the
 * consumer-leads admin dashboard.
 *
 * Founder-gated via authorizeAdminOrCron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const TIER_PRICE: Record<string, number> = {
  essential: 4.99,
  pro: 9.99,
};

export async function GET(req: NextRequest) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const { searchParams } = req.nextUrl;
  const stage = searchParams.get('stage');
  const source = searchParams.get('source');

  let query = supabase
    .from('consumer_leads')
    .select(
      'id, email, name, source, intended_tier, intended_billing_interval, funnel_stage, captured_at, last_emailed_at, email_count, discount_code, discount_coupon_id, discount_code_expires_at, discount_redeemed_at, converted_at, converted_user_id, unsubscribed_at, notes, utm_source, utm_medium, utm_campaign',
    )
    .order('captured_at', { ascending: false })
    .limit(500);

  if (stage && stage !== 'all') query = query.eq('funnel_stage', stage);
  if (source && source !== 'all') query = query.eq('source', source);

  const { data: leads, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate counts per stage (across the WHOLE table, not the filter)
  const { data: allForCounts } = await supabase
    .from('consumer_leads')
    .select('funnel_stage, intended_tier, captured_at, email_count')
    .limit(5000);

  const stageCounts: Record<string, number> = {};
  let revenueRecovered = 0;
  let totalEmailsSent = 0;
  let capturedThisWeek = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const r of allForCounts ?? []) {
    stageCounts[r.funnel_stage] = (stageCounts[r.funnel_stage] || 0) + 1;
    if (r.funnel_stage === 'converted_paid' && r.intended_tier) {
      revenueRecovered += TIER_PRICE[r.intended_tier as string] ?? 0;
    }
    totalEmailsSent += r.email_count ?? 0;
    if (new Date(r.captured_at).getTime() >= weekAgo) capturedThisWeek += 1;
  }
  const totalCaptured = (allForCounts ?? []).length;
  const converted = stageCounts.converted_paid ?? 0;
  const recoveryRate = totalCaptured > 0 ? converted / totalCaptured : 0;
  const costPerLead = totalCaptured > 0 ? (totalEmailsSent * 0.0004) / totalCaptured : 0;

  return NextResponse.json({
    leads: leads ?? [],
    metrics: {
      total_captured: totalCaptured,
      captured_this_week: capturedThisWeek,
      converted,
      recovery_rate: recoveryRate,
      revenue_recovered_pounds: revenueRecovered,
      cost_per_lead_pounds: costPerLead,
      stage_counts: stageCounts,
    },
  });
}
