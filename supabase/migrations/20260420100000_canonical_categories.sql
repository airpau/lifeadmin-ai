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
-- Canonical IDs (31 total — stored as lowercase snake_case):
--   mortgage, housing, council_tax, energy, water, broadband, mobile, bills,
--   groceries, eating_out, transport, travel, shopping, entertainment,
--   streaming, software, health, personal_care, insurance, loans, savings,
--   fees, tax, education, family, pets, charity, gambling, income,
--   transfers, other
--
-- Display labels (Title Case) are in src/lib/categories.ts → CATEGORY_LABELS.
-- The DB stores IDs (lowercase snake_case); the UI maps them to labels.
--
-- IMPORTANT — transfers and income:
--   Both are SYSTEM categories. The Money Hub spending analysis EXCLUDES
--   them from totals. Do not add them to budget categories or spending charts.
--
-- Safety:
--   * All DML remaps legacy aliases BEFORE the CHECK constraint is added.
--   * Step 0 case-normalises FIRST so all alias comparisons are lowercase.
--   * CHECK constraint uses IS NULL so NULL passes (nullable column).
--   * NOT VALID skips re-scan of rows already cleaned in step 1.
--   * No DROP TABLE, no DROP COLUMN, no destructive changes.
--   * CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS — all additive.
-- ============================================================


-- ─── 0. Case normalisation — run BEFORE alias remapping ──────────────────────
-- Many rows were set via free text (user edits, legacy imports) and may be
-- mixed-case ("Professional", "Bills", "Healthcare", "Property Management").
-- Lowercasing + trimming first means every alias comparison below is exact.
-- merchant_category values from TrueLayer arrive as UPPER_CASE — normalise those
-- too so any manually stored values are consistent.

UPDATE bank_transactions
SET    user_category = LOWER(TRIM(user_category))
WHERE  user_category IS NOT NULL;

UPDATE bank_transactions
SET    merchant_category = LOWER(TRIM(merchant_category))
WHERE  merchant_category IS NOT NULL;

UPDATE subscriptions
SET    category = LOWER(TRIM(category))
WHERE  category IS NOT NULL;

UPDATE money_hub_category_overrides
SET    user_category = LOWER(TRIM(user_category))
WHERE  user_category IS NOT NULL;

UPDATE merchant_rules
SET    category = LOWER(TRIM(category))
WHERE  category IS NOT NULL;


-- ─── 1. Remap alias values → canonical IDs ───────────────────────────────────
-- All values are now lowercase (step 0).  Runs BEFORE CHECK constraint.
-- Idempotent — safe to re-run.

