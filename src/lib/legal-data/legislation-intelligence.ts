/**
 * src/lib/legal-data/legislation-intelligence.ts
 *
 * Decision core for the weekly legislation self-learning loop
 * (`/api/cron/legislation-reverify`).
 *
 * The cron does the IO (fetch legislation.gov.uk XML, hash it, read/write
 * Supabase, send Telegram). This module holds the PURE decision logic so it
 * can be unit-tested without a network or a database:
 *
 *   decideLegislationStatus(...) -> { status, changeType, material, ... }
 *
 * Lifecycle a legislation_items row moves through:
 *
 *   pending ──first verify──► confirmed         (baseline captured / unchanged)
 *           ──hash drift───►  amended           (text changed — founder review)
 *           ──repeal seen──►  needs_review       (stop trusting until reviewed)
 *           ──fetch fail───►  failed             (transient — retried next run)
 *           ──3x fail──────►  needs_review       (self-heal escalation)
 *
 * Compliance principle: this loop NEVER promotes a citation to a trusted
 * status by itself and never overwrites a citation's protected canonical
 * fields. A detected change demotes/flags and escalates to the founder.
 */

import type { LegislationDoc } from './legislation-gov-uk.ts';

export type LegislationStatus =
  | 'pending'
  | 'confirmed'
  | 'amended'
  | 'needs_review'
  | 'failed';

export type LegislationChangeType =
  | 'confirmed_baseline'
  | 'content_drift'
  | 'unapplied_effects'
  | 'repealed'
  | 'url_dead';

export interface LegislationDecision {
  /** New status for the legislation_items row. */
  status: LegislationStatus;
  /** When set, the cron writes a legislation_change_log row of this type. */
  changeType: LegislationChangeType | null;
  /** Material changes warrant an immediate founder Telegram alert. */
  material: boolean;
  /** Whether this verification represents a state-changing event worth logging. */
  isChange: boolean;
  /** Whether the self-heal escalation threshold was crossed on this attempt. */
  escalate: boolean;
  /** Human-readable reason, stored on the item + change row for the audit trail. */
  reason: string;
}

/** Number of consecutive fetch failures before we escalate to the founder. */
export const FAILURE_ESCALATION_THRESHOLD = 3;

/**
 * Conservative repeal heuristic over the canonical XML. legislation.gov.uk
 * marks repealed/revoked provisions in the body and in `<ukm:UnappliedEffects>`
 * with type="repeal". We only flag when a repeal marker co-occurs with the
 * tracked section number (or, for whole-Act items, anywhere in the body) to
 * avoid false positives from cross-references to other repealed Acts.
 */
export function detectRepeal(doc: LegislationDoc): boolean {
  const raw = doc.raw || '';
  if (!/\b(repeal|revoke|revoc)/i.test(raw)) return false;

  // Pending repeal declared in the effects envelope is the strongest signal.
  if (/<ukm:Effect\b[^>]*\btype=("|')[^"']*(repeal|revoke)/i.test(raw)) return true;

  // Whole-Act item: a repeal marker in the prelims/title block is enough.
  if (!doc.sectionNumber) {
    return /\b(is|are|hereby)\s+repealed\b/i.test(raw) || /\bAct\s+repealed\b/i.test(raw);
  }

  // Section item: only flag when the section text itself reads as repealed.
  const sect = doc.sectionText || '';
  return /\b(repealed|revoked|omitted)\b/i.test(sect);
}

/**
 * Pure decision function. The cron precomputes `newHash` (null === the fetch
 * failed / page unavailable) and the boolean signals, then asks us what to do.
 */
export function decideLegislationStatus(args: {
  /** content_hash currently stored on the item (null on first-ever verify). */
  priorHash: string | null;
  /** sha256 of the freshly-fetched canonical body, or null if fetch failed. */
  newHash: string | null;
  hasUnappliedEffects: boolean;
  repealDetected: boolean;
  /** consecutive_failures AFTER incrementing for this attempt (only when fetch failed). */
  consecutiveFailures: number;
}): LegislationDecision {
  const { priorHash, newHash, hasUnappliedEffects, repealDetected, consecutiveFailures } = args;

  // --- Fetch failure path -------------------------------------------------
  if (newHash === null) {
    if (consecutiveFailures >= FAILURE_ESCALATION_THRESHOLD) {
      return {
        status: 'needs_review',
        changeType: 'url_dead',
        material: true,
        isChange: true,
        escalate: true,
        reason: `Source unreachable ${consecutiveFailures}x in a row — escalated for manual review`,
      };
    }
    return {
      status: 'failed',
      changeType: null,
      material: false,
      isChange: false,
      escalate: false,
      reason: `Source fetch failed (${consecutiveFailures}/${FAILURE_ESCALATION_THRESHOLD}) — will retry next run`,
    };
  }

  // --- First-ever verification: capture the baseline ----------------------
  if (!priorHash) {
    return {
      status: 'confirmed',
      changeType: 'confirmed_baseline',
      material: false,
      isChange: true,
      escalate: false,
      reason: 'Baseline captured from legislation.gov.uk',
    };
  }

  // --- Unchanged ----------------------------------------------------------
  if (newHash === priorHash) {
    return {
      status: 'confirmed',
      changeType: null,
      material: false,
      isChange: false,
      escalate: false,
      reason: 'Canonical text unchanged since last verification',
    };
  }

  // --- Changed: classify --------------------------------------------------
  if (repealDetected) {
    return {
      status: 'needs_review',
      changeType: 'repealed',
      material: true,
      isChange: true,
      escalate: false,
      reason: 'Possible repeal/revocation detected — citation demoted pending founder review',
    };
  }

  if (hasUnappliedEffects) {
    return {
      status: 'amended',
      changeType: 'unapplied_effects',
      material: true,
      isChange: true,
      escalate: false,
      reason: 'Pending (unapplied) amendments flagged on legislation.gov.uk',
    };
  }

  return {
    status: 'amended',
    changeType: 'content_drift',
    material: true,
    isChange: true,
    escalate: false,
    reason: 'Canonical text changed since last verification',
  };
}

/** Short label for an item, used in Telegram + log lines. */
export function itemLabel(item: { act_name: string; section?: string | null }): string {
  return item.section ? `${item.act_name} (${item.section})` : item.act_name;
}
