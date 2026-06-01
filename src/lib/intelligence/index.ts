/**
 * Intelligence layer SDK — Phase 0.
 *
 * Three primitives every consequential action calls:
 *
 *   recordAction(ctx)        — fired BEFORE the action runs. Returns the
 *                              event id so the caller can later attach
 *                              outcomes.
 *
 *   recordOutcome(args)      — fired when an outcome is observed (user
 *                              reply, dispute resolved, churn webhook,
 *                              etc.). Matches against eventId OR the
 *                              most recent matching (subject_kind,
 *                              subject_id) row.
 *
 *   consultLedger(ctx)       — fired BEFORE the action runs. Returns
 *                              { emit, reason, sample, precision_pct }.
 *                              Caller suppresses the action when emit=false.
 *                              Phase 0 is deterministic only — no AI in
 *                              the loop. AI is introduced in Phase 2.
 *
 * Architecture: docs/CLOSED_LOOP_ARCHITECTURE.md
 *
 * Suppression policy (Phase 0):
 *   - Below SAMPLE_FLOOR (30 emits) → never suppress (cold start).
 *   - Critical alert types (see CRITICAL_BYPASS) → never suppress.
 *   - emitted ≥ SAMPLE_FLOOR AND precision ≤ SUPPRESSION_FLOOR_PCT (15%)
 *     → suppress with reason='low_precision'.
 *
 * Every helper is fire-and-forget on the write path — failures log a
 * warning and never break the caller. The intelligence layer is observably
 * additive, never a hard dependency.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

/** Below this many emits, we trust nothing and never auto-suppress. */
export const SAMPLE_FLOOR = 30;
/** At or below this precision, we suppress (once SAMPLE_FLOOR is met). */
export const SUPPRESSION_FLOOR_PCT = 15;

/**
 * Alert subject_ids that are NEVER auto-suppressed. Mirrors the
 * `critical: true` flag in src/lib/notifications/events.ts so the two
 * sources of truth stay in sync — if you add a critical event there,
 * add it here too.
 */
export const CRITICAL_BYPASS = new Set<string>([
  // EVENT_CATALOG event names
  'price_increase',
  'dispute_reply',
  'money_recovered',
  'overcharge_detected',
  'savings_milestone',
  // Their underlying WhatsApp template names (so the alert dispatcher
  // can look up by templateName when it doesn't carry the event name).
  'paybacker_alert_price_increase',
  'paybacker_dispute_reply',
  'paybacker_money_recovered',
  'paybacker_savings_goal_milestone',
]);

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type Actor = 'system' | 'user' | 'ai';

export type OutcomeKind =
  | 'action_taken'
  | 'dismissed'
  | 'ignored'
  | 'won'
  | 'lost'
  | 'no_response'
  | 'churned'
  | 'switched'
  | 'cancelled'
  | 'auto_suppressed'
  | 'escalated';

export interface IntelligenceContext {
  /** Affected user, when known. NULL for system-wide events. */
  userId?: string | null;
  /** Who fired the action. 'system' when emitted by a cron, 'user' when
   *  triggered by an in-product UI action, 'ai' when the agent decided. */
  actor?: Actor;
  /** Stable kind label — read by aggregators, must be lowercase_snake.
   *  Examples: 'alert_sent', 'letter_drafted', 'cancellation_drafted'. */
  actionKind: string;
  /** The thing being acted on — e.g. 'alert_template', 'dispute',
   *  'subscription'. Optional but strongly recommended so outcomes can
   *  match back to the action. */
  subjectKind?: string;
  /** The thing's id / name. For 'alert_template' use the template name
   *  ('paybacker_alert_price_increase'). For 'dispute' use the dispute
   *  uuid. */
  subjectId?: string;
  /** Free-form prediction at emit time (what model expected). */
  predicted?: Record<string, unknown>;
  /** Free-form context. */
  metadata?: Record<string, unknown>;
}

