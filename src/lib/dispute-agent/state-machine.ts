/**
 * Dispute Agent — state machine + decision engine.
 *
 * The agent owns each open dispute end-to-end. Every cron tick it loads
 * the row, recent correspondence, and the relevant intelligence_stats
 * scopes, then decides the next action. The decision is logged to
 * `dispute_agent_decisions` so the user can see what the agent did and
 * why.
 *
 * Two layers of intelligence:
 *   1. Heuristic-first — FCA 8-week clock, 14-day no-response triggers,
 *      AI-extracted outcome on incoming correspondence.
 *   2. Data-grounded — once `dispute_intelligence_stats` has >=5 cases
 *      for `(merchant_normalised, legal_ref)`, the engine ranks actions
 *      by historical win rate. `data_grounded` flips to true and
 *      `historical_signal` is populated.
 *
 * AI proposes — user approves. The engine never auto-sends a letter.
 */

import { inferOutcomeFromCorrespondence } from '@/lib/dispute-outcome/ai-extract';
import type { ScopeStats, MerchantLegalRefStat } from '@/lib/dispute-outcome/stats';

export type AgentState =
  | 'draft'
  | 'sent'
  | 'responded'
  | 'awaiting_user_input'
  | 'escalation_due'
  | 'escalated'
  | 'resolved_won'
  | 'resolved_partial'
  | 'resolved_lost'
  | 'withdrawn'
  | 'timeout'
  | 'still_open';

export type AgentAction =
  | 'send_initial_letter'
  | 'wait_for_response'
  | 'send_followup'
  | 'classify_response'
  | 'accept_partial'
  | 'escalate_ombudsman'
  | 'send_letter_before_action'
  | 'small_claims'
  | 'mark_won'
  | 'mark_partial'
  | 'mark_lost'
  | 'manual_review'
  | 'wait';

export interface DisputeRow {
  id: string;
  user_id: string;
  provider_name: string | null;
  merchant_normalised: string | null;
  dispute_type: string | null;
  status: string | null;
  agent_state: AgentState | null;
  agent_state_set_at: string | null;
  created_at: string;
  sent_at: string | null;
  first_letter_sent_at: string | null;
  last_letter_sent_at: string | null;
  last_reply_received_at: string | null;
  last_response_at: string | null;
  fca_8_week_deadline: string | null;
  expected_response_by: string | null;
  reminder_count: number | null;
  outcome: string | null;
  resolved_at: string | null;
  archived_at: string | null;
}

export interface CorrespondenceRow {
  id: string;
  dispute_id: string;
  correspondence_type: string | null;
  email_date: string | null;
  subject: string | null;
  summary: string | null;
  created_at: string;
}

