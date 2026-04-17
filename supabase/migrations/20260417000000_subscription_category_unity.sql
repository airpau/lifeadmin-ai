-- ============================================================
-- Subscription ↔ Money Hub Category Unity — 2026-04-17
--
-- Problem:
-- When a user edits a subscription's category (e.g. Test Valley Council →
-- "Council Tax") on the Subscriptions page, the Money Hub "spending by
-- category" view did NOT reflect the change: the matching bank_transactions
-- rows kept their old user_category, and money_hub_category_overrides
-- upserts silently failed (wrong column name + no matching unique constraint
-- for ON CONFLICT). The legacy PATCH handler in
-- src/app/api/subscriptions/[id]/route.ts also fired its update calls
-- without awaiting them, so on Vercel serverless they were frequently
-- killed before completion.
--
-- Fix (additive only — no drops, no destructive changes):
-- 1. Add a PARTIAL UNIQUE INDEX on money_hub_category_overrides so that
--    (user_id, merchant_pattern) is unique when transaction_id IS NULL.
--    This is what the API-level upsert needs in order to work.
-- 2. Introduce the RPC apply_subscription_category_correction, which is
--    the single authoritative entry-point for propagating a subscription
--    category correction across:
--        - subscriptions.category
--        - money_hub_category_overrides (merchant-pattern override)
--        - bank_transactions.user_category (retroactive recategorisation)
--    The RPC is idempotent, respects per-transaction overrides, and never
--    reclassifies rows that are already tagged 'transfers' (so we do not
--    accidentally pull an internal transfer into a spending category).
--
-- Safety:
--   * CREATE INDEX IF NOT EXISTS — additive.
--   * CREATE OR REPLACE FUNCTION — replaces only if signature matches.
--   * No ALTER TABLE DROP / no column removal.
--   * RLS policy on money_hub_category_overrides is untouched (SECURITY
--     DEFINER lets the RPC write on behalf of an authenticated user).
-- ============================================================


-- ─── 1. Partial unique index for ON CONFLICT upserts ────────────────────────
-- Allows both:
--   (a) a single merchant-wide override per user per pattern
--   (b) many transaction-specific overrides for the same pattern
-- by scoping uniqueness to transaction_id IS NULL rows only.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mhco_user_merchant_pattern_uniq
  ON money_hub_category_overrides (user_id, merchant_pattern)
  WHERE transaction_id IS NULL;


