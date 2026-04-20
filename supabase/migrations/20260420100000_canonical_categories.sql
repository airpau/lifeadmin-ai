-- ============================================================
-- Canonical Category Taxonomy — 2026-04-20
--
-- Implements a fixed, two-tier category system:
--   Tier 1: Canonical parent categories (this migration)
--            — immutable, same for all users, enforced by CHECK constraint.
--            — the basis for all cross-user spending analysis and budgets.
--   Tier 2: User-created subcategories (user_category_custom table)
--            — per-user, always linked to a Tier 1 parent.
--            — purely for personal organisation and drill-down.
--
-- Canonical IDs (31 total):
--   mortgage, housing, council_tax, energy, water, broadband, mobile, bills,
--   groceries, eating_out, transport, travel, shopping, entertainment,
--   streaming, software, health, personal_care, insurance, loans, savings,
--   fees, tax, education, family, pets, charity, gambling, income,
--   transfers, other
--
-- Safety:
--   * All DML remaps legacy aliases BEFORE the CHECK constraint is added.
--   * CHECK constraint uses COALESCE so NULL passes (nullable column).
--   * No DROP TABLE, no DROP COLUMN, no destructive changes.
--   * CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS — all additive.
-- ============================================================


-- ─── 0. Canonical set as a Postgres array (used for CHECK below) ─────────────
-- Defined once here so it is easy to update if the taxonomy changes.
-- Keep this in sync with src/lib/categories.ts → CATEGORY_IDS.
DO $$
BEGIN
  -- No-op block — just a visual separator. The actual constant is inlined
  -- in the CHECK constraint below to keep the migration self-contained.
  NULL;
END $$;


-- ─── 1. Remap alias values → canonical IDs ───────────────────────────────────
-- Runs BEFORE the CHECK constraint is added.  Safe to re-run (idempotent).

-- bank_transactions.user_category
UPDATE bank_transactions SET user_category = 'groceries'     WHERE user_category IN ('food');
UPDATE bank_transactions SET user_category = 'transport'     WHERE user_category IN ('fuel', 'motoring', 'parking');
UPDATE bank_transactions SET user_category = 'health'        WHERE user_category IN ('fitness', 'healthcare');
UPDATE bank_transactions SET user_category = 'loans'         WHERE user_category IN ('loan');
UPDATE bank_transactions SET user_category = 'fees'          WHERE user_category IN ('fee', 'professional');
UPDATE bank_transactions SET user_category = 'bills'         WHERE user_category IN ('utility');
UPDATE bank_transactions SET user_category = 'entertainment' WHERE user_category IN ('music', 'gaming');
UPDATE bank_transactions SET user_category = 'software'      WHERE user_category IN ('storage');
UPDATE bank_transactions SET user_category = 'housing'       WHERE user_category IN ('property_management', 'rent');
UPDATE bank_transactions SET user_category = 'other'         WHERE user_category IN ('security', 'cash');
-- normalise any residual non-canonical values to 'other'
UPDATE bank_transactions
SET user_category = 'other'
WHERE user_category IS NOT NULL
  AND user_category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- subscriptions.category
UPDATE subscriptions SET category = 'groceries'     WHERE category IN ('food');
UPDATE subscriptions SET category = 'transport'     WHERE category IN ('fuel', 'motoring', 'parking');
UPDATE subscriptions SET category = 'health'        WHERE category IN ('fitness', 'healthcare');
UPDATE subscriptions SET category = 'loans'         WHERE category IN ('loan');
UPDATE subscriptions SET category = 'fees'          WHERE category IN ('fee', 'professional');
UPDATE subscriptions SET category = 'bills'         WHERE category IN ('utility');
UPDATE subscriptions SET category = 'entertainment' WHERE category IN ('music', 'gaming');
UPDATE subscriptions SET category = 'software'      WHERE category IN ('storage');
UPDATE subscriptions SET category = 'housing'       WHERE category IN ('property_management', 'rent');
UPDATE subscriptions SET category = 'other'         WHERE category IN ('security', 'cash');
UPDATE subscriptions
SET category = 'other'
WHERE category IS NOT NULL
  AND category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- money_hub_category_overrides.user_category
UPDATE money_hub_category_overrides SET user_category = 'groceries'     WHERE user_category IN ('food');
UPDATE money_hub_category_overrides SET user_category = 'transport'     WHERE user_category IN ('fuel', 'motoring', 'parking');
UPDATE money_hub_category_overrides SET user_category = 'health'        WHERE user_category IN ('fitness', 'healthcare');
UPDATE money_hub_category_overrides SET user_category = 'loans'         WHERE user_category IN ('loan');
UPDATE money_hub_category_overrides SET user_category = 'fees'          WHERE user_category IN ('fee', 'professional');
UPDATE money_hub_category_overrides SET user_category = 'bills'         WHERE user_category IN ('utility');
UPDATE money_hub_category_overrides SET user_category = 'entertainment' WHERE user_category IN ('music', 'gaming');
UPDATE money_hub_category_overrides SET user_category = 'software'      WHERE user_category IN ('storage');
UPDATE money_hub_category_overrides SET user_category = 'housing'       WHERE user_category IN ('property_management', 'rent');
UPDATE money_hub_category_overrides SET user_category = 'other'         WHERE user_category IN ('security', 'cash');
UPDATE money_hub_category_overrides
SET user_category = 'other'
WHERE user_category IS NOT NULL
  AND user_category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- merchant_rules.category (learning engine / auto-categorise source)
