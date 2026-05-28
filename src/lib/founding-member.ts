/**
 * Shared founding-member protection helper.
 *
 * A founding member is "protected" — i.e. must never be silently
 * downgraded by Stripe sync, webhook, or trial-expiry — when:
 *
 *   1. `founding_member = true`, AND
 *   2. EITHER `founding_member_expires` is NULL (lifetime grant)
 *      OR `founding_member_expires > NOW()` (date-gated, still active).
 *
 * Once `founding_member_expires` is in the past the cohort is no longer
 * protected — at that point `/api/cron/founding-member-expiry` is the
 * single source of truth for cleaning up state.
 *
 * Background: 2026-05-28 audit found 4 users with `founding_member=true`
 * silently reverted to `subscription_tier='free'` with no downgrade
 * event. Their `founding_member_expires` had legitimately lapsed but
 * `founding-member-expiry` had never finished cleaning them up
 * (`founding_member` was still true, `trial_expired_at` was still null).
 * Centralising the check here so every downgrade path applies the same
 * rule.
 */

export interface FoundingMemberFields {
  founding_member?: boolean | null;
  founding_member_expires?: string | null;
}

/** True when the user is a founding member whose grant has not lapsed. */
export function isProtectedFoundingMember(profile: FoundingMemberFields | null | undefined): boolean {
  if (!profile?.founding_member) return false;
  if (!profile.founding_member_expires) return true;
  return new Date(profile.founding_member_expires).getTime() > Date.now();
}
