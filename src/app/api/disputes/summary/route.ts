import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/disputes/summary — get dispute summary stats for the user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Try the RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_dispute_summary', {
    p_user_id: user.id,
  });

  if (!rpcError && rpcData) {
    // RPC returns a single row or array with one row
    const summary = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return NextResponse.json({
      total_open: summary?.total_open ?? 0,
      total_resolved: summary?.total_resolved ?? 0,
      total_disputed_amount: summary?.total_disputed_amount ?? 0,
      total_recovered: summary?.total_recovered ?? 0,
    });
  }

  // Fallback: compute from direct queries
  const { data: disputes } = await supabase
    .from('disputes')
    .select('status, disputed_amount, money_recovered')
    .eq('user_id', user.id);

  if (!disputes) {
    return NextResponse.json({
      total_open: 0,
      total_resolved: 0,
      total_disputed_amount: 0,
      total_recovered: 0,
    });
  }

  // Terminal = any status where the dispute is closed (won, partial, lost, or user-closed).
  // Won = only the states where the user actually got something back. The "Resolved" KPI
  // on the Disputes Centre is labelled "Closed · won or settled" — semantically wins only.
  // Counting lost/closed in it was the reason the card stayed at 0 for users who had
  // won cases: a resolved_won row was getting *diluted* by the label's promise.
  const terminalStatuses = ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'];
  const wonStatuses = ['resolved_won', 'resolved_partial'];
  const total_open = disputes.filter(d => !terminalStatuses.includes(d.status)).length;
  const total_resolved = disputes.filter(d => wonStatuses.includes(d.status)).length;
  const total_disputed_amount = disputes
    .filter(d => !terminalStatuses.includes(d.status))
    .reduce((sum, d) => sum + (d.disputed_amount || 0), 0);
  const total_recovered = disputes
    .filter(d => wonStatuses.includes(d.status))
    .reduce((sum, d) => sum + (d.money_recovered || 0), 0);

  return NextResponse.json({
    total_open,
    total_resolved,
    total_disputed_amount,
    total_recovered,
  });
}