-- ── bank_transactions.user_category ──────────────────────────────────────────
-- Food / groceries
UPDATE bank_transactions SET user_category = 'groceries'     WHERE user_category IN ('food', 'supermarket', 'supermarkets');
-- Transport
UPDATE bank_transactions SET user_category = 'transport'     WHERE user_category IN ('fuel', 'motoring', 'parking', 'vehicle');
-- Health & Fitness
UPDATE bank_transactions SET user_category = 'health'        WHERE user_category IN ('fitness', 'healthcare', 'medical', 'pharmacy', 'gym');
-- Loans & Credit
UPDATE bank_transactions SET user_category = 'loans'         WHERE user_category IN ('loan', 'credit', 'debt', 'finance');
-- Fees & Charges (professional services fall here — too vague for own category)
UPDATE bank_transactions SET user_category = 'fees'          WHERE user_category IN ('fee', 'professional', 'bank charge', 'bank charges', 'charges');
-- Bills & Utilities (generic catch-all for utility bills)
UPDATE bank_transactions SET user_category = 'bills'         WHERE user_category IN ('utility', 'utilities');
-- Entertainment
UPDATE bank_transactions SET user_category = 'entertainment' WHERE user_category IN ('music', 'gaming', 'games', 'cinema', 'sport', 'sports');
-- Software & Apps
UPDATE bank_transactions SET user_category = 'software'      WHERE user_category IN ('storage', 'subscriptions', 'apps');
-- Housing (handles both underscore and space variants)
UPDATE bank_transactions SET user_category = 'housing'       WHERE user_category IN ('property_management', 'property management', 'rent', 'letting', 'landlord');
-- Transfers (singular form from older data / TrueLayer raw)
UPDATE bank_transactions SET user_category = 'transfers'     WHERE user_category IN ('transfer', 'internal transfer', 'bank transfer');
-- Eating Out
UPDATE bank_transactions SET user_category = 'eating_out'    WHERE user_category IN ('eating out', 'restaurants', 'restaurant', 'takeaway', 'takeaways');
-- Council Tax (space variant)
UPDATE bank_transactions SET user_category = 'council_tax'   WHERE user_category IN ('council tax', 'council');
-- Personal Care (space variant)
UPDATE bank_transactions SET user_category = 'personal_care' WHERE user_category IN ('personal care', 'beauty', 'haircare');
-- Family & Childcare
UPDATE bank_transactions SET user_category = 'family'        WHERE user_category IN ('childcare', 'children', 'child care', 'kids');
-- Tax & Government
UPDATE bank_transactions SET user_category = 'tax'           WHERE user_category IN ('hmrc', 'vat', 'tax payment', 'self assessment');
-- Shopping
UPDATE bank_transactions SET user_category = 'shopping'      WHERE user_category IN ('retail', 'clothes', 'clothing', 'fashion');
-- Travel
UPDATE bank_transactions SET user_category = 'travel'        WHERE user_category IN ('holiday', 'holidays', 'flights', 'hotel', 'hotels', 'accommodation');
-- Other catch-alls
UPDATE bank_transactions SET user_category = 'other'         WHERE user_category IN ('security', 'cash', 'misc', 'miscellaneous', 'unknown');
-- Finalise: anything unrecognised → other
UPDATE bank_transactions
SET    user_category = 'other'
WHERE  user_category IS NOT NULL
  AND  user_category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- ── bank_transactions.merchant_category ──────────────────────────────────────
-- TrueLayer/Yapily values arrive as UPPER_CASE (now lowercased by step 0).
-- Map to canonical IDs.
UPDATE bank_transactions SET merchant_category = 'bills'         WHERE merchant_category IN ('bills');
UPDATE bank_transactions SET merchant_category = 'other'         WHERE merchant_category IN ('cash', 'general');
UPDATE bank_transactions SET merchant_category = 'charity'       WHERE merchant_category IN ('charity');
UPDATE bank_transactions SET merchant_category = 'eating_out'    WHERE merchant_category IN ('eating_out', 'eating out');
UPDATE bank_transactions SET merchant_category = 'entertainment' WHERE merchant_category IN ('entertainment');
UPDATE bank_transactions SET merchant_category = 'fees'          WHERE merchant_category IN ('expenses');
UPDATE bank_transactions SET merchant_category = 'family'        WHERE merchant_category IN ('family');
UPDATE bank_transactions SET merchant_category = 'groceries'     WHERE merchant_category IN ('groceries');
UPDATE bank_transactions SET merchant_category = 'travel'        WHERE merchant_category IN ('holidays', 'travel');
UPDATE bank_transactions SET merchant_category = 'housing'       WHERE merchant_category IN ('home');
UPDATE bank_transactions SET merchant_category = 'income'        WHERE merchant_category IN ('income', 'credit', 'interest');
UPDATE bank_transactions SET merchant_category = 'insurance'     WHERE merchant_category IN ('insurance');
UPDATE bank_transactions SET merchant_category = 'personal_care' WHERE merchant_category IN ('personal_care', 'personal care');
UPDATE bank_transactions SET merchant_category = 'shopping'      WHERE merchant_category IN ('purchase', 'shopping');
UPDATE bank_transactions SET merchant_category = 'savings'       WHERE merchant_category IN ('savings');
UPDATE bank_transactions SET merchant_category = 'transport'     WHERE merchant_category IN ('transport');
UPDATE bank_transactions SET merchant_category = 'transfers'     WHERE merchant_category IN ('transfer', 'transfers');
-- Finalise merchant_category
UPDATE bank_transactions
SET    merchant_category = 'other'
WHERE  merchant_category IS NOT NULL
  AND  merchant_category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- ── subscriptions.category ───────────────────────────────────────────────────
