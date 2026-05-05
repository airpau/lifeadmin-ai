/**
 * Returns the latest pending agent decision + the recent decision log
 * for a single dispute. Used by the DisputeAgentBanner client
 * component on the disputes page.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const sb = admin();
  const { data: dispute } = await sb
    .from('disputes')
    .select('id,user_id,provider_name,merchant_normalised,agent_state,agent_paused_until,next_agent_action_at')
    .eq('id', disputeId)
    .maybeSingle();
  if (!dispute || dispute.user_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: decisions } = await sb
    .from('dispute_agent_decisions')
    .select('id,decided_at,from_state,to_state,recommended_action,rationale,data_grounded,historical_signal,user_action,surfaced_via')
    .eq('dispute_id', disputeId)
    .order('decided_at', { ascending: false })
    .limit(20);

  const list = decisions ?? [];
  const latestPending = list.find((d) => !d.user_action) ?? null;

  return NextResponse.json({
    ok: true,
    dispute: {
      id: dispute.id,
      provider_name: dispute.provider_name,
      merchant_normalised: dispute.merchant_normalised,
      agent_state: dispute.agent_state,
      agent_paused_until: dispute.agent_paused_until,
      next_agent_action_at: dispute.next_agent_action_at,
    },
    latest: latestPending,
    history: list,
  });
}
