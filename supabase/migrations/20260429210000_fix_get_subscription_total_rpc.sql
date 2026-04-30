-- ============================================================
-- Fix get_subscription_total RPC — 2026-04-29 (TKT-0018)
--
-- Problem:
-- The dashboard overview and subscriptions page were simultaneously
-- showing two different subscription counts (e.g. 32 vs 36) and two
-- different monthly totals (e.g. £4,014.36 vs £3,557.47) for the
-- same user.
--
-- Root causes:
-- 1. The subscriptions page heading used rpcTotals.subscriptions_count
--    (raw DB row count, no deduplication) while the KPI grid used
--    countActiveSubscriptions() (log-band dedup + finance exclusion).
-- 2. The prior get_subscription_total RPC did NOT apply the same
--    deduplication as GET /api/subscriptions or countActiveSubscriptions().
--    Duplicate rows for the same provider (e.g. Creation Financial stored
--    under multiple categories) were summed multiple times, inflating
--    subscriptions_monthly.
-- 3. The prior RPC used provider-name keyword matching as the PRIMARY
--    bucketing signal, so recently recategorised items (user set
--    category = 'mortgage' on Paratus AMC Ltd and LendInvest BTL Mortgage)
--    were still landing in the 'subscriptions' bucket because the RPC
--    did not check the category column first.
--
-- Fix:
-- Replace get_subscription_total with a version that:
--   a. Applies log-band deduplication consistent with countActiveSubscriptions()
--      and GET /api/subscriptions: keeps one row per
--      (normalised_provider_name, amount_band) preferring earliest created_at.
--   b. Uses the category column as the PRIMARY bucketing signal. Provider-name
--      keyword matching is a FALLBACK only when category IS NULL or empty.
--      After a user explicitly recategorises an item, the category column wins.
--   c. Returns mutually-exclusive buckets so each row is counted exactly once.
--   d. Excludes credit_card repayments from monthly_total (they double-count
--      the underlying card spend already tracked as individual transactions).
--
-- Safety: CREATE OR REPLACE only — no DROP TABLE / no ALTER TABLE DROP.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_subscription_total(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH all_active AS (
    -- Fetch all active, non-dismissed subscription rows for this user.
    SELECT
      id,
      provider_name,
      COALESCE(amount, 0)::numeric        AS amount,
      COALESCE(billing_cycle, 'monthly')  AS billing_cycle,
      COALESCE(category, '')              AS category,
      created_at
    FROM subscriptions
    WHERE user_id      = p_user_id
      AND status       = 'active'
      AND dismissed_at IS NULL
  ),
  deduped AS (
    -- Apply the same log-band deduplication used by GET /api/subscriptions
    -- and countActiveSubscriptions() in src/lib/subscriptions/active-count.ts.
    --
    -- Dedup key: (normalised_provider_name, amount_band)
    --   normalised_provider_name = lowercase, non-alphanumeric chars removed
    --   amount_band              = round(ln(|amount|) / ln(1.1)) — matches the
    --                              JS amountBand() helper exactly.
    --
    -- The earliest created_at row wins — same preference as the API route.
    SELECT
      id,
      provider_name,
      amount,
      billing_cycle,
      category,
      ROW_NUMBER() OVER (
        PARTITION BY
          -- Normalise name: lowercase, strip non-alphanumeric characters.
          -- Approximates cleanMerchantName().toLowerCase() without requiring
          -- the JS helper in SQL.
          LOWER(REGEXP_REPLACE(TRIM(COALESCE(provider_name, '')), '[^a-zA-Z0-9]', '', 'g')),
          -- Amount band: round(ln(|amount|) / ln(1.1)) — matches JS amountBand()
          CASE
            WHEN ABS(amount) < 0.01 THEN 0
            ELSE ROUND(LN(ABS(amount)) / LN(1.1))::integer
          END
        ORDER BY created_at ASC
      ) AS rn
    FROM all_active
  ),
  canonical AS (
    -- Keep one row per (name, band) and compute its monthly equivalent.
    SELECT
      provider_name,
      amount,
      billing_cycle,
      category,
      -- Normalise billing amount to a monthly figure.
      CASE billing_cycle
        WHEN 'yearly'    THEN amount / 12.0
        WHEN 'quarterly' THEN amount / 3.0
        WHEN 'one-time'  THEN 0         -- one-off payments excluded from recurring total
        ELSE amount                     -- monthly (default)
      END AS monthly_amount,

      -- ── Bucket assignment ──────────────────────────────────────────────
      -- The category column is the PRIMARY signal — it reflects the user's
      -- explicit intent (e.g. after recategorising Paratus AMC to 'mortgage'
      -- or LendInvest to 'mortgage'). Name-based keyword matching is a
      -- FALLBACK for rows where category has not been set (empty string).
      -- Each row is assigned to exactly one bucket.
      CASE
        -- ── Mortgage bucket ────────────────────────────────────────────
        WHEN LOWER(category) = 'mortgage'
          OR (
            category = '' AND (
                 LOWER(COALESCE(provider_name, '')) LIKE '%mortgage%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%lendinvest%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%skipton%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%paratus%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%nationwide%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%halifax mortg%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%natwest mortg%'
            )
          )
        THEN 'mortgage'

        -- ── Loan / car finance bucket ───────────────────────────────────
        WHEN LOWER(category) IN ('loan', 'car_finance')
          OR (
            category = '' AND (
                 LOWER(COALESCE(provider_name, '')) LIKE '% loan%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%novuna%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%ca auto%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%auto finance%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%funding circle%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%zopa%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '% finance%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%santander loan%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%natwest loan%'
            )
          )
        THEN 'loan'

        -- ── Council tax bucket ──────────────────────────────────────────
        WHEN LOWER(category) = 'council_tax'
          OR (
            category = '' AND (
                 LOWER(COALESCE(provider_name, '')) LIKE '%council%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%testvalley%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%winchester%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%lbh%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%l.b.hounslow%'
            )
          )
        THEN 'council_tax'

        -- ── Credit card repayment bucket ────────────────────────────────
        -- Excluded from monthly_total (these are repayments of card spend
        -- already captured as individual transactions — counting them would
        -- double-count the underlying spending).
        WHEN LOWER(category) = 'credit_card'
          OR (
            category = '' AND (
                 LOWER(COALESCE(provider_name, '')) LIKE '%barclaycard%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%mbna%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%credit card%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%american express%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%amex%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%securepay%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%halifax credit%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%hsbc bank visa%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%virgin money%'
              OR LOWER(COALESCE(provider_name, '')) LIKE '%capital one%'
            )
          )
        THEN 'credit_card'

        -- ── Subscription (default) ──────────────────────────────────────
        -- Everything that isn't mortgage / loan / council_tax / credit_card.
        ELSE 'subscription'
      END AS bucket

    FROM deduped
    WHERE rn = 1   -- one canonical row per (name, amount_band)
  )
  SELECT jsonb_build_object(
    -- Subscriptions & Bills — cancelable recurring costs
    'subscriptions_monthly', COALESCE(
      SUM(monthly_amount) FILTER (WHERE bucket = 'subscription'), 0
    )::numeric,
    'subscriptions_count',   COUNT(*) FILTER (WHERE bucket = 'subscription'),

    -- Mortgages
    'mortgages_monthly', COALESCE(
      SUM(monthly_amount) FILTER (WHERE bucket = 'mortgage'), 0
    )::numeric,
    'mortgages_count',   COUNT(*) FILTER (WHERE bucket = 'mortgage'),

    -- Loans / car finance
    'loans_monthly', COALESCE(
      SUM(monthly_amount) FILTER (WHERE bucket = 'loan'), 0
    )::numeric,
    'loans_count',   COUNT(*) FILTER (WHERE bucket = 'loan'),

    -- Council tax
    'council_tax_monthly', COALESCE(
      SUM(monthly_amount) FILTER (WHERE bucket = 'council_tax'), 0
    )::numeric,
    'council_tax_count',   COUNT(*) FILTER (WHERE bucket = 'council_tax'),

    -- Grand total of all financial commitments EXCLUDING credit card
    -- repayments (which double-count underlying card spend).
    'monthly_total', COALESCE(
      SUM(monthly_amount) FILTER (WHERE bucket != 'credit_card'), 0
    )::numeric
  )
  INTO v_result
  FROM canonical;

  RETURN COALESCE(v_result, '{"subscriptions_monthly":0,"subscriptions_count":0,"mortgages_monthly":0,"mortgages_count":0,"loans_monthly":0,"loans_count":0,"council_tax_monthly":0,"council_tax_count":0,"monthly_total":0}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_total(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_subscription_total(uuid) IS
  'Returns per-bucket monthly totals + counts for a user''s active, non-dismissed '
  'subscriptions. Applies log-band deduplication consistent with '
  'countActiveSubscriptions() (src/lib/subscriptions/active-count.ts) and '
  'GET /api/subscriptions — one canonical row per (normalised_name, amount_band), '
  'earliest created_at wins. Uses category column as primary bucketing signal; '
  'provider-name keywords are fallback only (catches uncategorised rows). '
  'Buckets: subscription | mortgage | loan | council_tax | credit_card. '
  'monthly_total = sum of all buckets EXCEPT credit_card. '
  'Fixed 2026-04-29 (TKT-0018): prior version lacked dedup and used name-first '
  'bucketing, causing double-counts and post-recategorisation stale totals.';
