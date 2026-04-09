-- auto_categorise_transactions(p_user_id uuid)
-- Called by the bank-sync cron after every upsert to categorise newly inserted
-- transactions that have user_category IS NULL.
--
-- Priority order:
--   1. merchant_rules table (longest match on description wins)
--   2. UK-common transfer patterns (A/C, FPS, TFR, etc.)
--   3. Direct debit / standing order descriptions → bills
--   4. Salary / payroll descriptions → income
--
-- Respects money_hub_category_overrides (user manual overrides are never touched).
-- Idempotent — safe to run multiple times.

CREATE OR REPLACE FUNCTION auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  merchant_count  integer := 0;
  transfer_count  integer := 0;
  bills_count     integer := 0;
  income_count    integer := 0;
BEGIN
  -- ── 1. Apply merchant_rules by description (longest match wins) ──────────────
  WITH merchant_matched AS (
    SELECT DISTINCT ON (bt.id) bt.id,
      CASE
        WHEN mr.is_transfer = true         THEN 'transfers'
        WHEN mr.category = 'utility'       THEN 'energy'
        WHEN mr.category = 'loan'          THEN 'loans'
        WHEN mr.category = 'fee'           THEN 'bills'
        WHEN mr.category = 'food' AND bt.amount < -20 THEN 'groceries'
        WHEN mr.category = 'food'          THEN 'eating_out'
        WHEN mr.category = 'gambling'      THEN 'entertainment'
        WHEN mr.category = 'travel'        THEN 'transport'
        WHEN mr.category = 'healthcare'    THEN 'insurance'
        WHEN mr.category = 'charity'       THEN 'bills'
        WHEN mr.category = 'education'     THEN 'professional'
        WHEN mr.category = 'pets'          THEN 'bills'
        ELSE mr.category
      END AS new_category
    FROM bank_transactions bt
    JOIN merchant_rules mr
      ON LOWER(COALESCE(bt.description, '')) LIKE '%' || mr.raw_name_normalised || '%'
    WHERE bt.user_id = p_user_id
      AND bt.user_category IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM money_hub_category_overrides o
        WHERE o.user_id = p_user_id
          AND o.transaction_id = bt.id::text
      )
    ORDER BY bt.id, LENGTH(mr.raw_name_normalised) DESC
  )
  UPDATE bank_transactions bt
  SET    user_category = mm.new_category
  FROM   merchant_matched mm
  WHERE  bt.id = mm.id;
  GET DIAGNOSTICS merchant_count = ROW_COUNT;

  -- ── 2. UK transfer patterns ──────────────────────────────────────────────────
  -- Covers: "A/C" merchant name (Yapily shorthand for account-to-account),
  -- FPS (Faster Payments), TFR/TRF (transfer), and common description keywords.
  UPDATE bank_transactions
  SET    user_category = 'transfers'
  WHERE  user_id = p_user_id
    AND  user_category IS NULL
    AND  (
           merchant_name ILIKE 'a/c'
        OR LOWER(COALESCE(description, '')) LIKE '%to a/c%'
        OR LOWER(COALESCE(description, '')) LIKE '%from a/c%'
        OR LOWER(COALESCE(description, '')) LIKE '%a/c no%'
        OR LOWER(COALESCE(description, '')) LIKE '% fps %'
        OR LOWER(COALESCE(description, '')) LIKE 'fps %'
        OR LOWER(COALESCE(description, '')) LIKE '% tfr %'
        OR LOWER(COALESCE(description, '')) LIKE '% trf %'
        OR LOWER(COALESCE(description, '')) LIKE '%transfer from%'
        OR LOWER(COALESCE(description, '')) LIKE '%transfer to%'
        OR LOWER(COALESCE(description, '')) LIKE '%interaccount%'
        OR LOWER(COALESCE(description, '')) LIKE '%internal transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%savings transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%isa transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%via mobile%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id
        AND o.transaction_id = bank_transactions.id::text
    );
  GET DIAGNOSTICS transfer_count = ROW_COUNT;

  -- ── 3. Direct debits / standing orders → bills ────────────────────────────────
  UPDATE bank_transactions
  SET    user_category = 'bills'
  WHERE  user_id = p_user_id
    AND  user_category IS NULL
    AND  amount < 0
    AND  (
           LOWER(COALESCE(description, '')) LIKE '%direct debit%'
        OR LOWER(COALESCE(description, '')) LIKE '%standing order%'
        OR LOWER(COALESCE(description, '')) LIKE '% d/d %'
        OR LOWER(COALESCE(description, '')) LIKE '% s/o %'
    )
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id
        AND o.transaction_id = bank_transactions.id::text
    );
  GET DIAGNOSTICS bills_count = ROW_COUNT;

  -- ── 4. Salary / payroll credits → income ──────────────────────────────────────
  UPDATE bank_transactions
  SET    user_category = 'income',
         income_type   = 'salary'
  WHERE  user_id = p_user_id
    AND  user_category IS NULL
    AND  amount > 0
    AND  (
           LOWER(COALESCE(description, '')) LIKE '%salary%'
        OR LOWER(COALESCE(description, '')) LIKE '%payroll%'
        OR LOWER(COALESCE(description, '')) LIKE '%wages%'
        OR LOWER(COALESCE(description, '')) LIKE '%pay %'
    )
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id
        AND o.transaction_id = bank_transactions.id::text
    );
  GET DIAGNOSTICS income_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'merchant_rules_applied', merchant_count,
    'transfers_tagged',        transfer_count,
    'bills_tagged',            bills_count,
    'income_tagged',           income_count,
    'status',                  'complete'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_categorise_transactions(uuid) TO authenticated, service_role;

-- ── Back-fill: run immediately for all users with uncategorised April 2026 rows ─
-- This fixes the existing data without waiting for the next cron run.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id
    FROM bank_transactions
    WHERE user_category IS NULL
      AND timestamp >= '2026-04-01'::timestamptz
  LOOP
    PERFORM auto_categorise_transactions(r.user_id);
  END LOOP;
END;
$$;
