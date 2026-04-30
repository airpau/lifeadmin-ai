/**
 * Canonical sets of `legal_references.verification_status` values.
 *
 * Single source of truth so that adding a new status (e.g. when a future
 * verifier introduces something like 'auto_verified') doesn't silently
 * exclude refs from product behaviour. PR #373/#375 introduced 'verified',
 * 'superseded', and 'broken' — readers that filtered to ['current','updated']
 * suddenly stopped seeing successfully-verified refs until this constant
 * was wired everywhere.
 *
 * Rule of thumb when adding a status:
 *   - Should the engine cite this ref? → put it in ACTIVE_REF_STATUSES.
 *   - Should the founder review this ref? → put it in REVIEW_REF_STATUSES.
 *   - Should we never cite or surface this ref? → put it nowhere. The
 *     readers below will exclude it by omission.
 */

export const ACTIVE_REF_STATUSES = ['current', 'updated', 'verified'] as const;

export const REVIEW_REF_STATUSES = [
  'needs_review',
  'broken',
  'stale',
  'error',
  'outdated',
  'url_dead',
] as const;

// Engines that ground complaints/disputes only — be strict.
export const CITATION_ELIGIBLE_STATUSES = ACTIVE_REF_STATUSES;

// Citation-canary + complaints generation are permissive: they include
// needs_review so refs awaiting verification still surface (with a flag).
export const CITATION_PERMISSIVE_STATUSES = [
  ...ACTIVE_REF_STATUSES,
  'needs_review',
] as const;
