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
        id, entry_type, title, content, summary, attachments, task_id, entry_date, created_at
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

  // Sort correspondence by date ascending (oldest first = thread order)
  if (dispute.correspondence) {
    dispute.correspondence.sort(
      (a: any, b: any) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
    );
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

  return NextResponse.json({
    ...dispute,
    correspondence: enrichedCorrespondence,
  });
}

// PATCH /api/disputes/[id] — update dispute status or details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const allowedFields: Record<string, any> = {};
  if (body.status) allowedFields.status = body.status;
  if (body.provider_name) allowedFields.provider_name = body.provider_name;
  if (body.desired_outcome !== undefined) allowedFields.desired_outcome = body.desired_outcome;
  if (body.disputed_amount !== undefined) allowedFields.disputed_amount = body.disputed_amount ? parseFloat(body.disputed_amount) : null;
  if (body.money_recovered !== undefined) allowedFields.money_recovered = parseFloat(body.money_recovered);
  if (body.outcome_notes !== undefined) allowedFields.outcome_notes = body.outcome_notes;
  if (body.account_number !== undefined) allowedFields.account_number = body.account_number;

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
