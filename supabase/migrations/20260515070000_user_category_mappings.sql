-- ============================================================
-- User-defined subcategory mappings + parent_category column (2026-05-15)
--
-- Enables users to recategorise transactions with custom labels
-- (e.g. "Sainsbury's", "PCL Rent") while preserving canonical parent
-- categories for budgets and analytics.
--
-- Changes:
--   1. Add `parent_category` to bank_transactions — the canonical Tier-1
--      parent used for all budget/analytics queries.
--   2. Backfill parent_category from user_category (currently always canonical).
--   3. Create user_category_mappings — persists user's custom label → parent
--      mapping so the bot can look it up on future uses without re-inferring.
--   4. Update get_monthly_spending / get_monthly_spending_total RPCs to group
--      on parent_category (falling back to user_category for legacy rows).
-- ============================================================


-- ─── 1. Add parent_category column ───────────────────────────────────────────
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS parent_category TEXT;

-- ─── 2. Backfill: existing user_category values ARE canonical parents ─────────
UPDATE bank_transactions
SET    parent_category = LOWER(TRIM(user_category))
WHERE  parent_category IS NULL
  AND  user_category IS NOT NULL
  AND  user_category IN (
    'mortgage','rent','housing','council_tax','energy','water','broadband','mobile','bills',
    'groceries','eating_out','transport','travel','shopping','entertainment',
    'streaming','software','health','personal_care','insurance','loans','savings',
    'fees','tax','education','family','pets','charity','gambling',
    'income','transfers','other'
  );

-- ─── 3. user_category_mappings table ─────────────────────────────────────────
-- Maps a user's custom label (lowercase) to a canonical parent category.
-- Populated automatically on first use by the subcategory engine.
CREATE TABLE IF NOT EXISTS user_category_mappings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subcategory      TEXT        NOT NULL,    -- user's custom label, lowercase trimmed
  parent_category  TEXT        NOT NULL,    -- canonical Tier-1 ID
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, subcategory)
);

ALTER TABLE user_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mappings"
  ON user_category_mappings
  FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ucm_user_subcategory
  ON user_category_mappings (user_id, subcategory);

-- ─── 4. Update get_monthly_spending RPC ───────────────────────────────────────
-- Use parent_category when present (new rows), fall back to user_category
-- (existing/legacy rows where parent_category was just backfilled but may
-- differ for rows with custom subcategory labels going forward).
CREATE OR REPLACE FUNCTION get_monthly_spending(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(category text, category_total numeric, transaction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    LOWER(TRIM(COALESCE(parent_category, user_category, category, 'other'))) AS category,
    SUM(ABS(amount)) AS category_total,
    COUNT(*) AS transaction_count
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND LOWER(COALESCE(parent_category, user_category, '')) NOT IN ('transfers', 'income')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
  GROUP BY LOWER(TRIM(COALESCE(parent_category, user_category, category, 'other')))
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending(uuid, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION get_monthly_spending_total(p_user_id uuid, p_year int, p_month int)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(ABS(amount)), 0)
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND LOWER(COALESCE(parent_category, user_category, '')) NOT IN ('transfers', 'income')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending_total(uuid, int, int) TO authenticated, service_role;

-- ─── 5. Documentation ────────────────────────────────────────────────────────
COMMENT ON COLUMN bank_transactions.parent_category IS
  'Canonical Tier-1 parent category ID. For transactions recategorised with a '
  'custom subcategory label (e.g. "Sainsbury''s"), this holds the inferred '
  'canonical parent (e.g. "groceries"). Budget RPCs group on this column '
  'with fallback to user_category for legacy rows. Set by the subcategory '
  'engine in src/lib/subcategory-engine.ts. Introduced 2026-05-15.';

COMMENT ON TABLE user_category_mappings IS
  'Persists the user''s custom subcategory → canonical parent mappings. '
  'Populated automatically by the subcategory engine on first use so future '
  'lookups skip the keyword-inference step. One row per (user, subcategory). '
  'Introduced 2026-05-15.';
