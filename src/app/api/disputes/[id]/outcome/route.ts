/**
 * POST /api/disputes/[id]/outcome
 *
 * Tags an outcome on a dispute and writes a row to dispute_outcome_events
 * for the intelligence flywheel. Sits alongside the existing PATCH
 * /api/disputes/[id] resolve flow — both are valid; this endpoint is
 * the dataset-aware path used by the new outcome panel and by AI
 * extraction confirmations. Adds normalised merchant / industry /
 * dispute_type tags so the nightly stats cron can group on them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  inferDisputeType,
  inferIndustry,
  normaliseMerchant,
} from '@/lib/dispute-outcome/normalise';

const VALID_OUTCOMES = ['won', 'partial', 'lost', 'withdrawn', 'timeout', 'still_open'] as const;
const VALID_SOURCES = ['user', 'ai_extracted', 'admin', 'auto_timeout'] as const;
type Outcome = typeof VALID_OUTCOMES[number];
type Source = typeof VALID_SOURCES[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    outcome?: Outcome;
    source?: Source;
    confidence?: 'high' | 'medium' | 'low';
    recovered_amount_gbp?: number | string | null;
    resolution_time_days?: number | null;
    escalation_path?: string[];
    closed_by?: string | null;
    notes?: string | null;
    ai_evidence_excerpt?: string | null;
  };
  try { body = await request.json(); } catch { body = {}; }

  const outcome = body.outcome;
  if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
    return NextResponse.json(
      { error: `Invalid outcome. Must be one of: ${VALID_OUTCOMES.join(', ')}` },
      { status: 400 },
    );
  }
  const source: Source = (body.source && VALID_SOURCES.includes(body.source)) ? body.source : 'user';

  // Load dispute (RLS scopes to owner)
  const { data: dispute, error: loadErr } = await supabase
    .from('disputes')
    .select('id, user_id, provider_name, provider_type, issue_type, issue_summary, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (loadErr || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const recoveredNum =
    body.recovered_amount_gbp == null
      ? null
      : Number(body.recovered_amount_gbp);
  const recovered = Number.isFinite(recoveredNum as number) ? (recoveredNum as number) : null;

  const resolutionDays =
    typeof body.resolution_time_days === 'number'
      ? body.resolution_time_days
      : Math.max(
          0,
          Math.round(
            (Date.now() - new Date(dispute.created_at as string).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );

  const merchantNorm = normaliseMerchant(dispute.provider_name as string | null);
  const industry = inferIndustry(dispute.provider_name as string | null) || (dispute.provider_type as string | null) || null;
  const disputeType = inferDisputeType(
    dispute.issue_type as string | null,
    dispute.issue_summary as string | null,
  );

  const isTerminal = outcome !== 'still_open';
  const updatePatch: Record<string, unknown> = {
    outcome,
    outcome_set_at: new Date().toISOString(),
    outcome_set_by: source,
    outcome_confidence: body.confidence ?? null,
    recovered_amount_gbp: recovered,
    resolution_time_days: resolutionDays,
    escalation_path: body.escalation_path ?? null,
    closed_by: body.closed_by ?? (isTerminal ? 'user' : null),
    merchant_normalised: merchantNorm,
    merchant_industry: industry,
    dispute_type: disputeType,
    outcome_notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (isTerminal) {
    updatePatch.resolved_at = new Date().toISOString();
    updatePatch.money_recovered = recovered ?? 0;
    if (outcome === 'won') updatePatch.status = 'resolved_won';
    else if (outcome === 'partial') updatePatch.status = 'resolved_partial';
    else if (outcome === 'lost') updatePatch.status = 'resolved_lost';
    else updatePatch.status = 'closed';
  }

  const { error: updErr } = await supabase
    .from('disputes')
    .update(updatePatch)
    .eq('id', id)
    .eq('user_id', user.id);
  if (updErr) {
    console.error('[disputes.outcome] update failed:', updErr.message);
    return NextResponse.json({ error: 'Failed to tag outcome' }, { status: 500 });
  }

  // Append to outcome event log (history of how the outcome evolved).
  const { error: evErr } = await supabase.from('dispute_outcome_events').insert({
    dispute_id: id,
    source,
    outcome,
    recovered_amount_gbp: recovered,
    notes: body.notes ?? null,
    ai_evidence_excerpt: body.ai_evidence_excerpt ?? null,
    user_id: user.id,
  });
  if (evErr) {
    console.warn('[disputes.outcome] event-log insert failed (non-fatal):', evErr.message);
  }

  return NextResponse.json({ ok: true, outcome, recovered_amount_gbp: recovered });
}