UPDATE subscriptions SET category = 'groceries'     WHERE category IN ('food', 'supermarket');
UPDATE subscriptions SET category = 'transport'     WHERE category IN ('fuel', 'motoring', 'parking', 'vehicle');
UPDATE subscriptions SET category = 'health'        WHERE category IN ('fitness', 'healthcare', 'medical', 'gym');
UPDATE subscriptions SET category = 'loans'         WHERE category IN ('loan', 'credit', 'debt', 'finance');
UPDATE subscriptions SET category = 'fees'          WHERE category IN ('fee', 'professional', 'charges');
UPDATE subscriptions SET category = 'bills'         WHERE category IN ('utility', 'utilities');
UPDATE subscriptions SET category = 'entertainment' WHERE category IN ('music', 'gaming', 'games', 'cinema');
UPDATE subscriptions SET category = 'software'      WHERE category IN ('storage', 'subscriptions', 'apps');
UPDATE subscriptions SET category = 'housing'       WHERE category IN ('property_management', 'property management', 'rent', 'letting');
UPDATE subscriptions SET category = 'transfers'     WHERE category IN ('transfer', 'bank transfer');
UPDATE subscriptions SET category = 'eating_out'    WHERE category IN ('eating out', 'restaurants', 'takeaway');
UPDATE subscriptions SET category = 'council_tax'   WHERE category IN ('council tax', 'council');
UPDATE subscriptions SET category = 'personal_care' WHERE category IN ('personal care', 'beauty');
UPDATE subscriptions SET category = 'family'        WHERE category IN ('childcare', 'child care', 'kids');
UPDATE subscriptions SET category = 'other'         WHERE category IN ('security', 'cash', 'misc', 'unknown');
UPDATE subscriptions
SET    category = 'other'
WHERE  category IS NOT NULL
  AND  category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- ── money_hub_category_overrides.user_category ───────────────────────────────
UPDATE money_hub_category_overrides SET user_category = 'groceries'     WHERE user_category IN ('food', 'supermarket');
UPDATE money_hub_category_overrides SET user_category = 'transport'     WHERE user_category IN ('fuel', 'motoring', 'parking', 'vehicle');
UPDATE money_hub_category_overrides SET user_category = 'health'        WHERE user_category IN ('fitness', 'healthcare', 'medical', 'gym');
UPDATE money_hub_category_overrides SET user_category = 'loans'         WHERE user_category IN ('loan', 'credit', 'debt', 'finance');
UPDATE money_hub_category_overrides SET user_category = 'fees'          WHERE user_category IN ('fee', 'professional', 'charges');
UPDATE money_hub_category_overrides SET user_category = 'bills'         WHERE user_category IN ('utility', 'utilities');
UPDATE money_hub_category_overrides SET user_category = 'entertainment' WHERE user_category IN ('music', 'gaming', 'games');
UPDATE money_hub_category_overrides SET user_category = 'software'      WHERE user_category IN ('storage', 'subscriptions', 'apps');
UPDATE money_hub_category_overrides SET user_category = 'housing'       WHERE user_category IN ('property_management', 'property management', 'rent', 'letting');
UPDATE money_hub_category_overrides SET user_category = 'transfers'     WHERE user_category IN ('transfer', 'bank transfer');
UPDATE money_hub_category_overrides SET user_category = 'eating_out'    WHERE user_category IN ('eating out', 'restaurants', 'takeaway');
UPDATE money_hub_category_overrides SET user_category = 'council_tax'   WHERE user_category IN ('council tax', 'council');
UPDATE money_hub_category_overrides SET user_category = 'personal_care' WHERE user_category IN ('personal care', 'beauty');
UPDATE money_hub_category_overrides SET user_category = 'family'        WHERE user_category IN ('childcare', 'child care', 'kids');
UPDATE money_hub_category_overrides SET user_category = 'other'         WHERE user_category IN ('security', 'cash', 'misc', 'unknown');
UPDATE money_hub_category_overrides
SET    user_category = 'other'
WHERE  user_category IS NOT NULL
  AND  user_category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- ── merchant_rules.category (learning engine) ────────────────────────────────
