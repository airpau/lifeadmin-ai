/**
 * User approves / overrides / snoozes the latest agent recommendation
 * for a dispute. Records the user's response on the decision row so
 * the engine can learn from disagreements; for snooze, pauses the
 * agent on the dispute until the requested time.
 *
 * The approve path does NOT auto-send a letter. It records intent —
 * the actual letter draft + send is a separate user-driven flow.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logAlertInteraction } from '@/lib/alert-interactions';

export const dynamic = 'force-dynamic';

interface Body {
  decision_id: number | string;
  action: 'approve' | 'override' | 'snooze';
  override_target_action?: string;
  snooze_until?: string;
}

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const sb = admin();
  const { data: dispute } = await sb
    .from('disputes')
    .select('id,user_id')
    .eq('id', disputeId)
    .maybeSingle();
  if (!dispute || dispute.user_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (!body?.decision_id || !body?.action) {
    return NextResponse.json({ error: 'decision_id and action required' }, { status: 400 });
  }
  if (!['approve', 'override', 'snooze'].includes(body.action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  const userActionLabel = body.action === 'approve' ? 'approved'
    : body.action === 'override' ? 'overrode'
    : 'snoozed';

  const updatePayload: Record<string, unknown> = {
    user_action: userActionLabel,
    user_action_at: new Date().toISOString(),
  };
  if (body.action === 'override' && body.override_target_action) {
    updatePayload.recommended_action = body.override_target_action;
  }

  const { data: updatedDecision, error: updErr } = await sb
    .from('dispute_agent_decisions')
    .update(updatePayload)
    .eq('id', body.decision_id)
    .eq('dispute_id', disputeId)
    .select('id,to_state,recommended_action')
    .single();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (body.action === 'snooze') {
    const until = body.snooze_until ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await sb
      .from('disputes')
      .update({ agent_paused_until: until, next_agent_action_at: until })
      .eq('id', disputeId);
  }

  // Log the agent-recommendation interaction so the learning loop sees
  // approve / override / snooze rates on dispute-agent decisions.
  void logAlertInteraction({
    userId: user.id,
    alertType: 'dispute_agent_recommendation',
    alertKey: disputeId,
    action: body.action === 'approve' ? 'acted' : body.action === 'snooze' ? 'snoozed' : 'dismissed',
    surface: 'web',
    metadata: {
      decision_id: body.decision_id,
      recommended_action: updatedDecision?.recommended_action,
      override_target: body.override_target_action ?? null,
      user_decision: body.action,
    },
    client: sb,
  });

  if (body.action === 'approve' && updatedDecision?.to_state) {
    // Approving a recommendation locks in the agent's proposed state.
    // We log a row in dispute_outcome_events when the proposed state is
    // a terminal/escalation transition so the dataset captures the move.
    const terminal = new Set(['resolved_won', 'resolved_partial', 'resolved_lost', 'escalated']);
    if (terminal.has(updatedDecision.to_state)) {
      const outcome = updatedDecision.to_state.startsWith('resolved_')
        ? updatedDecision.to_state.replace('resolved_', '')
        : 'escalated';
      await sb.from('dispute_outcome_events').insert({
        dispute_id: disputeId,
        user_id: user.id,
        source: 'user_confirmed',
        outcome,
        notes: `User approved agent recommendation: ${updatedDecision.recommended_action}`,
      }).then(() => undefined, () => undefined);
    }

    // Phase 4 — letter recipient engagement loop. When the user approves
    // a letter-shaped recommendation, emit a letter_sent event scoped to
    // the letter kind. The supplier_response_received trigger (from
    // migration 20260608140000) fires on inbound replies; the aggregator
    // joins by dispute_id (via predicted->>dispute_id) to compute per-
    // letter-kind reply rate + response time. Feeds the dispute-agent's
    // escalation timing in future runs.
    const LETTER_ACTIONS = new Set([
      'send_initial_letter',
      'send_followup',
      'send_letter_before_action',
      'escalate_ombudsman',
      'small_claims',
    ]);
    const recommendedAction = updatedDecision.recommended_action as string | null;
    if (recommendedAction && LETTER_ACTIONS.has(recommendedAction)) {
      try {
        const { recordAction } = await import('@/lib/intelligence');
        await recordAction({
          userId: user.id,
          actor: 'ai',
          actionKind: 'letter_sent',
          subjectKind: 'letter_kind',
          subjectId: recommendedAction,
          predicted: {
            dispute_id: disputeId,
            decision_id: body.decision_id,
            to_state: updatedDecision.to_state,
            approved_via: 'agent_decision_endpoint',
          },
        });
      } catch (e) {
        console.warn('[agent-decision] letter_sent emit failed:', e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

