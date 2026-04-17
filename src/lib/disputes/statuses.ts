/**
 * Single source of truth for dispute status groupings.
 *
 * These must stay in sync with:
 *  - disputes table CHECK constraint (supabase/migrations)
 *  - get_dispute_summary() RPC
 *  - complaints/page.tsx (isResolved / ACTIVE_STATUSES)
 *  - profile/page.tsx (ProfileStatsSection)
 *
 * Adding a new status? Update all four places.
 */

/** Statuses that represent a dispute still in flight */
export const OPEN_STATUSES = [
  'open',
  'in_progress',
  'awaiting_response',
  'escalated',
  'ombudsman',
  'pending_response',
] as const;

/**
 * Statuses that represent a dispute that has reached a terminal outcome.
 * Both long-form ('resolved_won') and short-form ('won') aliases are included
 * because the resolution modal writes the short form.
 */
export const RESOLVED_STATUSES = [
  'resolved_won',
  'resolved_partial',
  'resolved_lost',
  'won',
  'partial',
  'lost',
  'closed',
  'withdrawn',
  'dismissed',
] as const;

export type OpenStatus = (typeof OPEN_STATUSES)[number];
export type ResolvedStatus = (typeof RESOLVED_STATUSES)[number];
export type DisputeStatus = OpenStatus | ResolvedStatus;

export function isResolved(status: string): boolean {
  return (RESOLVED_STATUSES as readonly string[]).includes(status);
}

export function isOpen(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}