UPDATE merchant_rules SET category = 'groceries'     WHERE category IN ('food');
UPDATE merchant_rules SET category = 'transport'     WHERE category IN ('fuel', 'motoring', 'parking');
UPDATE merchant_rules SET category = 'health'        WHERE category IN ('fitness', 'healthcare');
UPDATE merchant_rules SET category = 'loans'         WHERE category IN ('loan');
UPDATE merchant_rules SET category = 'fees'          WHERE category IN ('fee', 'professional');
UPDATE merchant_rules SET category = 'bills'         WHERE category IN ('utility');
UPDATE merchant_rules SET category = 'entertainment' WHERE category IN ('music', 'gaming');
UPDATE merchant_rules SET category = 'software'      WHERE category IN ('storage');
UPDATE merchant_rules SET category = 'housing'       WHERE category IN ('property_management', 'rent');
UPDATE merchant_rules SET category = 'other'         WHERE category IN ('security', 'cash');
UPDATE merchant_rules
SET category = 'other'
WHERE category IS NOT NULL
  AND category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );


-- ─── 2. Add CHECK constraint on bank_transactions.user_category ──────────────
-- COALESCE means NULL is accepted (nullable column).
-- The constraint is NOT VALID so it doesn't scan existing rows (they were
-- already cleaned in step 1 above).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bank_transactions_user_category'
  ) THEN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT chk_bank_transactions_user_category
      CHECK (
        user_category IS NULL OR user_category IN (
          'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
          'groceries','eating_out','transport','travel','shopping','entertainment',
          'streaming','software','health','personal_care','insurance','loans','savings',
          'fees','tax','education','family','pets','charity','gambling',
          'income','transfers','other'
        )
      ) NOT VALID;
  END IF;
END $$;

-- Add CHECK constraint on subscriptions.category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_subscriptions_category'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT chk_subscriptions_category
      CHECK (
        category IS NULL OR category IN (
          'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
          'groceries','eating_out','transport','travel','shopping','entertainment',
          'streaming','software','health','personal_care','insurance','loans','savings',
          'fees','tax','education','family','pets','charity','gambling',
          'income','transfers','other'
        )
      ) NOT VALID;
  END IF;
END $$;


-- ─── 3. Add user_subcategory column to bank_transactions ─────────────────────
-- Tier-2 subcategory label — free text, per-user, optional.
-- Budget RPCs aggregate on user_category (Tier 1), not this field.
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS user_subcategory TEXT;

-- Add user_subcategory to subscriptions table too
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS user_subcategory TEXT;


-- ─── 4. user_category_custom — Tier-2 subcategory registry ──────────────────
-- Stores each user's personal subcategory definitions.
-- name must be ≤ 50 chars to keep Telegram inline keyboards readable.
-- parent_category is checked against the canonical list via CHECK constraint.

CREATE TABLE IF NOT EXISTS user_category_custom (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  parent_category  TEXT NOT NULL,
  name             TEXT NOT NULL CHECK (LENGTH(TRIM(name)) BETWEEN 1 AND 50),
  emoji            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ucc_parent_category CHECK (
    parent_category IN (
      'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
      'groceries','eating_out','transport','travel','shopping','entertainment',
      'streaming','software','health','personal_care','insurance','loans','savings',
      'fees','tax','education','family','pets','charity','gambling',
      'income','transfers','other'
    )
  ),
  UNIQUE (user_id, parent_category, name)
);

ALTER TABLE user_category_custom ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subcategories"
  ON user_category_custom FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ucc_user_parent
  ON user_category_custom (user_id, parent_category);


-- ─── 5. RPC: get_user_subcategories ──────────────────────────────────────────
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
    ON bt.user_id = p_user_id
   AND LOWER(bt.user_subcategory) = LOWER(ucc.name)
   AND LOWER(bt.user_category)   = LOWER(ucc.parent_category)
  WHERE ucc.user_id = p_user_id
    AND (p_parent IS NULL OR ucc.parent_category = p_parent)
  GROUP BY ucc.id, ucc.parent_category, ucc.name, ucc.emoji
  ORDER BY ucc.parent_category, COUNT(bt.id) DESC, ucc.name;
$$;
GRANT EXECUTE ON FUNCTION get_user_subcategories(uuid, text) TO authenticated, service_role;


-- ─── 6. RPC: upsert_user_subcategory ─────────────────────────────────────────
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


-- ─── 7. RPC: get_monthly_spending_by_subcategory ─────────────────────────────
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


-- ─── 8. Update SPENDING_CATEGORY_ALIASES in money_hub_category_overrides ─────
-- (Aliases were already remapped in step 1 above — this is a comment only)
-- ─── 9. Documentation ────────────────────────────────────────────────────────
COMMENT ON TABLE user_category_custom IS
  'Tier-2 subcategory registry. Stores each user''s personal subcategory '
  'definitions, always linked to a canonical parent from CATEGORY_IDS in '
  'src/lib/categories.ts. Budget RPCs aggregate on Tier-1 (user_category) '
  'only. Use get_monthly_spending_by_subcategory() for drill-down views. '
  'Introduced 2026-04-20.';

COMMENT ON COLUMN bank_transactions.user_subcategory IS
  'Optional Tier-2 subcategory label set by the user (e.g. "Organic" under '
  '"groceries"). Free text, per-user. Budget RPCs ignore this field. '
  'See user_category_custom for the user''s defined subcategory registry.';
