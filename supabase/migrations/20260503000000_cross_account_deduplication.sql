-- ============================================================
-- Cross-Account Transaction Deduplication — 2026-05-03
--
-- Root cause: When a user has multiple bank accounts at the same
-- bank (e.g. personal + joint), the same real-world payment
-- appears in BOTH account transaction feeds from TrueLayer with
-- different transaction_id values. The existing UNIQUE(user_id,
-- transaction_id) constraint only prevents same-account duplicates.
--
-- This migration:
-- 1. Adds is_cross_account_duplicate flag to bank_transactions
-- 2. Creates detect_cross_account_duplicates() function
-- 3. Updates all spending/income RPCs to exclude duplicates
-- 4. Backfills existing data
-- ============================================================


-- ─── 1. Add duplicate flag column ─────────────────────────────────────────────
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS is_cross_account_duplicate BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_not_duplicate
  ON bank_transactions(user_id, timestamp)
  WHERE is_cross_account_duplicate = FALSE;


-- ─── 2. detect_cross_account_duplicates ───────────────────────────────────────
-- Finds transactions that appear in multiple accounts for the same user:
--   - Same user_id
--   - Different account_id
--   - Same amount (exact match)
--   - Same date (within 24-hour window)
--   - Similar merchant/description (first 8 chars match, or both null)
--
-- For each group of duplicates, keeps the EARLIEST inserted row (smallest id)
-- and marks the rest as is_cross_account_duplicate = TRUE.
--
-- Safe to re-run: only marks rows that aren't already marked.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detect_cross_account_duplicates(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Step 1: Clear any previous duplicate flags for this user so we
  -- recompute from scratch (handles edge cases like account removal).
  UPDATE bank_transactions
  SET is_cross_account_duplicate = FALSE
  WHERE user_id = p_user_id
    AND is_cross_account_duplicate = TRUE;

  -- Step 2: For each group of matching transactions across different
  -- accounts, keep the one with the smallest id (earliest inserted)
  -- and mark the rest as duplicates.
  WITH duplicate_groups AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          user_id,
          amount,
          DATE(timestamp),
          LOWER(LEFT(COALESCE(NULLIF(TRIM(merchant_name), ''), NULLIF(TRIM(description), ''), ''), 8))
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM bank_transactions
    WHERE user_id = p_user_id
      AND is_pending = FALSE
  ),
  to_mark AS (
    SELECT dg.id
    FROM duplicate_groups dg
    WHERE dg.rn > 1
      -- Only mark as duplicate if there are actually multiple DIFFERENT accounts
      AND EXISTS (
        SELECT 1
        FROM bank_transactions t1
        JOIN bank_transactions t2 ON (
          t1.user_id = t2.user_id
          AND t1.amount = t2.amount
          AND DATE(t1.timestamp) = DATE(t2.timestamp)
          AND LOWER(LEFT(COALESCE(NULLIF(TRIM(t1.merchant_name), ''), NULLIF(TRIM(t1.description), ''), ''), 8))
            = LOWER(LEFT(COALESCE(NULLIF(TRIM(t2.merchant_name), ''), NULLIF(TRIM(t2.description), ''), ''), 8))
          AND t1.account_id != t2.account_id
          AND t1.id != t2.id
          AND t2.is_pending = FALSE
        )
        WHERE t1.id = dg.id
          AND t1.is_pending = FALSE
      )
  )
  UPDATE bank_transactions
  SET is_cross_account_duplicate = TRUE
  FROM to_mark
  WHERE bank_transactions.id = to_mark.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION detect_cross_account_duplicates(uuid) TO authenticated, service_role;


-- ─── 3. Update spending/income RPCs to exclude duplicates ─────────────────────
-- All four RPCs get an additional WHERE clause:
--   AND is_cross_account_duplicate = FALSE

DROP FUNCTION IF EXISTS get_monthly_income_total(uuid, int, int);
CREATE FUNCTION get_monthly_income_total(p_user_id uuid, p_year int, p_month int)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM bank_transactions
  WHERE user_id   = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount    > 0
    AND COALESCE(user_category, '') NOT IN ('transfers')
    AND COALESCE(income_type,   '') NOT IN ('transfer', 'credit_loan')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND is_cross_account_duplicate = FALSE
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income_total(uuid, int, int) TO authenticated, service_role;

