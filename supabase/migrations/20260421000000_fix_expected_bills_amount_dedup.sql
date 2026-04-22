-- ============================================================
-- Fix get_expected_bills: amount deduplication + TEXT/DATE type safety
-- 2026-04-21
--
-- Two issues fixed:
--
-- 1. Amount deduplication: a merchant with two transactions in the same
--    month (e.g. a retry or partial payment) was counted twice toward the
--    AVG, inflating the expected_amount. Added a dedup CTE that keeps
--    only the largest debit per provider per month before aggregation.
--
-- 2. TEXT vs DATE type mismatch: the dismissed CTE must compare
--    bill_month (TEXT, format 'YYYY-MM-DD') against
--    TO_CHAR(MAKE_DATE(p_year, p_month, 1), 'YYYY-MM-DD') — both TEXT.
--    Comparing directly against MAKE_DATE() (a DATE) causes a type
--    mismatch and silently returns no dismissed bills, so previously
--    dismissed bills would reappear each month.
-- ============================================================

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
  -- bill_month is TEXT ('YYYY-MM-DD'). Use TO_CHAR so both sides are TEXT —
  -- comparing against MAKE_DATE directly would produce a TEXT = DATE mismatch.
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
  -- Deduplicate: keep the largest transaction per provider per month.
  -- Without this, two charges from the same merchant in one month (e.g. a
  -- retry or a top-up) both contribute to AVG, inflating expected_amount.
  deduped_txns AS (
    SELECT DISTINCT ON (provider, txn_month)
      provider, txn_amount, day_of_month, txn_month
    FROM debit_txns
    WHERE provider IS NOT NULL AND LENGTH(TRIM(provider)) > 1
    ORDER BY provider, txn_month, txn_amount DESC
  ),
  recurring AS (
    SELECT
      provider,
      ROUND(AVG(txn_amount)::numeric, 2)              AS avg_amount,
      (MODE() WITHIN GROUP (ORDER BY day_of_month))::int AS billing_day,
      COUNT(*)                                         AS occ_count,
      COUNT(DISTINCT txn_month)                        AS months_active
    FROM deduped_txns
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