UPDATE merchant_rules SET category = 'groceries'     WHERE category IN ('food', 'supermarket');
UPDATE merchant_rules SET category = 'transport'     WHERE category IN ('fuel', 'motoring', 'parking', 'vehicle');
UPDATE merchant_rules SET category = 'health'        WHERE category IN ('fitness', 'healthcare', 'medical', 'gym');
UPDATE merchant_rules SET category = 'loans'         WHERE category IN ('loan', 'credit', 'debt', 'finance');
UPDATE merchant_rules SET category = 'fees'          WHERE category IN ('fee', 'professional', 'charges');
UPDATE merchant_rules SET category = 'bills'         WHERE category IN ('utility', 'utilities');
UPDATE merchant_rules SET category = 'entertainment' WHERE category IN ('music', 'gaming', 'games');
UPDATE merchant_rules SET category = 'software'      WHERE category IN ('storage', 'subscriptions', 'apps');
UPDATE merchant_rules SET category = 'housing'       WHERE category IN ('property_management', 'property management', 'rent', 'letting');
UPDATE merchant_rules SET category = 'transfers'     WHERE category IN ('transfer', 'bank transfer');
UPDATE merchant_rules SET category = 'eating_out'    WHERE category IN ('eating out', 'restaurants', 'takeaway');
UPDATE merchant_rules SET category = 'council_tax'   WHERE category IN ('council tax', 'council');
UPDATE merchant_rules SET category = 'personal_care' WHERE category IN ('personal care', 'beauty');
UPDATE merchant_rules SET category = 'family'        WHERE category IN ('childcare', 'child care', 'kids');
UPDATE merchant_rules SET category = 'other'         WHERE category IN ('security', 'cash', 'misc', 'unknown');
UPDATE merchant_rules
SET    category = 'other'
WHERE  category IS NOT NULL
  AND  category NOT IN (
    'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );


-- ─── 2. Add CHECK constraint on bank_transactions.user_category ──────────────
-- IS NULL means NULL is accepted (nullable column).
-- NOT VALID skips the backward scan — rows were cleaned in step 1 above.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'chk_bank_transactions_user_category'
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

-- CHECK constraint on bank_transactions.merchant_category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'chk_bank_transactions_merchant_category'
  ) THEN
    ALTER TABLE bank_transactions
      ADD CONSTRAINT chk_bank_transactions_merchant_category
      CHECK (
        merchant_category IS NULL OR merchant_category IN (
          'mortgage','housing','council_tax','energy','water','broadband','mobile','bills',
          'groceries','eating_out','transport','travel','shopping','entertainment',
          'streaming','software','health','personal_care','insurance','loans','savings',
          'fees','tax','education','family','pets','charity','gambling',
          'income','transfers','other'
        )
      ) NOT VALID;
  END IF;
END $$;

-- CHECK constraint on subscriptions.category
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conname = 'chk_subscriptions_category'
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
    ON  bt.user_id = p_user_id
    AND LOWER(bt.user_subcategory) = LOWER(ucc.name)
    AND bt.user_category = ucc.parent_category
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


-- ─── 8. Documentation ────────────────────────────────────────────────────────
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

COMMENT ON COLUMN bank_transactions.user_category IS
  'Canonical Tier-1 category ID (lowercase snake_case). Always one of the 31 '
  'IDs defined in src/lib/categories.ts. Display labels (Title Case) are '
  'obtained by mapping through CATEGORY_LABELS. '
  'The transfers and income categories are excluded from spending analysis.';

COMMENT ON COLUMN bank_transactions.merchant_category IS
  'Canonical Tier-1 category ID derived from the bank provider''s raw '
  'merchant_category value. Normalised to lowercase snake_case by the '
  'classification pipeline (mapBankCategory in src/lib/categories.ts).';