export interface ConsultDecision {
  /** true = caller should fire the action. */
  emit: boolean;
  /** Why we decided this way. Surfaced in the admin dashboard. */
  reason:
    | 'cold_start'
    | 'critical_bypass'
    | 'above_floor'
    | 'low_precision_suppressed'
    | 'lookup_failed'
    | 'no_subject';
  /** How many comparable events we used to decide. */
  sample: number;
  /** Observed precision over the lookback window (NULL when sample = 0). */
  precision_pct: number | null;
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Write an emit-side intelligence_events row. Returns the row id so the
 * caller can attach an outcome later. Never throws — failures log + return
 * null.
 */
export async function recordAction(
  ctx: IntelligenceContext,
): Promise<string | null> {
  const sb = getAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('intelligence_events')
      .insert({
        user_id: ctx.userId ?? null,
        actor: ctx.actor ?? 'system',
        action_kind: ctx.actionKind,
        subject_kind: ctx.subjectKind ?? null,
        subject_id: ctx.subjectId ?? null,
        predicted: ctx.predicted ?? null,
        metadata: ctx.metadata ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[intelligence] recordAction failed:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn('[intelligence] recordAction threw:', e);
    return null;
  }
}

/**
 * Record an observed outcome. Either supply the event id directly (when
 * the caller knows it) OR a (subject_kind, subject_id) tuple — we match
 * to the most recent unmeasured event for that subject.
 *
 * No-op when matching fails — never throws.
 */
export async function recordOutcome(args: {
  eventId?: string | null;
  userId?: string | null;
  subjectKind?: string;
  subjectId?: string;
  outcomeKind: OutcomeKind;
  outcome?: Record<string, unknown>;
}): Promise<void> {
  const sb = getAdmin();
  if (!sb) return;
  try {
    const now = new Date().toISOString();
    if (args.eventId) {
      await sb
        .from('intelligence_events')
        .update({
          outcome_kind: args.outcomeKind,
          outcome: args.outcome ?? null,
          measured_at: now,
        })
        .eq('id', args.eventId)
        .is('outcome_kind', null); // never overwrite a measured row
      return;
    }
    // Match by subject. Prefer the most-recent unmeasured row.
    if (!args.subjectKind || !args.subjectId) {
      console.warn(
        '[intelligence] recordOutcome called without eventId or (subjectKind, subjectId) — no-op',
      );
      return;
    }
    let q = sb
      .from('intelligence_events')
      .select('id, user_id')
      .eq('subject_kind', args.subjectKind)
      .eq('subject_id', args.subjectId)
      .is('outcome_kind', null)
      .order('emitted_at', { ascending: false })
      .limit(1);
    if (args.userId) q = q.eq('user_id', args.userId);
    const { data } = await q;
    const row = data?.[0];
    if (!row) {
      console.warn(
        `[intelligence] recordOutcome: no unmeasured event for (${args.subjectKind}, ${args.subjectId})`,
      );
      return;
    }
    await sb
      .from('intelligence_events')
      .update({
        outcome_kind: args.outcomeKind,
        outcome: args.outcome ?? null,
        measured_at: now,
      })
      .eq('id', row.id);
  } catch (e) {
    console.warn('[intelligence] recordOutcome threw:', e);
  }
}

/**
 * Decide whether the caller should fire the action. Reads
 * intelligence_stats for the matching scope and applies the Phase 0
 * suppression policy. Phase 2 will add an AI assist when the signal is
 * ambiguous; Phase 0 is purely deterministic.
 */
export async function consultLedger(
  ctx: IntelligenceContext,
): Promise<ConsultDecision> {
  // Critical-event bypass — never suppress these.
  if (ctx.subjectId && CRITICAL_BYPASS.has(ctx.subjectId)) {
    return {
      emit: true,
      reason: 'critical_bypass',
      sample: 0,
      precision_pct: null,
    };
  }
  if (!ctx.subjectKind || !ctx.subjectId) {
    return {
      emit: true,
      reason: 'no_subject',
      sample: 0,
      precision_pct: null,
    };
  }
  const sb = getAdmin();
  if (!sb) {
    return {
      emit: true,
      reason: 'lookup_failed',
      sample: 0,
      precision_pct: null,
    };
  }
  try {
    const { data } = await sb
      .from('intelligence_stats')
      .select('emitted, acted_on, dismissed, precision_pct')
      .eq('scope_kind', ctx.subjectKind)
      .eq('scope_value', ctx.subjectId)
      .eq('window_kind', 'all_time')
      .maybeSingle();
    if (!data) {
      return {
        emit: true,
        reason: 'cold_start',
        sample: 0,
        precision_pct: null,
      };
    }
    const sample = data.emitted ?? 0;
    const precision = data.precision_pct == null ? null : Number(data.precision_pct);
    if (sample < SAMPLE_FLOOR) {
      return {
        emit: true,
        reason: 'cold_start',
        sample,
        precision_pct: precision,
      };
    }
    if (precision != null && precision <= SUPPRESSION_FLOOR_PCT) {
      return {
        emit: false,
        reason: 'low_precision_suppressed',
        sample,
        precision_pct: precision,
      };
    }
    return {
      emit: true,
      reason: 'above_floor',
      sample,
      precision_pct: precision,
    };
  } catch (e) {
    console.warn('[intelligence] consultLedger threw:', e);
    return {
      emit: true,
      reason: 'lookup_failed',
      sample: 0,
      precision_pct: null,
    };
  }
}

/**
 * Convenience helper for auto-suppression logging. Caller invokes this
 * when consultLedger returns emit=false so the suppression itself is a
 * measurable event in the ledger.
 */
export async function logAutoSuppression(
  ctx: IntelligenceContext,
  decision: ConsultDecision,
): Promise<void> {
  await recordAction({
    ...ctx,
    actor: 'system',
    actionKind: `${ctx.actionKind}_suppressed`,
    metadata: {
      ...(ctx.metadata ?? {}),
      decision_reason: decision.reason,
      sample: decision.sample,
      precision_pct: decision.precision_pct,
    },
  });
}
