-- Founding member tier-regression remediation (2026-05-28 audit)
--
-- Audit flagged 4 users with `founding_member=true` silently reverted to
-- `subscription_tier='free'` with no downgrade event logged. Investigation
-- showed all 4 had legitimately past-expiry founding memberships, but
-- `/api/cron/founding-member-expiry` had never finished cleaning up state:
-- `founding_member` was still true and `trial_expired_at` was still null,
-- so the cron kept treating them as "needs processing" on every run while
-- some other path had already wiped the tier.
--
-- Two cohorts to address:
--   (A) Active founding members (founding_member_expires IS NULL OR > NOW)
--       wrongly stuck on tier='free'. Restore to 'pro' (the canonical
--       founding-member tier — see src/app/api/founding-member/route.ts
--       FREE_TRIAL_TIER).
--   (B) Past-expiry founding members with tier='free' but founding_member
--       still true and trial_expired_at null. Their tier is correct, but
--       finish the state cleanup so the cron stops re-processing them and
--       the rest of the app sees a coherent post-expiry state.
--
-- Both blocks are idempotent. NO rows are touched outside the conditions
-- below — Stripe-paying founding members and the lifetime
-- aireypaul@googlemail.com founder grant are explicitly excluded.

BEGIN;

-- (A) Active founding members wrongly at tier='free' — restore to pro.
UPDATE profiles
SET
  subscription_tier = 'pro',
  updated_at = NOW()
WHERE founding_member = true
  AND subscription_tier = 'free'
  AND (founding_member_expires IS NULL OR founding_member_expires > NOW());

-- (B) Past-expiry founding members — finish cleanup so state is coherent.
-- Mirrors the writes the `founding-member-expiry` cron would have made.
--
-- ROOT CAUSE: the cron was writing `subscription_status='expired'` which
-- violates the CHECK constraint
-- (subscription_status IN ('trialing','active','canceled','past_due','paused'))
-- introduced in 20260101000000_initial_schema.sql. The whole UPDATE
-- silently failed, leaving founding_member=true + trial_expired_at=NULL.
-- Use 'canceled' (the closest semantic match in the allowed set).
UPDATE profiles
SET
  founding_member = false,
  subscription_status = COALESCE(subscription_status, 'canceled'),
  trial_expired_at = NOW(),
  updated_at = NOW()
WHERE founding_member = true
  AND founding_member_expires IS NOT NULL
  AND founding_member_expires <= NOW()
  AND subscription_tier = 'free'
  AND trial_expired_at IS NULL
  AND stripe_subscription_id IS NULL;

COMMIT;
