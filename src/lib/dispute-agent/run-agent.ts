/**
 * Shared "evaluate and record" runner for the Dispute Agent.
 *
 * Runs the full agent cycle for a single dispute: load the row and its
 * recent correspondence (from the real `correspondence` table), load the
 * relevant intelligence stats, call `decideNextAction`, clear pending
 * decisions, insert the new decision row, and advance
 * `agent_state` / `next_agent_action_at`.
 *
 * All reads and writes go through the service-role admin client so RLS
 * can never silently block the decision insert. Callers are responsible
 * for authenticating the user; pass `userId` to enforce ownership (or
 * `null` for trusted service-role callers).
 *
 * Used by:
 *   - POST /api/disputes/[id]/trigger-agent
 *   - POST /api/disputes/[id]/correspondence (re-evaluates after any new entry)
 */

import { createClient } from '@supabase/supabase-js';
import {
  decideNextAction,
  type DisputeRow,
  type CorrespondenceRow,
  type AgentDecision,
} from './state-machine';
import type { ScopeStats, MerchantLegalRefStat } from '@/lib/dispute-outcome/stats';

const SCOPE_KINDS = [
  'overall',
  'merchant',
  'industry',
  'dispute_type',
  'legal_ref',
  'merchant_x_legal_ref',
] as const;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type RunAgentResult =
  | { ok: true; decision: AgentDecision; decisionId: string | number | null }
  | { ok: false; status: number; error: string };

/**
 * Evaluate and record the next agent action for one dispute.
 *
 * @param disputeId the dispute to evaluate
 * @param userId    when non-null, the dispute must belong to this user;
 *                  pass null only from trusted (service-role) callers
 */
export async function runDisputeAgentForDispute(
  disputeId: string,
  userId: string | null,
): Promise<RunAgentResult> {
  const sb = admin();

  const { data: disputeRows, error: dueErr } = await sb
    .from('disputes')
    .select('id,user_id,provider_name,merchant_normalised,dispute_type,status,agent_state,agent_state_set_at,created_at,sent_at,first_letter_sent_at,last_letter_sent_at,last_reply_received_at,last_response_at,fca_8_week_deadline,expected_response_by,reminder_count,outcome,resolved_at,archived_at,agent_paused_until')
    .eq('id', disputeId);

  if (dueErr || !disputeRows || disputeRows.length === 0) {
    return { ok: false, status: 404, error: 'Dispute not found' };
  }

  const d = disputeRows[0] as DisputeRow & { agent_paused_until: string | null };

  if (userId && d.user_id !== userId) {
    return { ok: false, status: 404, error: 'Dispute not found' };
  }

  // Load the last 30 days of correspondence from the real thread table,
  // mapping entry_type/entry_date/title onto the shape the state machine
  // expects (correspondence_type/email_date/subject).
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: corrRows } = await sb
    .from('correspondence')
    .select('id,dispute_id,correspondence_type:entry_type,email_date:entry_date,subject:title,summary,created_at')
    .eq('dispute_id', d.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  const correspondence = (corrRows ?? []) as unknown as CorrespondenceRow[];

  // Intelligence stats relevant to this dispute.
  const { data: statsRows } = await sb
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
  } catch (err) {
    console.warn('[dispute-agent/run-agent] decideNextAction failed', d.id, err);
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : 'Agent evaluation failed',
    };
  }

  // Clear pending user decisions before creating a new one.
  const { error: delErr } = await sb
    .from('dispute_agent_decisions')
    .delete()
    .eq('dispute_id', d.id)
    .is('user_action', null);
  if (delErr) {
    console.warn('[dispute-agent/run-agent] pending decision delete failed', d.id, delErr.message);
  }

  const { data: inserted, error: insErr } = await sb
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
    console.error('[dispute-agent/run-agent] decision insert failed', d.id, insErr.message);
    return {
      ok: false,
      status: 500,
      error: `Failed to record agent decision: ${insErr.message}`,
    };
  }

  // Advance dispute state.
  const { error: updErr } = await sb
    .from('disputes')
    .update({
      agent_state: decision.to_state,
      agent_state_set_at: new Date().toISOString(),
      next_agent_action_at: decision.next_check_at.toISOString(),
    })
    .eq('id', d.id);

  if (updErr) {
    console.error('[dispute-agent/run-agent] dispute state update failed', d.id, updErr.message);
    return {
      ok: false,
      status: 500,
      error: `Failed to update dispute state: ${updErr.message}`,
    };
  }

  return { ok: true, decision, decisionId: inserted?.id ?? null };
}
