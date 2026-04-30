-- ============================================================
-- Fix: get_expected_bills — separate recurring bills by amount band
-- 2026-04-21
--
-- Root cause: the recurring CTE grouped by provider name only, so two
-- genuinely separate payment streams from the same merchant (e.g. two
-- council-tax DDs at £123 and £144) were merged into a single row with
-- a meaningless average amount.
--
-- Fix: group by (provider, amount_band) where amount_band is a
-- logarithmic bucket (base 1.1, ~10% bands).  Amounts within ~5% of
-- each other fall in the same band (handles minor month-to-month
-- variation like £122.94 vs £123.00), while amounts differing by >10%
-- produce distinct bands (£123 and £144 → bands 50 and 52).
--
-- bill_key now includes the amount band so each separate stream has a
-- unique key.  Side-effect: any previously dismissed or manually-marked-
-- paid bill_keys will no longer match (they expire monthly anyway).
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
  dismissed AS (
    SELECT bill_key
    FROM dismissed_expected_bills
    WHERE user_id   = p_user_id
      AND bill_month = MAKE_DATE(p_year, p_month, 1)
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
    -- Group by (provider, amount_band) so that two payment streams from the
    -- same merchant but at meaningfully different amounts produce separate rows.
    -- amount_band = ROUND(LN(txn_amount) / LN(1.1)) gives ~10%-wide buckets:
    --   £111.8–£123.3 → band 50  |  £123.3–£135.6 → band 51  |  £135.6–£149.2 → band 52
    -- So £122.94 and £123.00 land in band 50 (same), while £123 and £144 land
    -- in bands 50 and 52 respectively (distinct).
    SELECT
      provider,
      ROUND(LN(GREATEST(txn_amount, 0.01)) / LN(1.1))::int AS amount_band,
      ROUND(AVG(txn_amount)::numeric, 2)                    AS avg_amount,
      (MODE() WITHIN GROUP (ORDER BY day_of_month))::int    AS billing_day,
      COUNT(*)                                              AS occ_count,
      COUNT(DISTINCT txn_month)                             AS months_active
    FROM debit_txns
    WHERE provider IS NOT NULL AND LENGTH(TRIM(provider)) > 1
    GROUP BY provider, ROUND(LN(GREATEST(txn_amount, 0.01)) / LN(1.1))::int
    HAVING COUNT(*) >= 2 AND COUNT(DISTINCT txn_month) >= 2
  ),
  bill_keys AS (
    SELECT *,
      -- Include amount_band in the key so each distinct payment stream has a
      -- unique, stable identifier.
      LOWER(REGEXP_REPLACE(provider, '[^a-zA-Z0-9]', '', 'g')) || '_' || amount_band::text AS bkey
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