DROP FUNCTION IF EXISTS get_monthly_income(uuid, int, int);
CREATE FUNCTION get_monthly_income(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(source text, source_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(income_type, 'other') AS source,
    SUM(amount)                    AS source_total
  FROM bank_transactions
  WHERE user_id   = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount    > 0
    AND COALESCE(user_category, '') NOT IN ('transfers')
    AND COALESCE(income_type,   '') NOT IN ('transfer', 'credit_loan')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND is_cross_account_duplicate = FALSE
  GROUP BY income_type
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income(uuid, int, int) TO authenticated, service_role;

DROP FUNCTION IF EXISTS get_monthly_spending_total(uuid, int, int);
CREATE FUNCTION get_monthly_spending_total(p_user_id uuid, p_year int, p_month int)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(ABS(amount)), 0)
  FROM bank_transactions
  WHERE user_id   = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount    < 0
    AND COALESCE(user_category, '') NOT IN ('transfers', 'income')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND is_cross_account_duplicate = FALSE
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending_total(uuid, int, int) TO authenticated, service_role;

DROP FUNCTION IF EXISTS get_monthly_spending(uuid, int, int);
CREATE FUNCTION get_monthly_spending(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(category text, category_total numeric, transaction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(user_category, 'other') AS category,
    SUM(ABS(amount))                 AS category_total,
    COUNT(*)                         AS transaction_count
  FROM bank_transactions
  WHERE user_id   = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount    < 0
    AND COALESCE(user_category, '') NOT IN ('transfers', 'income')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND is_cross_account_duplicate = FALSE
  GROUP BY COALESCE(user_category, 'other')
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending(uuid, int, int) TO authenticated, service_role;


-- ─── 4. Update get_expected_bills to exclude duplicates ───────────────────────
DROP FUNCTION IF EXISTS get_expected_bills(uuid, int, int);
CREATE FUNCTION get_expected_bills(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(
  provider_name    text,
  expected_amount  numeric,
  expected_date    date,
  billing_day      int,
  occurrence_count bigint,
  is_subscription  boolean,
  subscription_id  uuid,
  bill_key         text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH window_start AS (
    SELECT (MAKE_DATE(p_year, p_month, 1) - INTERVAL '6 months')::timestamptz AS cutoff
  ),
  dismissed AS (
    SELECT bill_key
    FROM dismissed_expected_bills
    WHERE user_id   = p_user_id
      AND bill_month = TO_CHAR(MAKE_DATE(p_year, p_month, 1), 'YYYY-MM-DD')
  ),
  debit_txns AS (
    SELECT
      COALESCE(
        NULLIF(TRIM(merchant_name), ''),
        NULLIF(TRIM(
          REGEXP_REPLACE(
            REGEXP_REPLACE(COALESCE(description,''), '\s+\d{8,}.*$', ''),
            '\s+[A-Z]{2,}[\d/]+[A-Z0-9]*$', ''
          )
        ), '')
      ) AS provider,
      ABS(amount)                          AS txn_amount,
      EXTRACT(DAY FROM timestamp)::int     AS day_of_month,
      DATE_TRUNC('month', timestamp)::date AS txn_month
    FROM bank_transactions, window_start
    WHERE user_id = p_user_id
      AND amount  < 0
      AND COALESCE(user_category, '') NOT IN ('transfers')
      AND COALESCE(income_type,   '') NOT IN ('transfer', 'credit_loan')
      AND UPPER(COALESCE(category, '')) != 'TRANSFER'
      AND is_cross_account_duplicate = FALSE
      AND timestamp >= window_start.cutoff
  ),
  recurring AS (
    SELECT
      provider,
      ROUND(AVG(txn_amount)::numeric, 2)              AS avg_amount,
      (MODE() WITHIN GROUP (ORDER BY day_of_month))::int AS billing_day,
      COUNT(*)                                         AS occ_count,
      COUNT(DISTINCT txn_month)                        AS months_active
    FROM debit_txns
    WHERE provider IS NOT NULL AND LENGTH(TRIM(provider)) > 1
    GROUP BY provider
    HAVING COUNT(*) >= 2 AND COUNT(DISTINCT txn_month) >= 2
  ),
  bill_keys AS (
    SELECT *,
      LOWER(REGEXP_REPLACE(provider, '[^a-zA-Z0-9]', '', 'g')) AS bkey
    FROM recurring
  )
  SELECT
    b.provider                                              AS provider_name,
    b.avg_amount                                           AS expected_amount,
    MAKE_DATE(p_year, p_month, LEAST(b.billing_day, 28))  AS expected_date,
    b.billing_day                                          AS billing_day,
    b.occ_count                                            AS occurrence_count,
    COALESCE(s.status = 'active', FALSE)                   AS is_subscription,
    s.id                                                   AS subscription_id,
    b.bkey                                                 AS bill_key
  FROM bill_keys b
  LEFT JOIN subscriptions s ON (
    s.user_id        = p_user_id
    AND s.status     = 'active'
    AND s.dismissed_at IS NULL
    AND (
      LOWER(s.provider_name) LIKE '%' || LOWER(SUBSTRING(b.provider FOR 6)) || '%'
      OR LOWER(b.provider)   LIKE '%' || LOWER(SUBSTRING(s.provider_name FOR 6)) || '%'
    )
  )
  WHERE b.bkey NOT IN (SELECT bill_key FROM dismissed)
  ORDER BY b.billing_day;
$$;
GRANT EXECUTE ON FUNCTION get_expected_bills(uuid, int, int) TO authenticated, service_role;


-- ─── 5. Backfill: run dedup for all users with multiple accounts ──────────────
DO $$
DECLARE
  uid        uuid;
  dup_count  integer;
BEGIN
  FOR uid IN (
    SELECT DISTINCT user_id
    FROM bank_transactions
    GROUP BY user_id
    HAVING COUNT(DISTINCT account_id) > 1
  )
  LOOP
    BEGIN
      SELECT detect_cross_account_duplicates(uid) INTO dup_count;
      RAISE NOTICE 'User %: marked % cross-account duplicates', uid, dup_count;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Dedup failed for user %: %', uid, SQLERRM;
    END;
  END LOOP;
END $$;
