import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { inferOutcomeFromCorrespondence } from '@/lib/dispute-outcome/ai-extract';
import { classifyReply, CLASSIFIER_VERSION, type ReplyClassification } from '@/lib/dispute-sync/reply-classifier';
import { runDisputeAgentForDispute } from '@/lib/dispute-agent/run-agent';

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Entry types that represent an inbound message FROM the company. These
// trigger reply classification and dispute reply bookkeeping.
const COMPANY_INBOUND_TYPES = ['company_email', 'company_letter', 'company_response', 'reply_received'];

// POST /api/disputes/[id]/correspondence — add an entry to the thread
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify dispute ownership + grab context for the AI extractor/classifier
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, outcome, status, provider_name, issue_summary, issue_type, provider_type, provider_first_response_at')
    .eq('id', disputeId)
    .eq('user_id', user.id)
    .single();

  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const body = await request.json();

  if (!body.entry_type || !body.content) {
    return NextResponse.json({ error: 'Missing required fields: entry_type, content' }, { status: 400 });
  }

  const validTypes = ['company_email', 'company_letter', 'phone_call', 'user_note', 'company_response', 'action_taken'];
  if (!validTypes.includes(body.entry_type)) {
    return NextResponse.json({ error: `entry_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from('correspondence')
    .insert({
      dispute_id: disputeId,
      user_id: user.id,
      entry_type: body.entry_type,
      title: body.title || null,
      content: body.content,
      summary: body.summary || null,
      attachments: body.attachments || [],
      entry_date: body.entry_date || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to add correspondence:', error);
    return NextResponse.json({ error: 'Failed to add entry' }, { status: 500 });
  }

  const sb = admin();
  const nowIso = new Date().toISOString();
  const isCompanyInbound = COMPANY_INBOUND_TYPES.includes(body.entry_type);

  const disputeRow = dispute as {
    id: string;
    outcome: string | null;
    status: string | null;
    provider_name: string | null;
    issue_summary: string | null;
    issue_type: string | null;
    provider_type: string | null;
    provider_first_response_at: string | null;
  };

  let classification: ReplyClassification | null = null;

  if (isCompanyInbound) {
    // --- Reply classification -------------------------------------------
    // Same intelligence pass the Watchdog email sync runs: classify the
    // reply and persist the ai_* fields onto the new correspondence row so
    // the timeline and notifications can explain what the company said.
    try {
      // Pull the user's most recent letter for context (non-fatal if absent).
      let userLast5Letters = '';
      try {
        const { data: recentLetters } = await sb
          .from('correspondence')
          .select('content, entry_date')
          .eq('dispute_id', disputeId)
          .in('entry_type', ['ai_letter', 'user_note'])
          .order('entry_date', { ascending: false })
          .limit(1);
        const latest = recentLetters?.[0];
        if (latest?.content) {
          userLast5Letters = String(latest.content).slice(0, 1500);
        }
      } catch {
        // Classifier works without the letter context.
      }

      classification = await classifyReply({
        disputeTitle: disputeRow.issue_summary,
        disputeProvider: disputeRow.provider_name,
        disputeCategory: disputeRow.issue_type ?? disputeRow.provider_type,
        userLast5Letters,
        supplierSubject: body.title || '',
        supplierFromAddress: 'manual entry',
        supplierBody: String(body.content).slice(0, 8000),
        supplierReceivedAt: new Date(body.entry_date || nowIso),
      });

      await sb
        .from('correspondence')
        .update({
          ai_category: classification.category,
          ai_respond_needed: classification.respondNeeded,
          ai_urgency: classification.urgency,
          ai_rationale: classification.rationale,
          ai_suggested_reply_context: classification.suggestedContext || null,
          ai_classified_at: new Date().toISOString(),
          ai_classifier_version: CLASSIFIER_VERSION,
        })
        .eq('id', entry.id);
    } catch (err) {
      console.warn(
        '[correspondence] reply classification failed (non-fatal):',
        err instanceof Error ? err.message : err,
      );
      classification = null;
    }

    // --- Dispute reply bookkeeping --------------------------------------
    const disputeUpdate: Record<string, unknown> = {
      last_reply_received_at: nowIso,
      provider_first_response_at: disputeRow.provider_first_response_at ?? nowIso,
      updated_at: nowIso,
    };
    // Note: the disputes_status_check constraint only allows open,
    // awaiting_response, escalated, resolved_won, resolved_partial,
    // resolved_lost and closed. There is no in_progress status, so the
    // status is left unchanged here; the agent decision drives the UI.
    const { error: dispErr } = await sb
      .from('disputes')
      .update(disputeUpdate)
      .eq('id', disputeId);
    if (dispErr) {
      console.warn('[correspondence] dispute reply update failed:', dispErr.message);
    }
  } else {
    // Any other entry still bumps the dispute's updated_at.
    const { error: dispErr } = await sb
      .from('disputes')
      .update({ updated_at: nowIso })
      .eq('id', disputeId);
    if (dispErr) {
      console.warn('[correspondence] dispute touch failed:', dispErr.message);
    }
  }

  // Run the outcome extractor on incoming COMPANY correspondence only.
  // The user's own notes / actions don't carry resolution language.
  // AI proposes — user clicks Confirm in the UI to lock the outcome
  // via /api/disputes/[id]/outcome with outcome_set_by='ai_extracted'.
  let outcomeSuggestion = null;
  if (
    body.entry_type === 'company_email' ||
    body.entry_type === 'company_letter' ||
    body.entry_type === 'company_response'
  ) {
    try {
      outcomeSuggestion = await inferOutcomeFromCorrespondence(
        disputeId,
        String(body.content),
        disputeRow.outcome ?? null,
      );
    } catch (err) {
      console.warn('[correspondence] outcome extract failed (non-fatal):', (err as Error).message);
    }
  }

  // --- Wake the agent ----------------------------------------------------
  // Any new correspondence re-runs the agent for this dispute so the
  // banner recommendation is never stale after user activity. For company
  // replies this is what turns the message into an actionable next step.
  let agentDecision: { recommended_action: string; rationale: string } | null = null;
  try {
    const agentResult = await runDisputeAgentForDispute(disputeId, user.id);
    if (agentResult.ok) {
      agentDecision = {
        recommended_action: agentResult.decision.action,
        rationale: agentResult.decision.rationale,
      };
    } else {
      console.warn('[correspondence] agent re-evaluation failed:', agentResult.error);
    }
  } catch (err) {
    console.warn(
      '[correspondence] agent re-evaluation threw (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json(
    {
      ...entry,
      ...(classification
        ? {
            ai_category: classification.category,
            ai_respond_needed: classification.respondNeeded,
            ai_urgency: classification.urgency,
            ai_rationale: classification.rationale,
            ai_suggested_reply_context: classification.suggestedContext || null,
            ai_classifier_version: CLASSIFIER_VERSION,
          }
        : {}),
      outcome_suggestion: outcomeSuggestion,
      agent_decision: agentDecision,
    },
    { status: 201 }
  );
}

// DELETE /api/disputes/[id]/correspondence — delete an entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('entryId');
  if (!entryId) return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });

  const { error } = await supabase
    .from('correspondence')
    .delete()
    .eq('id', entryId)
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete correspondence:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
