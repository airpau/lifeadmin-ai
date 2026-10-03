-- ============================================================
-- Restore the Tier-2 subcategory schema (2026-09-10)
--
-- WHY THIS EXISTS
--
-- 20260420100000_canonical_categories.sql declared the Tier-2
-- subcategory feature: a `user_subcategory` column on
-- bank_transactions and subscriptions, the user_category_custom
-- registry table, and three RPCs. Only the table actually landed in
-- production. Verified against the live database on 2026-09-10:
--
--   user_category_custom                     EXISTS
--   bank_transactions.user_subcategory       MISSING
--   subscriptions.user_subcategory           MISSING
--   get_user_subcategories()                 MISSING
--   upsert_user_subcategory()                MISSING
--   get_monthly_spending_by_subcategory()    MISSING
--
-- The application code was written against the declared schema, so
-- the drift is live breakage rather than an unused feature:
--
--   * /api/money-hub/ledger SELECTs user_subcategory. Postgres
--     rejects the whole statement with 42703, the route destructures
--     `{ data: txns }` without checking `error`, and `(txns ?? [])`
--     turns the failure into an empty array. The Money Hub
--     Transactions page therefore renders "no transactions" for
--     every user, with no error anywhere.
--   * /api/money-hub/recategorise writes user_subcategory on the
--     income and subcategory branches.
--   * /api/money-hub/user-categories/[id] reverse-syncs the column
--     on rename and delete.
--   * The Telegram Pocket Agent exposes upsert_user_subcategory and
--     list_user_subcategories as tools, and recategorise_transaction
--     accepts a user_subcategory argument.
--
-- This migration re-applies only the pieces that are missing. It is
-- strictly additive and idempotent: ADD COLUMN IF NOT EXISTS and
-- CREATE OR REPLACE FUNCTION only, no DROP, no destructive ALTER.
-- Re-running it against a database that already has these objects is
-- a no-op. Definitions are copied verbatim from the 20260420
-- migration so the two files cannot diverge.
-- ============================================================


-- ─── 1. user_subcategory columns ─────────────────────────────────────────────
-- Tier-2 subcategory label — free text, per-user, optional.
-- Budget RPCs aggregate on user_category (Tier 1), not this field.

ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS user_subcategory TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS user_subcategory TEXT;


-- ─── 2. RPC: get_user_subcategories ──────────────────────────────────────────
-- Returns all custom subcategories for a user, optionally filtered by parent.
-- Used by the Telegram bot to offer previously-defined subcategory suggestions.
CREATE OR REPLACE FUNCTION get_user_subcategories(
  p_user_id       uuid,
  p_parent        text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  parent_category text,
  name            text,
  emoji           text,
  usage_count     bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    ucc.id,
    ucc.parent_category,
    ucc.name,
    ucc.emoji,
    COUNT(bt.id) AS usage_count
  FROM user_category_custom ucc
  LEFT JOIN bank_transactions bt
    ON  bt.user_id = p_user_id
    AND LOWER(bt.user_subcategory) = LOWER(ucc.name)
    AND bt.user_category = ucc.parent_category
  WHERE ucc.user_id = p_user_id
    AND (p_parent IS NULL OR ucc.parent_category = p_parent)
  GROUP BY ucc.id, ucc.parent_category, ucc.name, ucc.emoji
  ORDER BY ucc.parent_category, COUNT(bt.id) DESC, ucc.name;
$$;
GRANT EXECUTE ON FUNCTION get_user_subcategories(uuid, text) TO authenticated, service_role;


-- ─── 3. RPC: upsert_user_subcategory ─────────────────────────────────────────
-- Called by the Telegram bot when a user assigns a subcategory for the first time.
-- Idempotent — returns the subcategory ID whether it existed or was just created.
CREATE OR REPLACE FUNCTION upsert_user_subcategory(
  p_user_id       uuid,
  p_parent        text,
  p_name          text,
  p_emoji         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO user_category_custom (user_id, parent_category, name, emoji)
  VALUES (p_user_id, p_parent, TRIM(p_name), p_emoji)
  ON CONFLICT (user_id, parent_category, name) DO UPDATE
    SET emoji = COALESCE(EXCLUDED.emoji, user_category_custom.emoji)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION upsert_user_subcategory(uuid, text, text, text) TO authenticated, service_role;


-- ─── 4. RPC: get_monthly_spending_by_subcategory ─────────────────────────────
-- Drill-down view for a single parent category — breaks spending into
-- user_subcategory buckets for a given month.
-- Only useful when a user has assigned subcategories to transactions.
CREATE OR REPLACE FUNCTION get_monthly_spending_by_subcategory(
  p_user_id   uuid,
  p_year      int,
  p_month     int,
  p_category  text
)
RETURNS TABLE (
  subcategory   text,
  total         numeric,
  txn_count     bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(TRIM(user_subcategory), '(untagged)') AS subcategory,
    SUM(ABS(amount))                               AS total,
    COUNT(*)                                       AS txn_count
  FROM bank_transactions
  WHERE user_id        = p_user_id
    AND user_category  = p_category
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
  GROUP BY COALESCE(TRIM(user_subcategory), '(untagged)')
  ORDER BY SUM(ABS(amount)) DESC;
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending_by_subcategory(uuid, int, int, text)
  TO authenticated, service_role;


-- ─── 5. Documentation ────────────────────────────────────────────────────────
COMMENT ON COLUMN bank_transactions.user_subcategory IS
  'Optional Tier-2 subcategory label set by the user (e.g. "Organic" under '
  '"groceries"). Free text, per-user. Budget RPCs ignore this field. '
  'See user_category_custom for the user''s defined subcategory registry.';

COMMENT ON COLUMN subscriptions.user_subcategory IS
  'Optional Tier-2 subcategory label set by the user. Mirrors '
  'bank_transactions.user_subcategory for subscription rows.';
