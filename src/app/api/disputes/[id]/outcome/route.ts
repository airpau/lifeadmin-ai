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
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  inferDisputeType,
  inferIndustry,
  normaliseMerchant,
} from '@/lib/dispute-outcome/normalise';
import { logAlertInteraction, responseTimeFrom } from '@/lib/alert-interactions';
import { captureServer } from '@/lib/posthog-server';
import { sendFounderAlert } from '@/lib/telegram/founder-alert';

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
    .select('id, user_id, provider_name, provider_type, issue_type, issue_summary, created_at, disputed_amount')
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

  // "How we won" snapshot for terminal outcomes: capture the shape of
  // the campaign (letters sent, laws cited, escalation, timings, money)
  // at outcome time so the intelligence flywheel can answer "what does
  // a winning dispute look like" without re-joining at query time.
  // Every lookup is tolerant — a failed query nulls that field, it
  // never blocks the outcome write.
  const disputedAmountRaw = (dispute as { disputed_amount?: unknown }).disputed_amount;
  const disputedGbp =
    disputedAmountRaw == null || !Number.isFinite(Number(disputedAmountRaw))
      ? null
      : Number(disputedAmountRaw);

  let lettersSent: number | null = null;
  let correspondenceCount: number | null = null;
  let lawsCited: Array<{ ref_id: string; law_name: string | null; section: string | null }> | null = null;

  if (isTerminal) {
    // correspondence rows for this dispute (correspondence.dispute_id
    // is the FK used across src/lib/dispute-sync and escalation-pack).
    try {
      const { count, error } = await supabase
        .from('correspondence')
        .select('id', { count: 'exact', head: true })
        .eq('dispute_id', id);
      if (!error) correspondenceCount = count ?? 0;
    } catch (e) {
      console.warn('[disputes.outcome] correspondence count failed (non-fatal):', e);
    }

    // Letters we sent (AI-drafted letters in the thread).
    try {
      const { count, error } = await supabase
        .from('correspondence')
        .select('id', { count: 'exact', head: true })
        .eq('dispute_id', id)
        .eq('entry_type', 'ai_letter');
      if (!error) lettersSent = count ?? 0;
    } catch (e) {
      console.warn('[disputes.outcome] letters count failed (non-fatal):', e);
    }

    // Laws cited: legal_ref_usages rows link to disputes via
    // artefact_id = dispute id with artefact_kind='dispute_letter'
    // (same join as the compute-dispute-intelligence cron). The table
    // is RLS-locked against non-service reads, so use the admin client;
    // skip silently if the service key isn't configured.
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && serviceKey) {
        const admin = createAdminClient(url, serviceKey);
        const { data: usageRows, error } = await admin
          .from('legal_ref_usages')
          .select('ref_id, legal_references(law_name, section)')
          .eq('artefact_kind', 'dispute_letter')
          .eq('artefact_id', id);
        if (!error && usageRows) {
          type UsageRow = {
            ref_id: string;
            legal_references:
              | { law_name: string | null; section: string | null }
              | { law_name: string | null; section: string | null }[]
              | null;
          };
          const seen = new Set<string>();
          lawsCited = [];
          for (const row of usageRows as UsageRow[]) {
            if (!row.ref_id || seen.has(row.ref_id)) continue;
            seen.add(row.ref_id);
            const ref = Array.isArray(row.legal_references)
              ? row.legal_references[0] ?? null
              : row.legal_references;
            lawsCited.push({
              ref_id: row.ref_id,
              law_name: ref?.law_name ?? null,
              section: ref?.section ?? null,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[disputes.outcome] laws-cited lookup failed (non-fatal):', e);
    }
  }

  const howWon = isTerminal
    ? {
        letters_sent: lettersSent,
        correspondence_count: correspondenceCount,
        laws_cited: lawsCited,
        laws_cited_count: lawsCited ? lawsCited.length : null,
        escalation_path: body.escalation_path ?? null,
        resolution_time_days: resolutionDays,
        provider: (dispute.provider_name as string | null) ?? null,
        industry,
        recovered_gbp: recovered,
        disputed_gbp: disputedGbp,
      }
    : null;

  // Append to outcome event log (history of how the outcome evolved).
  // The how_won column ships in migration 20260820130000; attempt the
  // insert with it and retry without on error so this code works both
  // before and after that migration is applied.
  const baseEvent = {
    dispute_id: id,
    source,
    outcome,
    recovered_amount_gbp: recovered,
    notes: body.notes ?? null,
    ai_evidence_excerpt: body.ai_evidence_excerpt ?? null,
    user_id: user.id,
  };
  let evErr: { message: string } | null = null;
  if (howWon) {
    const { error: withHowWonErr } = await supabase
      .from('dispute_outcome_events')
      .insert({ ...baseEvent, how_won: howWon });
    if (withHowWonErr) {
      console.warn(
        '[disputes.outcome] event insert with how_won failed, retrying without (column may not exist yet):',
        withHowWonErr.message,
      );
      const { error: retryErr } = await supabase.from('dispute_outcome_events').insert(baseEvent);
      evErr = retryErr;
    }
  } else {
    const { error: plainErr } = await supabase.from('dispute_outcome_events').insert(baseEvent);
    evErr = plainErr;
  }
  if (evErr) {
    console.warn('[disputes.outcome] event-log insert failed (non-fatal):', evErr.message);
  }

  // Server-side analytics — fire-and-forget, never blocks the response.
  captureServer('dispute_outcome_recorded', user.id, {
    outcome,
    provider: (dispute.provider_name as string | null) ?? null,
    industry,
    recovered_gbp: recovered,
    disputed_gbp: disputedGbp,
    resolution_days: resolutionDays,
    letters_sent: lettersSent,
    laws_cited_count: lawsCited ? lawsCited.length : 0,
    escalated: (body.escalation_path?.length ?? 0) > 0,
    source,
  });

  // Founder alert on real wins — fire-and-forget, never blocks the response.
  if ((outcome === 'won' || outcome === 'partial') && recovered != null && recovered > 0) {
    const providerLabel = (dispute.provider_name as string | null) || 'Unknown provider';
    void sendFounderAlert(
      `🏆 Dispute ${outcome}: ${providerLabel} £${recovered.toFixed(2)} recovered after ${resolutionDays} days (${lettersSent ?? 0} letters).`,
    ).catch(() => {});
  }

  void logAlertInteraction({
    userId: user.id,
    alertType: 'dispute',
    alertKey: id,
    action: 'acted',
    responseTimeSeconds: responseTimeFrom(dispute.created_at),
    surface: 'web',
    metadata: {
      outcome,
      source,
      recovered_amount_gbp: recovered,
      provider: dispute.provider_name,
    },
  });

  // Phase 1 closed loop (docs/CLOSED_LOOP_ARCHITECTURE.md): fan the
  // outcome out to every legal_ref that was cited in any letter for
  // this dispute. Equal attribution per founder decision — every ref
  // cited gets credit/blame for the outcome; recovered_gbp splits
  // equally across them so per-ref aggregates compose cleanly.
  //
  // Only fires on terminal outcomes (won / partial / lost).
  // still_open / no_response leaves the legal_ref events unmeasured
  // so they stay in the cold-start pool until a real resolution.
  if (isTerminal) {
    try {
      const intelOutcomeKind: 'won' | 'lost' =
        outcome === 'lost' ? 'lost' : 'won'; // partial counts as a win for steering purposes

      const { data: citedEvents } = await supabase
        .from('intelligence_events')
        .select('id')
        .eq('action_kind', 'legal_ref_cited')
        .is('outcome_kind', null)
        .filter('predicted->>dispute_id', 'eq', id);

      const events = (citedEvents ?? []) as Array<{ id: string }>;
      if (events.length > 0) {
        const perRefRecovered =
          recovered != null
            ? Math.round((Number(recovered) / events.length) * 100) / 100
            : null;

        const { recordOutcome } = await import('@/lib/intelligence');
        await Promise.all(
          events.map((e) =>
            recordOutcome({
              eventId: e.id,
              outcomeKind: intelOutcomeKind,
              outcome: {
                // Raw outcome label (won/partial/lost) preserved in the
                // jsonb so aggregators can distinguish full-win from
                // partial later without losing the equal-split logic.
                dispute_outcome: outcome,
                recovered_gbp: perRefRecovered,
                attribution: 'equal_split',
                cohort_size: events.length,
                dispute_id: id,
                source,
              },
            }),
          ),
        );
      }
    } catch (intelErr) {
      console.warn('[intelligence/dispute_outcome_fanout] failed (non-fatal):', intelErr);
    }
  }

  return NextResponse.json({ ok: true, outcome, recovered_amount_gbp: recovered });
}