-- ─── 2. apply_subscription_category_correction RPC ──────────────────────────
-- Called by /api/subscriptions/[id] PATCH whenever a user changes a
-- subscription's category. All three write paths happen inside one
-- transaction so Money Hub and Subscriptions can never drift.
--
-- Parameters:
--   p_user_id             — the owning user
--   p_subscription_id     — the subscription being corrected
--   p_new_category        — the new category key (e.g. 'council_tax')
--   p_raw_name            — original raw bank description (for logging)
--   p_raw_name_normalised — JS-normalised substring pattern (lowercased,
--                           reference codes / dates / card numbers stripped)
--                           This is what gets stored as merchant_pattern
--                           and what future auto_categorise_transactions
--                           runs will LIKE-match against.
--   p_provider_name       — current subscription display name (used as a
--                           fallback match for manually-added subs whose
--                           bank_description may not exist)
--
-- Returns: jsonb with counts + echoed pattern/category.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_subscription_category_correction(
  p_user_id             uuid,
  p_subscription_id     uuid,
  p_new_category        text,
  p_raw_name            text,
  p_raw_name_normalised text,
  p_provider_name       text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pattern_lc   text    := LOWER(COALESCE(NULLIF(TRIM(p_raw_name_normalised), ''), ''));
  v_provider_lc  text    := LOWER(COALESCE(NULLIF(TRIM(p_provider_name), ''), ''));
  v_txn_updated  integer := 0;
  v_override_op  text    := 'skipped';
BEGIN
  IF p_user_id IS NULL OR p_subscription_id IS NULL OR p_new_category IS NULL THEN
    RAISE EXCEPTION 'apply_subscription_category_correction: user_id, subscription_id, new_category required';
  END IF;

  -- 2a. Keep subscriptions.category authoritative (idempotent; caller usually
  --     updated it already via the allow-listed PATCH, but we re-apply so the
  --     RPC can be called standalone from cron / backfills).
  UPDATE subscriptions
  SET category = p_new_category
  WHERE id = p_subscription_id
    AND user_id = p_user_id;

  -- 2b. Upsert the merchant-pattern override so future bank syncs inherit
  --     the correction. We only write a pattern override if the normalised
  --     pattern is meaningful (≥ 3 chars) to avoid pathological matches.
  IF LENGTH(v_pattern_lc) >= 3 THEN
    INSERT INTO money_hub_category_overrides (
      user_id, merchant_pattern, user_category, transaction_id
    )
    VALUES (p_user_id, v_pattern_lc, p_new_category, NULL)
    ON CONFLICT (user_id, merchant_pattern) WHERE transaction_id IS NULL
    DO UPDATE SET user_category = EXCLUDED.user_category;
    v_override_op := 'upserted';
  END IF;

  -- 2c. Retroactive recategorisation of existing bank_transactions.
  --     Match on either merchant_name or description (substring, case-
  --     insensitive) against:
  --       - the normalised raw bank pattern   (primary — catches raw
  --         descriptions like "TESTVALLEY BC DD 20MAR26")
  --       - the current provider_name         (fallback — catches manually
  --         added subs or already-cleaned merchant_name values)
  --
  --     Protections:
  --       * Never touches rows already in 'transfers' — preserves internal
  --         transfer classification computed by detect_internal_transfers.
  --       * Never touches rows that have a transaction-specific override
  --         in money_hub_category_overrides (those represent an explicit
  --         per-transaction user decision that outranks merchant-level).
  UPDATE bank_transactions bt
  SET user_category = p_new_category
  WHERE bt.user_id = p_user_id
    AND COALESCE(bt.user_category, '') <> 'transfers'
    AND COALESCE(bt.user_category, '') <> p_new_category   -- skip already-correct
    AND NOT EXISTS (
      SELECT 1
      FROM money_hub_category_overrides o
      WHERE o.user_id        = p_user_id
        AND o.transaction_id = bt.id::text
    )
    AND (
      (
        LENGTH(v_pattern_lc) >= 3 AND (
          LOWER(COALESCE(bt.merchant_name, '')) LIKE '%' || v_pattern_lc || '%'
          OR LOWER(COALESCE(bt.description, ''))   LIKE '%' || v_pattern_lc || '%'
        )
      )
      OR (
        LENGTH(v_provider_lc) >= 3 AND (
          LOWER(COALESCE(bt.merchant_name, '')) LIKE '%' || v_provider_lc || '%'
          OR LOWER(COALESCE(bt.description, ''))   LIKE '%' || v_provider_lc || '%'
        )
      )
    );

  GET DIAGNOSTICS v_txn_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'status',               'ok',
    'subscription_id',      p_subscription_id,
    'category',             p_new_category,
    'pattern',              v_pattern_lc,
    'provider',             v_provider_lc,
    'override_op',          v_override_op,
    'transactions_updated', v_txn_updated,
    'raw_name',             p_raw_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_subscription_category_correction(
  uuid, uuid, text, text, text, text
) TO authenticated, service_role;


-- ─── 3. Documentation comment for the business_log audit trail ──────────────
COMMENT ON FUNCTION apply_subscription_category_correction(uuid, uuid, text, text, text, text) IS
  'Propagates a user category correction on a subscription to: '
  'subscriptions.category, money_hub_category_overrides (merchant-wide), '
  'and bank_transactions.user_category (retroactive). Respects '
  'transaction-level overrides and never reclassifies ''transfers''. '
  'Single authoritative entry-point for Subscriptions ↔ Money Hub unity. '
  'Introduced 2026-04-17.';
