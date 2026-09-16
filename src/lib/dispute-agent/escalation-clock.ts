/**
 * The eight-week escalation clock.
 *
 * Under FCA DISP 1.6 / Ofgem's complaint-handling standards, a consumer
 * may refer a complaint to the ombudsman once the firm has had eight
 * weeks from FIRST CONTACT without resolving it. That deadline is the
 * single most valuable thing the Dispute Agent can tell a user, and it
 * drives Rule 4 of `decideNextAction` — the highest-priority rule in the
 * engine.
 *
 * It was anchored entirely on `disputes.fca_8_week_deadline`, a column
 * that migration 20260501100000 backfilled once and that NO code path has
 * ever written since. Every dispute created after that backfill therefore
 * carries a NULL deadline, and Rule 4 — plus the grace-window branch that
 * escalates a refusal near the deadline — is unreachable for it. The only
 * writer in the codebase is the £14.99 escalation-pack route, which
 * backfills the column *after* purchase. That is exactly backwards: the
 * agent should be telling the user the clock has run out, which is the
 * moment the pack becomes worth buying.
 *
 * `first_letter_sent_at` is no better — it is read in five places and
 * written in none, for the same reason.
 *
 * Two halves to the repair, and this module is the shared half:
 *   1. `/api/disputes/[id]/letter-sent` now stamps both columns on the
 *      first send, so the data is correct going forward.
 *   2. `resolveEightWeekDeadline` derives the deadline on read for rows
 *      that were sent before (1) existed, so the disputes already in
 *      flight are not stranded waiting on a backfill migration.
 *
 * Deliberately NOT falling back to `created_at`. `src/lib/escalation-pack/
 * build.ts` does, and that is right for what it does — it describes a
 * deadline inside a pack the user has already bought, where being early
 * is generous. Here the output is a recommendation to REFER TO THE
 * OMBUDSMAN. A referral filed before the statutory window closes is
 * rejected as premature, so an anchor must mean "we have evidence the
 * provider was actually contacted". A drafted-but-never-sent dispute has
 * not started the clock, and gets no deadline.
 */

export const EIGHT_WEEKS_MS = 56 * 24 * 60 * 60 * 1000;

/** The row shape this module needs. A loose structural type so both the
 *  agent's `DisputeRow` and the follow-up cron's narrower row satisfy it. */
export interface EscalationClockFields {
  fca_8_week_deadline?: string | null;
  first_letter_sent_at?: string | null;
  sent_at?: string | null;
}

/**
 * Earliest point at which we have evidence the provider was contacted.
 *
 * `first_letter_sent_at` is the correct anchor and is preferred.
 * `sent_at` is the fallback: `/api/disputes/[id]/letter-sent` restamps it
 * on every "mark as sent", so on a chased dispute it can be LATER than
 * first contact. That errs towards a later deadline, which is the safe
 * direction — it delays a recommendation rather than producing a
 * premature referral.
 */
export function resolveContactAnchor(d: EscalationClockFields): string | null {
  return d.first_letter_sent_at ?? d.sent_at ?? null;
}

/**
 * The eight-week deadline as an ISO string, or null when the clock has
 * not started. Prefers the stored column so a value written at send time
 * (or by the escalation pack) always wins over a derived one.
 */
export function resolveEightWeekDeadline(d: EscalationClockFields): string | null {
  if (d.fca_8_week_deadline) return d.fca_8_week_deadline;

  const anchor = resolveContactAnchor(d);
  if (!anchor) return null;

  const t = Date.parse(anchor);
  if (Number.isNaN(t)) return null;

  return new Date(t + EIGHT_WEEKS_MS).toISOString();
}

/** Deadline as epoch ms, or null. Convenience for the comparison sites. */
export function eightWeekDeadlineMs(d: EscalationClockFields): number | null {
  const iso = resolveEightWeekDeadline(d);
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}
