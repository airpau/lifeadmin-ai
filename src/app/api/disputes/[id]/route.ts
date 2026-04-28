import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/disputes/[id] — get full dispute with correspondence thread
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: dispute, error } = await supabase
    .from('disputes')
    .select(`
      *,
      correspondence(
        id, entry_type, title, content, summary, attachments, task_id, entry_date, created_at,
        detected_from_email, sender_address, email_thread_id, supplier_message_id, supplier_web_link,
        ai_respond_needed, ai_urgency, ai_rationale
      ),
      contract_extractions(
        id, file_url, file_name, provider_name, contract_start_date, contract_end_date,
        minimum_term, notice_period, cancellation_fee, early_exit_fee, price_increase_clause,
        auto_renewal, cooling_off_period, unfair_clauses, raw_summary, created_at
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  // Sort correspondence by entry_date ascending (oldest first =
  // thread order). Use created_at as a tiebreaker so entries with the
  // same entry_date (common when a user pastes a manual entry on the
  // same day other activity happened) appear in insert order — most
  // recently saved goes last.
  if (dispute.correspondence) {
    dispute.correspondence.sort((a: any, b: any) => {
      const da = new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime();
      if (da !== 0) return da;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  // Fetch linked agent_runs for AI letters to get legal refs + success rate
  const letterTaskIds = (dispute.correspondence || [])
    .filter((c: any) => c.task_id)
    .map((c: any) => c.task_id);

  let agentRuns: any[] = [];
  if (letterTaskIds.length > 0) {
    const { data } = await supabase
      .from('agent_runs')
      .select('task_id, output_data')
      .in('task_id', letterTaskIds);
    agentRuns = data || [];
  }

  // Attach agent run data to correspondence entries
  const enrichedCorrespondence = (dispute.correspondence || []).map((c: any) => {
    if (c.task_id) {
      const run = agentRuns.find((r: any) => r.task_id === c.task_id);
      if (run?.output_data) {
        return {
          ...c,
          legal_references: run.output_data.legalReferences || [],
          rights_pills: run.output_data.rightsPills || [],
          estimated_success: run.output_data.estimatedSuccess || null,
          next_steps: run.output_data.nextSteps || [],
          escalation_path: run.output_data.escalationPath || null,
        };
      }
    }
    return c;
  });

  // Flag which mail providers the user has connected so the UI can
  // gate the "Open in Gmail" / "Open in Outlook" deep-links — those
  // deep-links only resolve in the matching web mail app, so without
  // the gate clicking them just lands a signed-in user on their own
  // empty inbox.
  const { data: emailConns } = await supabase
    .from('email_connections')
    .select('provider_type')
    .eq('user_id', user.id)
    .eq('status', 'active');
  // Handle both the canonical values ('google', 'outlook') and the legacy
  // aliases ('gmail', 'microsoft') that still exist on older rows — see
  // providerFromConnection in src/lib/dispute-sync/types.ts for the full
  // normalisation table.
  const GMAIL_TYPES = new Set(['google', 'gmail']);
  const OUTLOOK_TYPES = new Set(['outlook', 'microsoft']);
  const userHasGmail = (emailConns ?? []).some((c) => GMAIL_TYPES.has(c.provider_type));
  const userHasOutlook = (emailConns ?? []).some((c) => OUTLOOK_TYPES.has(c.provider_type));

  return NextResponse.json({
    ...dispute,
    correspondence: enrichedCorrespondence,
    user_has_gmail: userHasGmail,
    user_has_outlook: userHasOutlook,
  });
}

// PUT /api/disputes/[id] — update dispute status (calls update_dispute_status RPC)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const validStatuses = ['open', 'in_progress', 'awaiting_response', 'escalated', 'ombudsman'];
  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') }, { status: 400 });
  }

  // Try the RPC first; fall back to direct update if the function doesn't exist yet
  const { data: rpcData, error: rpcError } = await supabase.rpc('update_dispute_status', {
    p_user_id: user.id,
    p_dispute_id: id,
    p_status: body.status,
    p_notes: body.notes || null,
  });

  if (rpcError) {
    // Fallback to direct update if RPC not available
    const { data, error } = await supabase
      .from('disputes')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update dispute status:', error);
      return NextResponse.json({ error: 'Failed to update dispute status' }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // Re-fetch the updated dispute
  const { data: updated } = await supabase
    .from('disputes')
    .select()
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  return NextResponse.json(updated || rpcData);
}

// PATCH /api/disputes/[id] — resolve dispute or update details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // If resolving the dispute (outcome is provided), use the resolve_dispute RPC
  if (body.outcome) {
    const validOutcomes = ['won', 'partial', 'lost', 'withdrawn'];
    if (!validOutcomes.includes(body.outcome)) {
      return NextResponse.json({ error: 'Invalid outcome. Must be one of: ' + validOutcomes.join(', ') }, { status: 400 });
    }

    const moneyRecovered = body.money_recovered ? parseFloat(body.money_recovered) : 0;

    // Try the RPC first
    const { error: rpcError } = await supabase.rpc('resolve_dispute', {
      p_user_id: user.id,
      p_dispute_id: id,
      p_outcome: body.outcome,
      p_money_recovered: moneyRecovered,
      p_outcome_notes: body.outcome_notes || null,
    });

    if (rpcError) {
      // Fallback: direct update
      const statusMap: Record<string, string> = {
        won: 'resolved_won',
        partial: 'resolved_partial',
        lost: 'resolved_lost',
        withdrawn: 'closed',
      };

      const { data, error } = await supabase
        .from('disputes')
        .update({
          status: statusMap[body.outcome] || 'closed',
          money_recovered: moneyRecovered,
          outcome_notes: body.outcome_notes || null,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Failed to resolve dispute:', error);
        return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 });
      }
      // Same subscription auto-cancel as the RPC path — same guards:
      // outcome='won' AND issue_type='cancellation'. See the longer
      // comment below for rationale.
      if (body.outcome === 'won' && data?.provider_name && data?.issue_type === 'cancellation') {
        const { error: cancelErr } = await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            notes: `Auto-cancelled on dispute resolution (${id.slice(0, 8)})`,
          })
          .eq('user_id', user.id)
          .eq('status', 'pending_cancellation')
          .ilike('provider_name', data.provider_name);
        if (cancelErr) {
          console.error('[disputes.resolve.fallback] subscription auto-cancel failed:', cancelErr.message);
        }
      }
      return NextResponse.json(data);
    }

    // Re-fetch after RPC success
    const { data: resolved } = await supabase
      .from('disputes')
      .select()
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    // Close the cancellation loop. When a dispute that was opened
    // specifically to cancel a subscription resolves as "won", the
    // matching subscription is still sitting at pending_cancellation
    // because nothing else progresses it. Flip it to cancelled + stamp
    // cancelled_at so Money Hub, subscription counts and the
    // Subscriptions UI all catch up without the user having to mark
    // two things manually.
    //
    // GUARDS:
    //  - outcome must be 'won' — 'partial' = reduced-rate deal kept,
    //    'lost' = cancellation refused, 'withdrawn' = user backed out.
    //  - dispute issue_type must be 'cancellation' — Codex P1: a 'won'
    //    energy/refund dispute against the same provider as an active
    //    subscription must NOT auto-cancel that subscription. Only
    //    cancellation-flow disputes signal cancel intent.
    if (body.outcome === 'won' && resolved?.provider_name && resolved?.issue_type === 'cancellation') {
      const { data: matched, error: cancelErr } = await supabase
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          notes: `Auto-cancelled on dispute resolution (${id.slice(0, 8)})`,
        })
        .eq('user_id', user.id)
        .eq('status', 'pending_cancellation')
        .ilike('provider_name', resolved.provider_name)
        .select('id, provider_name');
      if (cancelErr) {
        // Codex P2 — surface the error rather than just throwing past
        // it. Still non-fatal so the dispute resolution response
        // returns OK; admins can see the failure in the logs.
        console.error('[disputes.resolve] subscription auto-cancel failed:', cancelErr.message);
      } else if (matched && matched.length > 0) {
        console.log(`[disputes.resolve] auto-cancelled ${matched.length} subscription(s) for ${resolved.provider_name}`);
      }
    }

    return NextResponse.json(resolved);
  }

  // Otherwise, general field update (existing behaviour)
  const allowedFields: Record<string, any> = {};
  if (body.status) allowedFields.status = body.status;
  if (body.provider_name) allowedFields.provider_name = body.provider_name;
  if (body.desired_outcome !== undefined) allowedFields.desired_outcome = body.desired_outcome;
  if (body.disputed_amount !== undefined) allowedFields.disputed_amount = body.disputed_amount ? parseFloat(body.disputed_amount) : null;
  if (body.money_recovered !== undefined) allowedFields.money_recovered = parseFloat(body.money_recovered);
  if (body.outcome_notes !== undefined) allowedFields.outcome_notes = body.outcome_notes;
  if (body.account_number !== undefined) allowedFields.account_number = body.account_number;
  if (body.issue_summary !== undefined) allowedFields.issue_summary = body.issue_summary;
  if (body.issue_type !== undefined) {
    const allowed = new Set(['complaint','energy_dispute','broadband_complaint','flight_compensation','parking_appeal','debt_dispute','refund_request','hmrc_tax_rebate','council_tax_band','dvla_vehicle','nhs_complaint']);
    if (allowed.has(body.issue_type)) allowedFields.issue_type = body.issue_type;
  }

  // Auto-set resolved_at when status changes to resolved
  if (body.status?.startsWith('resolved_')) {
    allowedFields.resolved_at = new Date().toISOString();
  }

  allowedFields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('disputes')
    .update(allowedFields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update dispute:', error);
    return NextResponse.json({ error: 'Failed to update dispute' }, { status: 500 });
  }

  return NextResponse.json(data);
}
