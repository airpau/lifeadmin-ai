-- ============================================================
-- Subscription tier constraint + plus → essential migration (2026-04-27)
--
-- Production-blocking bug: profiles.subscription_tier had a CHECK
-- constraint allowing only ('free', 'plus', 'pro'). The tier was
-- renamed 'plus' → 'essential' months ago (see CLAUDE.md TIER MATRIX
-- and src/lib/plan-limits.ts) but this constraint was never updated.
--
-- Symptom: every Stripe checkout for the Essential price hit the
-- webhook handler at /api/webhooks/stripe, the handler tried
-- UPDATE profiles SET subscription_tier='essential', and Postgres
-- rejected the row with:
--   ERROR 23514 violates check constraint profiles_subscription_tier_check
-- The webhook returned 200 to Stripe (the error was logged but not
-- propagated), so Stripe stopped retrying. Net result:
--   - Customer charged
--   - Stripe subscription created
--   - profiles.subscription_tier stays 'free'
--   - Sidebar may show "ESSENTIAL PLAN" optimistically (from ?success=true)
--     but PlanLimitsBanner correctly reads ground truth and shows
--     "free tier allows N" — confusing the user.
--
-- Two fixes in this migration:
--
-- 1. Replace the CHECK constraint with the canonical tier values plus
--    'plus' for backwards-compat with any rows the old constraint left
--    behind. Runtime code only knows about 'free' | 'essential' | 'pro'.
--
-- 2. Migrate the 6 users who got stuck on 'plus' before this fix to
--    'essential'. Their stripe_subscription_id is set, they're paying;
--    the codebase just doesn't recognise their tier. PLAN_LIMITS['plus']
--    is undefined so they were silently being treated as free.
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier = ANY (ARRAY['free'::text, 'essential'::text, 'pro'::text, 'plus'::text]));

-- Rename legacy 'plus' rows. updated_at bumped so the Stripe webhook's
-- "if I see an older row, refresh from Stripe" logic re-classifies them.
UPDATE profiles
SET subscription_tier = 'essential',
    updated_at = NOW()
WHERE subscription_tier = 'plus';

-- Note: the constraint still allows 'plus' so any row the migration
-- missed (e.g. inserted concurrently) won't fail validation. A future
-- migration can drop 'plus' once we're confident no rows reference it.