export interface AgentDecision {
  to_state: AgentState;
  action: AgentAction;
  rationale: string;
  next_check_at: Date;
  surface_to_user: boolean;
  data_grounded: boolean;
  historical_signal?: {
    merchant_win_rate: number;
    top_legal_basis: string;
    sample_size: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_NO_REPLY_DAYS = 14;
const POST_DECISION_RECHECK_DAYS = 7;
const FCA_8_WEEK_GRACE_DAYS = 7;
const ESCALATION_STALL_DAYS = 90;

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / DAY_MS;
}

function plus(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

/** True when AI-extracted outcome on the latest inbound is present and reliable. */
function isInboundFromCompany(c: CorrespondenceRow): boolean {
  const t = (c.correspondence_type ?? '').toLowerCase();
  return (
    t === 'company_email' ||
    t === 'company_letter' ||
    t === 'company_response' ||
    t === 'reply_received'
  );
}

function latestInbound(correspondence: CorrespondenceRow[]): CorrespondenceRow | null {
  const inbound = correspondence
    .filter(isInboundFromCompany)
    .sort((a, b) => {
      const ad = Date.parse(a.email_date ?? a.created_at);
      const bd = Date.parse(b.email_date ?? b.created_at);
      return bd - ad;
    });
  return inbound[0] ?? null;
}

/** Pick the best historical signal from intelligence stats for this dispute. */
function pickHistoricalSignal(
  merchantNormalised: string | null,
  intelligenceStats: ScopeStats[],
  merchantLegalRefStats?: MerchantLegalRefStat[],
): AgentDecision['historical_signal'] | undefined {
  if (!merchantNormalised) return undefined;
  // Prefer merchant_x_legal_ref top win rate when sample >= 5
  if (merchantLegalRefStats && merchantLegalRefStats.length > 0) {
    const top = merchantLegalRefStats[0];
    if (top.total_count >= 5 && top.win_rate != null) {
      return {
        merchant_win_rate: top.win_rate,
        top_legal_basis: top.legal_ref,
        sample_size: top.total_count,
      };
    }
  }
  // Fall back to merchant-level
  const merchant = intelligenceStats.find(
    (s) => s.scope_kind === 'merchant' && s.scope_key === merchantNormalised,
  );
  if (merchant && merchant.total_count >= 5 && merchant.win_rate != null) {
    return {
      merchant_win_rate: merchant.win_rate,
      top_legal_basis: 'overall',
      sample_size: merchant.total_count,
    };
  }
  return undefined;
}

function ombudsmanForType(disputeType: string | null): string {
  switch ((disputeType ?? '').toLowerCase()) {
    case 'energy':
      return 'the Energy Ombudsman';
    case 'broadband':
    case 'comms':
    case 'telecoms':
      return 'the Communications Ombudsman';
    case 'finance':
    case 'banking':
    case 'insurance':
      return 'the Financial Ombudsman Service (FOS)';
    case 'rail':
      return 'the Rail Ombudsman';
    case 'property':
      return 'the Property Ombudsman';
    default:
      return 'the relevant ombudsman';
  }
}

/**
 * Decide the next action for a single dispute. Pure function — caller
 * persists the result and may run side effects (push notification,
 * letter draft).
 */
export async function decideNextAction(
  dispute: DisputeRow,
  recentCorrespondence: CorrespondenceRow[],
  intelligenceStats: ScopeStats[],
  merchantLegalRefStats?: MerchantLegalRefStat[],
): Promise<AgentDecision> {
  const state: AgentState = dispute.agent_state ?? inferInitialState(dispute);
  const historical = pickHistoricalSignal(
    dispute.merchant_normalised,
    intelligenceStats,
    merchantLegalRefStats,
  );
  const dataGrounded = !!historical;
  const merchantLabel =
    dispute.provider_name || dispute.merchant_normalised || 'this merchant';

  // Rule 4 — FCA 8-week clock has hit. Highest priority across all states
  // except already-resolved ones (handled by the cron filter).
  if (
    dispute.fca_8_week_deadline &&
    Date.parse(dispute.fca_8_week_deadline) <= Date.now() &&
    state !== 'escalated' &&
    state !== 'resolved_won' &&
    state !== 'resolved_partial' &&
    state !== 'resolved_lost'
  ) {
    return {
      to_state: 'escalation_due',
      action: 'escalate_ombudsman',
      rationale:
        `FCA 8-week deadline reached on ${new Date(dispute.fca_8_week_deadline).toDateString()}. ` +
        `${merchantLabel} has had its statutory window — you can now escalate to ${ombudsmanForType(dispute.dispute_type)}.` +
        (historical
          ? ` Historical signal: ${(historical.merchant_win_rate * 100).toFixed(0)}% of similar disputes vs ${merchantLabel} won at this stage (${historical.sample_size} cases).`
          : ''),
      next_check_at: plus(POST_DECISION_RECHECK_DAYS),
      surface_to_user: true,
      data_grounded: dataGrounded,
      historical_signal: historical,
    };
  }

  // Rule 6 — escalated for >90 days with no result. Needs human chase.
  if (state === 'escalated') {
    const stateAge = daysAgo(dispute.agent_state_set_at) ?? 0;
    if (stateAge > ESCALATION_STALL_DAYS) {
      return {
        to_state: 'awaiting_user_input',
        action: 'manual_review',
        rationale:
          `Dispute has been at the ombudsman for ${Math.round(stateAge)} days with no recorded result. ` +
          `These cases need a manual chase — review and confirm the current status.`,
        next_check_at: plus(POST_DECISION_RECHECK_DAYS),
        surface_to_user: true,
        data_grounded: false,
      };
    }
    return {
      to_state: 'escalated',
      action: 'wait',
      rationale: `Awaiting ${ombudsmanForType(dispute.dispute_type)} decision. We'll check again in a week.`,
      next_check_at: plus(POST_DECISION_RECHECK_DAYS),
      surface_to_user: false,
      data_grounded: false,
    };
  }

  // Rule 1 — draft + recently created. Surface "review and send".
  if (state === 'draft') {
    const ageDays = daysAgo(dispute.created_at) ?? 0;
    return {
      to_state: 'draft',
      action: 'send_initial_letter',
      rationale:
        ageDays < 1
          ? 'Your letter is drafted — review and send when ready.'
          : `Letter has been drafted for ${Math.round(ageDays)} day${ageDays >= 2 ? 's' : ''} but not sent yet. Review and send to start the clock.`,
      next_check_at: plus(POST_DECISION_RECHECK_DAYS),
      surface_to_user: true,
      data_grounded: dataGrounded,
      historical_signal: historical,
    };
  }

  // Rule 3 — responded. Use AI extraction to classify the latest inbound.
  const inbound = latestInbound(recentCorrespondence);
  if (state === 'responded' || inbound) {
    if (inbound) {
      const inboundText = `${inbound.subject ?? ''}\n\n${inbound.summary ?? ''}`;
      const inferred = await inferOutcomeFromCorrespondence(
        dispute.id,
        inboundText,
        dispute.outcome,
      );
      if (inferred) {
        if (inferred.suggested_outcome === 'won' && inferred.confidence === 'high') {
          return {
            to_state: 'resolved_won',
            action: 'mark_won',
            rationale: `${merchantLabel} appears to have agreed: "${inferred.evidence_excerpt}". Confirm to log the win.`,
            next_check_at: plus(POST_DECISION_RECHECK_DAYS),
            surface_to_user: true,
            data_grounded: dataGrounded,
            historical_signal: historical,
          };
        }
        if (inferred.suggested_outcome === 'partial') {
          return {
            to_state: 'awaiting_user_input',
            action: 'accept_partial',
            rationale:
              `${merchantLabel} offered a partial resolution: "${inferred.evidence_excerpt}". ` +
              `Accept the offer or escalate for the full amount` +
              (historical
                ? ` (escalation has worked in ${(historical.merchant_win_rate * 100).toFixed(0)}% of similar cases, ${historical.sample_size} on file)`
                : '') +
              '.',
            next_check_at: plus(POST_DECISION_RECHECK_DAYS),
            surface_to_user: true,
            data_grounded: dataGrounded,
            historical_signal: historical,
          };
        }
        if (inferred.suggested_outcome === 'lost') {
          // Escalate if FCA clock close, otherwise stronger followup.
          const closeToFca =
            !!dispute.fca_8_week_deadline &&
            Date.parse(dispute.fca_8_week_deadline) - Date.now() < FCA_8_WEEK_GRACE_DAYS * DAY_MS;
          if (closeToFca || dataGrounded) {
            return {
              to_state: 'escalation_due',
              action: 'escalate_ombudsman',
              rationale:
                `${merchantLabel} refused: "${inferred.evidence_excerpt}". ` +
                `Escalate to ${ombudsmanForType(dispute.dispute_type)}` +
                (historical
                  ? ` — ${(historical.merchant_win_rate * 100).toFixed(0)}% of escalated disputes against ${merchantLabel} have been won (${historical.sample_size} cases).`
                  : '.'),
              next_check_at: plus(POST_DECISION_RECHECK_DAYS),
              surface_to_user: true,
              data_grounded: dataGrounded,
              historical_signal: historical,
            };
          }
          return {
            to_state: 'awaiting_user_input',
            action: 'send_followup',
            rationale:
              `${merchantLabel} refused. Push back with a stronger letter citing the same statute and request final response.`,
            next_check_at: plus(POST_DECISION_RECHECK_DAYS),
            surface_to_user: true,
            data_grounded: dataGrounded,
            historical_signal: historical,
          };
        }
        // still_open
        return {
          to_state: 'responded',
          action: 'wait',
          rationale: `${merchantLabel} has acknowledged but not decided. We'll check again in a week.`,
          next_check_at: plus(POST_DECISION_RECHECK_DAYS),
          surface_to_user: false,
          data_grounded: false,
        };
      }
    }
  }

  // Rule 2 — sent + no reply in 14 days. Send followup.
  if (state === 'sent' || state === 'still_open') {
    const sinceSent =
      daysAgo(dispute.first_letter_sent_at) ??
      daysAgo(dispute.last_letter_sent_at) ??
      daysAgo(dispute.sent_at) ??
      daysAgo(dispute.agent_state_set_at) ??
      daysAgo(dispute.created_at) ??
      0;
    const sinceReply = daysAgo(dispute.last_reply_received_at);
    const noResponseFor = sinceReply ?? sinceSent;
    if (noResponseFor >= FOLLOWUP_NO_REPLY_DAYS) {
      // Rule 5 — multiple followups + sector-specific escalation.
      const followups = dispute.reminder_count ?? 0;
      const sector = (dispute.dispute_type ?? '').toLowerCase();
      const escalatableSector =
        sector === 'energy' ||
        sector === 'broadband' ||
        sector === 'finance' ||
        sector === 'banking' ||
        sector === 'insurance';
      if (followups >= 2 && escalatableSector) {
        return {
          to_state: 'escalation_due',
          action: 'escalate_ombudsman',
          rationale:
            `${followups} followups sent with no resolution. Escalate to ${ombudsmanForType(dispute.dispute_type)}` +
            (historical
              ? ` — ${(historical.merchant_win_rate * 100).toFixed(0)}% win rate at this stage on file (${historical.sample_size} cases).`
              : '.'),
          next_check_at: plus(POST_DECISION_RECHECK_DAYS),
          surface_to_user: true,
          data_grounded: dataGrounded,
          historical_signal: historical,
        };
      }
      return {
        to_state: 'awaiting_user_input',
        action: 'send_followup',
        rationale:
          `No response from ${merchantLabel} in ${Math.round(noResponseFor)} days. Send a followup and reset the clock.`,
        next_check_at: plus(POST_DECISION_RECHECK_DAYS),
        surface_to_user: true,
        data_grounded: dataGrounded,
        historical_signal: historical,
      };
    }
    // Still inside the 14-day window — wait.
    return {
      to_state: state,
      action: 'wait',
      rationale: `Sent ${Math.round(sinceSent)} day${sinceSent >= 2 ? 's' : ''} ago. We'll nudge after 14 days with no reply.`,
      next_check_at: plus(Math.max(1, FOLLOWUP_NO_REPLY_DAYS - Math.round(sinceSent))),
      surface_to_user: false,
      data_grounded: false,
    };
  }

  // Default — wait and recheck.
  return {
    to_state: state,
    action: 'wait',
    rationale: 'No action required — checking again in a week.',
    next_check_at: plus(POST_DECISION_RECHECK_DAYS),
    surface_to_user: false,
    data_grounded: false,
  };
}

/** Best-effort initial state for a row that has never been classified by the agent. */
function inferInitialState(dispute: DisputeRow): AgentState {
  if (dispute.outcome === 'won') return 'resolved_won';
  if (dispute.outcome === 'partial') return 'resolved_partial';
  if (dispute.outcome === 'lost') return 'resolved_lost';
  if (dispute.outcome === 'withdrawn') return 'withdrawn';
  if (dispute.outcome === 'timeout') return 'timeout';
  if (dispute.last_reply_received_at) return 'responded';
  if (dispute.first_letter_sent_at || dispute.last_letter_sent_at || dispute.sent_at) return 'sent';
  return 'draft';
}

/** Public helper for the cron initialiser. */
export function inferStateFromRow(dispute: DisputeRow): AgentState {
  return dispute.agent_state ?? inferInitialState(dispute);
}
