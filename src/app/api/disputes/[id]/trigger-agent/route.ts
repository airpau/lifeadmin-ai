import { NextResponse, type NextRequest } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { decideNextAction, type DisputeRow, type CorrespondenceRow, type AgentDecision } from '@/lib/dispute-agent/state-machine';
import type { ScopeStats, MerchantLegalRefStat } from '@/lib/dispute-outcome/stats';

const SCOPE_KINDS = ['overall', 'merchant', 'industry', 'dispute_type', 'legal_ref', 'merchant_x_legal_ref'] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isServiceRole = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  
  let supabase;
  let userId: string | null = null;

  if (isServiceRole && process.env.CRON_SECRET) {
    supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  } else {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  }

  if (!userId && !isServiceRole) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }

  const { data: dueDisputes, error: dueErr } = await supabase
    .from('disputes')
    .select('id,user_id,provider_name,merchant_normalised,dispute_type,status,agent_state,agent_state_set_at,created_at,sent_at,first_letter_sent_at,last_letter_sent_at,last_reply_received_at,last_response_at,fca_8_week_deadline,expected_response_by,reminder_count,outcome,resolved_at,archived_at,agent_paused_until')
    .eq('id', id);

  if (dueErr || !dueDisputes || dueDisputes.length === 0) {
    return NextResponse.json({ ok: false, error: 'Dispute not found' }, { status: 404 });
  }

  const d = dueDisputes[0] as DisputeRow & { agent_paused_until: string | null };

  if (!isServiceRole && d.user_id !== userId) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }

  // Load the last 30 days of correspondence.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: corrRows } = await supabase
    .from('dispute_correspondence')
    .select('id,dispute_id,correspondence_type,email_date,subject,summary,created_at')
    .eq('dispute_id', d.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  const correspondence = (corrRows ?? []) as CorrespondenceRow[];

  // Cache intelligence stats globally (reused across disputes).
  const { data: statsRows } = await supabase
    .from('dispute_intelligence_stats')
    .select('*')
    .in('scope_kind', SCOPE_KINDS as unknown as string[])
    .order('computed_at', { ascending: false })
    .limit(5000);
  const latestPerScope = new Map<string, ScopeStats>();
  for (const r of (statsRows ?? []) as ScopeStats[]) {
    const k = `${r.scope_kind}::${r.scope_key}`;
    if (!latestPerScope.has(k)) latestPerScope.set(k, r);
  }
  const allStats = Array.from(latestPerScope.values());

  const relevant: ScopeStats[] = [];
  for (const s of allStats) {
    if (s.scope_kind === 'overall') relevant.push(s);
    if (s.scope_kind === 'merchant' && d.merchant_normalised && s.scope_key === d.merchant_normalised) relevant.push(s);
    if (s.scope_kind === 'industry' && s.scope_key && (d.dispute_type ?? '') === s.scope_key) relevant.push(s);
    if (s.scope_kind === 'dispute_type' && d.dispute_type && s.scope_key === d.dispute_type) relevant.push(s);
  }
  const merchantLegalRef: MerchantLegalRefStat[] = [];
  if (d.merchant_normalised) {
    const prefix = `${d.merchant_normalised}::`;
    for (const s of allStats) {
      if (s.scope_kind === 'merchant_x_legal_ref' && s.scope_key.startsWith(prefix) && s.total_count >= 5) {
        const [m, legal_ref] = s.scope_key.split('::');
        merchantLegalRef.push({ ...s, merchant: m, legal_ref });
      }
    }
    merchantLegalRef.sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0));
  }

  let decision: AgentDecision;
  try {
    decision = await decideNextAction(d, correspondence, relevant, merchantLegalRef);
  } catch (err: any) {
    console.warn('[api/trigger-agent] decideNextAction failed', d.id, err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }

  // Clear pending user decisions before creating a new one
  await supabase
    .from('dispute_agent_decisions')
    .delete()
    .eq('dispute_id', d.id)
    .is('user_action', null);

  const { data: inserted, error: insErr } = await supabase
    .from('dispute_agent_decisions')
    .insert({
      dispute_id: d.id,
      from_state: d.agent_state,
      to_state: decision.to_state,
      recommended_action: decision.action,
      rationale: decision.rationale,
      data_grounded: decision.data_grounded,
      historical_signal: decision.historical_signal ?? null,
      surfaced_via: [],
    })
    .select('id')
    .single();

  if (insErr) {
    console.warn('[api/trigger-agent] decision insert failed', d.id, insErr.message);
  }

  // Advance dispute state
  await supabase
    .from('disputes')
    .update({
      agent_state: decision.to_state,
      agent_state_set_at: new Date().toISOString(),
      next_agent_action_at: decision.next_check_at.toISOString(),
    })
    .eq('id', d.id);

  return NextResponse.json({ ok: true, decision });
}
