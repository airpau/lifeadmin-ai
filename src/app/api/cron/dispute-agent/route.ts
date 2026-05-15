/**
 * Dispute Agent cron — autonomous driver of every open dispute.
 *
 * Runs 4× daily (00:00 / 06:00 / 12:00 / 18:00 UTC). Pulls every
 * dispute due for an agent tick, runs `decideNextAction`, persists the
 * decision to `dispute_agent_decisions`, advances `agent_state`, and
 * surfaces high-signal actions via Pocket Agent (WhatsApp/Telegram)
 * with an email fallback.
 *
 * Caps at 100 disputes per tick. Defers the rest to the next run.
 *
 * AI proposes — user approves. We never auto-send a letter. The cron
 * only writes decision rows + sends push prompts.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  decideNextAction,
  type DisputeRow,
  type CorrespondenceRow,
  type AgentDecision,
} from '@/lib/dispute-agent/state-machine';
import {
  dispatchPocketAgentAlert,
  listActivePocketAgentSessions,
  type ActiveSession,
} from '@/lib/pocket-agent/dispatch';
import type { ScopeStats, MerchantLegalRefStat } from '@/lib/dispute-outcome/stats';
import { sendPaybackerEmail } from '@/lib/email/send';
import { card, paragraph } from '@/lib/email/PaybackerEmailLayout';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PER_RUN = 100;
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

function isAuthorised(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev / preview fallback
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  return runAgent();
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  return runAgent();
}

async function runAgent() {
  const sb = admin();
  const nowIso = new Date().toISOString();

  const { data: dueDisputes, error: dueErr } = await sb
    .from('disputes')
    .select(
      'id,user_id,provider_name,merchant_normalised,dispute_type,status,agent_state,agent_state_set_at,created_at,sent_at,first_letter_sent_at,last_letter_sent_at,last_reply_received_at,last_response_at,fca_8_week_deadline,expected_response_by,reminder_count,outcome,resolved_at,archived_at,agent_paused_until',
    )
    .or(`next_agent_action_at.is.null,next_agent_action_at.lte.${nowIso}`)
    .or(`agent_state.is.null,agent_state.not.in.(resolved_won,resolved_partial,resolved_lost,withdrawn,timeout)`)
    .is('archived_at', null)
    .neq('agent_disabled', true)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (dueErr) {
    return NextResponse.json({ ok: false, error: dueErr.message }, { status: 500 });
  }

  const disputes = (dueDisputes ?? []) as Array<DisputeRow & { agent_paused_until: string | null }>;

  // Cache active Pocket Agent sessions once.
  const sessions = await listActivePocketAgentSessions(sb);
  const sessionByUser = new Map<string, ActiveSession>();
  for (const s of sessions) sessionByUser.set(s.user_id, s);

  // Cache intelligence stats globally (reused across disputes).
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

  const results: Array<{ id: string; action: string; surfaced: boolean }> = [];

  for (const d of disputes) {
    // Honour user pause.
    if (d.agent_paused_until && Date.parse(d.agent_paused_until) > Date.now()) {
      continue;
    }

    // Load the last 30 days of correspondence.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: corrRows } = await sb
      .from('dispute_correspondence')
      .select('id,dispute_id,correspondence_type,email_date,subject,summary,created_at')
      .eq('dispute_id', d.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    const correspondence = (corrRows ?? []) as CorrespondenceRow[];

    // Filter intelligence stats to ones relevant for this dispute.
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
      console.warn('[cron/dispute-agent] decideNextAction failed', d.id, err);
      continue;
    }

    // Insert decision row.
    const surfacedVia: string[] = [];
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
        surfaced_via: surfacedVia,
      })
      .select('id')
      .single();
    if (insErr) {
      console.warn('[cron/dispute-agent] decision insert failed', d.id, insErr.message);
    }

    // Advance dispute state.
    await sb
      .from('disputes')
      .update({
        agent_state: decision.to_state,
        agent_state_set_at: nowIso,
        next_agent_action_at: decision.next_check_at.toISOString(),
      })
      .eq('id', d.id);

    let surfaced = false;
    if (decision.surface_to_user) {
      surfaced = await surfaceDecision({
        sb,
        dispute: d,
        decision,
        decisionId: inserted?.id ?? null,
        sessionByUser,
      });
      if (surfaced && inserted?.id) {
        await sb
          .from('dispute_agent_decisions')
          .update({ surfaced_via: surfacedVia.length ? surfacedVia : ['email'] })
          .eq('id', inserted.id);
      }
    }

    results.push({ id: d.id, action: decision.action, surfaced });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

async function surfaceDecision(args: {
  sb: ReturnType<typeof admin>;
  dispute: DisputeRow;
  decision: AgentDecision;
  decisionId: number | null;
  sessionByUser: Map<string, ActiveSession>;
}): Promise<boolean> {
  const { sb, dispute, decision, decisionId, sessionByUser } = args;
  const merchant = dispute.provider_name || dispute.merchant_normalised || 'this merchant';
  const cta = ctaFor(decision.action);
  const summary = decision.rationale.slice(0, 140);
  const surfacedVia: string[] = [];

  const session = sessionByUser.get(dispute.user_id);
  if (session) {
    try {
      const result = await dispatchPocketAgentAlert({
        session,
        alertType: 'dispute_agent_action',
        detectedIssueId: dispute.id,
        telegram: {
          title: `Dispute update: ${merchant}`,
          detail: decision.rationale,
          recommendation: cta,
        },
        whatsappVars: {
          merchant,
          action_summary: summary,
          cta,
        },
      });
      if (result.ok) surfacedVia.push(session.channel);
    } catch (err) {
      console.warn('[cron/dispute-agent] dispatch failed', dispute.id, err);
    }
  }

  // Email fallback when no Pocket Agent session OR push failed.
  // sendPaybackerEmail does NOT throw on Resend rejection — it returns
  // {ok:false}. Only mark `email` as surfaced when delivery actually
  // succeeded so transient outages stay flagged as un-surfaced and
  // get retried on the next cron tick.
  if (surfacedVia.length === 0) {
    try {
      const result = await sendEmailFallback({ sb, dispute, decision });
      if (result.ok) {
        surfacedVia.push('email');
      } else if (result.error) {
        console.warn('[cron/dispute-agent] email fallback rejected', dispute.id, result.error);
      }
    } catch (err) {
      console.warn('[cron/dispute-agent] email fallback failed', dispute.id, err);
    }
  }

  if (decisionId && surfacedVia.length > 0) {
    await sb
      .from('dispute_agent_decisions')
      .update({ surfaced_via: surfacedVia })
      .eq('id', decisionId);
  }
  return surfacedVia.length > 0;
}

function ctaFor(action: AgentDecision['action']): string {
  switch (action) {
    case 'send_initial_letter':
      return 'review and send';
    case 'send_followup':
      return 'send the followup';
    case 'escalate_ombudsman':
      return 'escalate now';
    case 'accept_partial':
      return 'review the offer';
    case 'mark_won':
      return 'confirm the win';
    case 'manual_review':
      return 'review the dispute';
    case 'send_letter_before_action':
      return 'send the LBA';
    case 'small_claims':
      return 'open small claims';
    default:
      return 'review';
  }
}

async function sendEmailFallback(args: {
  sb: ReturnType<typeof admin>;
  dispute: DisputeRow;
  decision: AgentDecision;
}): Promise<{ ok: boolean; error?: string }> {
  const { sb, dispute, decision } = args;
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'no RESEND_API_KEY' };
  const { data: profile } = await sb
    .from('profiles')
    .select('email,first_name')
    .eq('id', dispute.user_id)
    .maybeSingle();
  const email = (profile as { email?: string } | null)?.email;
  if (!email) return { ok: false, error: 'no profile email' };
  const firstName = (profile as { first_name?: string } | null)?.first_name?.trim() || 'there';
  const merchant =
    dispute.provider_name || dispute.merchant_normalised || 'your dispute';
  const recommended = ctaFor(decision.action);
  const dashboardUrl = `https://paybacker.co.uk/dashboard/disputes/${dispute.id}`;

  const body = [
    card(paragraph(decision.rationale), {
      eyebrow: `Recommendation: ${recommended}`,
    }),
    paragraph(
      `Open the dispute in Paybacker to approve, override, or snooze this recommendation. The agent only acts when you tap.`,
      { muted: true },
    ),
  ].join('');

  const result = await sendPaybackerEmail({
    to: email,
    subject: `Update on your ${merchant} dispute`,
    preheader: decision.rationale.slice(0, 90),
    heading: `Your ${merchant} dispute needs a decision, ${firstName}`,
    body,
    cta: {
      label: 'Open the dispute in Paybacker',
      href: dashboardUrl,
    },
    footnote: 'Sent by the Paybacker Dispute Agent — your AI caseworker.',
  });
  return { ok: result.ok, error: result.error };
}
