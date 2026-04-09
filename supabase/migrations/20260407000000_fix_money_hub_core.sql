-- ============================================================
-- Money Hub Core Fix — 2026-04-07
--
-- Root causes addressed:
-- 1. auto_categorise_transactions was called by cron but never defined in
--    migrations → all new transactions stay uncategorised → uncategorised
--    credits inflate income, uncategorised debits inflate spending.
--    Internal transfers counted in BOTH income AND spending (double-count).
-- 2. get_expected_bills was called but never defined → expected bills broken.
-- 3. detect_internal_transfers not defined → cross-account transfers double-counted.
-- 4. Income/spending RPCs did not exclude raw category='TRANSFER' transactions
--    (for pre-categorisation rows that still have the bank-native category set).
-- 5. No dismissed_expected_bills table → bill dismissals lost on reload.
-- ============================================================


-- ─── 0. dismissed_expected_bills table ────────────────────────────────────────
-- Stores per-user, per-month bill dismissals so they persist across page reloads.
CREATE TABLE IF NOT EXISTS dismissed_expected_bills (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bill_key   TEXT NOT NULL,
  bill_month TEXT NOT NULL,  -- format: 'YYYY-MM-01'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dismissed_expected_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bill dismissals"
  ON dismissed_expected_bills FOR ALL USING (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dismissed_bills_unique
  ON dismissed_expected_bills(user_id, bill_key, bill_month);
CREATE INDEX IF NOT EXISTS idx_dismissed_bills_user_month
  ON dismissed_expected_bills(user_id, bill_month);


-- ─── 1. dismiss_expected_bill RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION dismiss_expected_bill(
  p_user_id uuid, p_bill_key text, p_year int, p_month int
)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO dismissed_expected_bills(user_id, bill_key, bill_month)
  VALUES (
    p_user_id,
    p_bill_key,
    TO_CHAR(MAKE_DATE(p_year, p_month, 1), 'YYYY-MM-DD')
  )
  ON CONFLICT (user_id, bill_key, bill_month) DO NOTHING;
$$;
GRANT EXECUTE ON FUNCTION dismiss_expected_bill(uuid, text, int, int) TO authenticated, service_role;


-- ─── 2. restore_expected_bill RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restore_expected_bill(
  p_user_id uuid, p_bill_key text, p_year int, p_month int
)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM dismissed_expected_bills
  WHERE user_id  = p_user_id
    AND bill_key = p_bill_key
    AND bill_month = TO_CHAR(MAKE_DATE(p_year, p_month, 1), 'YYYY-MM-DD');
$$;
GRANT EXECUTE ON FUNCTION restore_expected_bill(uuid, text, int, int) TO authenticated, service_role;


-- ─── 3. auto_categorise_transactions ──────────────────────────────────────────
-- Categorises every uncategorised transaction for a user using description
-- heuristics.  Called after every bank sync (cron + manual).
-- Rules (in priority order):
--   1. User-defined merchant-pattern overrides (money_hub_category_overrides)
--   2. Description-based transfer detection (both credits and debits)
--   3. Credit/loan disbursement detection
--   4. Income-type detection for credits
--   5. Mark remaining credits as 'income'
--   6. Mark remaining debits as 'other'
--
-- SAFETY: only modifies rows where user_category IS NULL.
--         Never touches rows protected by a transaction-specific user override.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfers integer := 0;
  v_income    integer := 0;
  v_spending  integer := 0;
BEGIN

  -- Phase 1: user-defined merchant-pattern overrides
  UPDATE bank_transactions bt
  SET user_category = o.user_category
  FROM money_hub_category_overrides o
  WHERE o.user_id            = p_user_id
    AND bt.user_id           = p_user_id
    AND bt.user_category     IS NULL
    AND o.transaction_id     IS NULL
    AND o.merchant_pattern  != 'txn_specific'
    AND (
      LOWER(COALESCE(bt.merchant_name, '')) LIKE '%' || LOWER(o.merchant_pattern) || '%'
      OR LOWER(COALESCE(bt.description, '')) LIKE '%' || LOWER(o.merchant_pattern) || '%'
    );

  -- Phase 2: description-based transfer detection (debits + credits)
  -- Must run BEFORE income/spending classification so transfers are excluded.
  UPDATE bank_transactions
  SET user_category = 'transfers',
      income_type   = CASE WHEN amount > 0 THEN 'transfer' ELSE income_type END
  WHERE user_id        = p_user_id
    AND user_category  IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND (
         LOWER(COALESCE(description,'')) LIKE '%to a/c%'
      OR LOWER(COALESCE(description,'')) LIKE '%from a/c%'
      OR LOWER(COALESCE(description,'')) LIKE '%personal transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%via mobile xfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%via mobile-pymt%'
      OR LOWER(COALESCE(description,'')) LIKE '%via online-pymt%'
      OR LOWER(COALESCE(description,'')) LIKE '%transfer to%'
      OR LOWER(COALESCE(description,'')) LIKE '%transfer from%'
      OR LOWER(COALESCE(description,'')) LIKE '%from savings%'
      OR LOWER(COALESCE(description,'')) LIKE '%from current account%'
      OR LOWER(COALESCE(description,'')) LIKE '%isa transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%savings transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%account transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%barclaycard%'
      OR LOWER(COALESCE(description,'')) LIKE '%securepay.bos%'
      OR LOWER(COALESCE(description,'')) LIKE '% tfr %'
      OR LOWER(COALESCE(description,'')) LIKE '% trf %'
      OR LOWER(COALESCE(description,'')) ~ '^\s*(tfr|trf)\s+'
    );
  GET DIAGNOSTICS v_transfers = ROW_COUNT;

  -- Phase 3: credit/loan disbursements — not income, not spending
  UPDATE bank_transactions
  SET user_category = 'transfers',
      income_type   = 'credit_loan'
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL
    AND (
         LOWER(COALESCE(description,'')) LIKE '%flexipay%'
      OR LOWER(COALESCE(description,'')) LIKE '%credit facility%'
      OR LOWER(COALESCE(description,'')) LIKE '%loan advance%'
      OR LOWER(COALESCE(description,'')) LIKE '%loan drawdown%'
      OR LOWER(COALESCE(description,'')) LIKE '%overdraft advance%'
    );

  -- Phase 4: income-type detection for remaining credits
  UPDATE bank_transactions
  SET income_type = CASE
    WHEN LOWER(COALESCE(description,'')) LIKE '%salary%'
      OR LOWER(COALESCE(description,'')) LIKE '%payroll%'
      OR LOWER(COALESCE(description,'')) LIKE '%wages%'
      OR LOWER(COALESCE(description,'')) LIKE '%monthly pay%'
      OR LOWER(COALESCE(description,'')) LIKE '%net pay%'
      OR LOWER(COALESCE(description,'')) LIKE '%director%'
      OR LOWER(COALESCE(description,'')) LIKE '%pay ref%'         THEN 'salary'
    WHEN LOWER(COALESCE(description,'')) LIKE '%hmrc%'
      OR LOWER(COALESCE(description,'')) LIKE '%dwp%'
      OR LOWER(COALESCE(description,'')) LIKE '%universal credit%'
      OR LOWER(COALESCE(description,'')) LIKE '%child benefit%'
      OR LOWER(COALESCE(description,'')) LIKE '%tax credit%'
      OR LOWER(COALESCE(description,'')) LIKE '%working tax%'     THEN 'benefits'
    WHEN LOWER(COALESCE(description,'')) LIKE '%dividend%'
      OR LOWER(COALESCE(description,'')) LIKE '%interest earned%'
      OR LOWER(COALESCE(description,'')) LIKE '%interest payment%'
      OR LOWER(COALESCE(description,'')) LIKE '%capital gain%'    THEN 'investment'
    WHEN LOWER(COALESCE(description,'')) LIKE '%invoice%'
      OR LOWER(COALESCE(description,'')) LIKE '%consulting%'
      OR LOWER(COALESCE(description,'')) LIKE '%freelance%'       THEN 'freelance'
    WHEN (
           LOWER(COALESCE(description,'')) LIKE '% rent %'
        OR LOWER(COALESCE(description,'')) LIKE 'rent %'
        OR LOWER(COALESCE(description,'')) LIKE '%rental income%'
        OR LOWER(COALESCE(description,'')) LIKE '%letting income%'
        OR LOWER(COALESCE(description,'')) LIKE '%airbnb%'
        OR LOWER(COALESCE(description,'')) LIKE '%booking.com%'
      )
      AND LOWER(COALESCE(description,'')) NOT LIKE '%transfer%'
      AND LOWER(COALESCE(description,'')) NOT LIKE '%current account%' THEN 'rental'
    WHEN LOWER(COALESCE(description,'')) LIKE '%refund from%'
      OR LOWER(COALESCE(description,'')) LIKE '%your refund%'
      OR LOWER(COALESCE(description,'')) LIKE '%cashback%'        THEN 'refund'
    WHEN amount > 1000                                             THEN 'salary'
    ELSE                                                                'other'
  END
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL  -- not yet tagged as a transfer
    AND income_type  IS NULL;

  -- Phase 5: mark remaining uncategorised credits as 'income'
  UPDATE bank_transactions
  SET user_category = 'income'
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL;
  GET DIAGNOSTICS v_income = ROW_COUNT;

  -- Phase 6: mark remaining uncategorised debits as 'other'
  UPDATE bank_transactions
  SET user_category = 'other'
  WHERE user_id      = p_user_id
    AND amount       < 0
    AND user_category IS NULL;
  GET DIAGNOSTICS v_spending = ROW_COUNT;

  RETURN jsonb_build_object(
    'transfers', v_transfers,
    'income',    v_income,
    'spending',  v_spending,
    'status',    'complete'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION auto_categorise_transactions(uuid) TO authenticated, service_role;


-- ─── 4. detect_internal_transfers ─────────────────────────────────────────────
-- Finds debit/credit pairs across the user's different bank accounts
-- within a 2-hour window with matching absolute amounts.
-- Both sides of the pair are tagged as 'transfers'.
-- Only runs on uncategorised transactions (user_category IS NULL).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION detect_internal_transfers(p_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE bank_transactions AS target
  SET user_category = 'transfers',
      income_type   = CASE WHEN target.amount > 0 THEN 'transfer' ELSE target.income_type END
  WHERE target.user_id      = p_user_id
    AND target.user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = target.id::text
    )
    AND EXISTS (
      SELECT 1
      FROM bank_transactions counterpart
      WHERE counterpart.user_id     = p_user_id
        AND counterpart.account_id != target.account_id
        AND counterpart.amount      = -target.amount
        AND ABS(EXTRACT(EPOCH FROM (counterpart.timestamp - target.timestamp))) <= 7200
        AND counterpart.id         != target.id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION detect_internal_transfers(uuid) TO authenticated, service_role;


-- ─── 5. get_expected_bills ─────────────────────────────────────────────────────
-- Returns recurring debit patterns as expected bills for a given month.
-- Excludes transactions tagged as transfers and bills dismissed by the user.
-- ──────────────────────────────────────────────────────────────────────────────
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


-- ─── 6. Fix income / spending RPCs ────────────────────────────────────────────
-- Add UPPER(COALESCE(category,'')) != 'TRANSFER' guard so transactions that
-- still carry the raw bank-native category value are excluded even when
-- user_category has not been set yet (e.g. before first categorisation run).
-- ──────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_monthly_income(uuid, int, int);
DROP FUNCTION IF EXISTS get_monthly_income_total(uuid, int, int);
DROP FUNCTION IF EXISTS get_monthly_spending(uuid, int, int);
DROP FUNCTION IF EXISTS get_monthly_spending_total(uuid, int, int);

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
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income_total(uuid, int, int) TO authenticated, service_role;

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
  GROUP BY income_type
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income(uuid, int, int) TO authenticated, service_role;

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
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending_total(uuid, int, int) TO authenticated, service_role;

-- Simplified GROUP BY: COALESCE(user_category,'other') — no raw bank category
-- fallback, because bank categories are never user-visible names (PURCHASE etc.)
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
  GROUP BY COALESCE(user_category, 'other')
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending(uuid, int, int) TO authenticated, service_role;


-- ─── 7. Backfill: categorise all existing uncategorised transactions ───────────
-- Runs auto_categorise + detect_internal_transfers for every user that has
-- uncategorised transactions.  Safe to re-run; only touches NULL user_category.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  uid            uuid;
  cat_result     jsonb;
  xfer_count     integer;
BEGIN
  FOR uid IN (
    SELECT DISTINCT user_id
    FROM bank_transactions
    WHERE user_category IS NULL
    ORDER BY user_id
  )
  LOOP
    BEGIN
      SELECT auto_categorise_transactions(uid)   INTO cat_result;
      SELECT detect_internal_transfers(uid)      INTO xfer_count;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Backfill failed for user %: %', uid, SQLERRM;
    END;
  END LOOP;
END $$;
