-- ============================================================
-- Money Hub split-spending RPCs (2026-04-27)
--
-- Replaces a single £33k headline figure with three audit-able
-- numbers driven by category_bucket():
--   - Fixed costs (debt servicing + obligations)
--   - Variable costs (groceries / fuel / etc.)
--   - Discretionary (lifestyle + catch-all)
--
-- Internal transfers and income are NEVER counted.
--
-- The legacy `get_monthly_spending_total` keeps working — it now
-- delegates to the new `get_monthly_spending_breakdown` and returns
-- the sum of all three spending buckets, so existing callers don't
-- break while the frontend migrates.
-- ============================================================

-- Returns one row with all three bucket totals + the grand spending sum.
CREATE OR REPLACE FUNCTION public.get_monthly_spending_breakdown(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS TABLE (
  fixed_cost_total    numeric,
  variable_cost_total numeric,
  discretionary_total numeric,
  spending_total      numeric,
  internal_transfer_total numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  WITH classified AS (
    SELECT
      bt.amount,
      public.category_bucket(COALESCE(NULLIF(bt.user_category, ''), bt.category)) AS bucket
    FROM bank_transactions bt
    WHERE bt.user_id = p_user_id
      AND bt.timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
      AND bt.timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
      AND bt.amount < 0
  )
  SELECT
    COALESCE(SUM(ABS(amount)) FILTER (WHERE bucket = 'fixed_cost'), 0)::numeric    AS fixed_cost_total,
    COALESCE(SUM(ABS(amount)) FILTER (WHERE bucket = 'variable_cost'), 0)::numeric AS variable_cost_total,
    COALESCE(SUM(ABS(amount)) FILTER (WHERE bucket = 'discretionary'), 0)::numeric AS discretionary_total,
    COALESCE(SUM(ABS(amount)) FILTER (WHERE bucket IN ('fixed_cost','variable_cost','discretionary')), 0)::numeric AS spending_total,
    COALESCE(SUM(ABS(amount)) FILTER (WHERE bucket = 'internal_transfer'), 0)::numeric AS internal_transfer_total
  FROM classified;
$$;

COMMENT ON FUNCTION public.get_monthly_spending_breakdown(uuid, integer, integer) IS
  'Splits monthly spending into fixed_cost / variable_cost / discretionary buckets via category_bucket(). spending_total = sum of all three. Internal transfers reported separately for context.';

-- Bucket-specific totals for callers that only want one number.
CREATE OR REPLACE FUNCTION public.get_monthly_fixed_costs_total(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT fixed_cost_total FROM public.get_monthly_spending_breakdown(p_user_id, p_year, p_month);
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_discretionary_total(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT discretionary_total FROM public.get_monthly_spending_breakdown(p_user_id, p_year, p_month);
$$;

-- Re-point the legacy "all spending" RPC at the new breakdown so every
-- consumer that calls it picks up the canonical exclusion logic without
-- a code change. spending_total = fixed + variable + discretionary, with
-- internal_transfer + income excluded by category_bucket().
CREATE OR REPLACE FUNCTION public.get_monthly_spending_total(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT spending_total FROM public.get_monthly_spending_breakdown(p_user_id, p_year, p_month);
$$;

COMMENT ON FUNCTION public.get_monthly_spending_total(uuid, integer, integer) IS
  'Legacy one-figure spending total. Now delegates to get_monthly_spending_breakdown so the canonical category_bucket() exclusion logic is the only source of truth.';

-- Per-category totals — used by the Money Hub category breakdown widget.
-- Now bucket-aware so the UI can group categories by their bucket and
-- show subtotals per bucket without re-deriving the classification client-side.
CREATE OR REPLACE FUNCTION public.get_monthly_spending(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS TABLE (
  category text,
  bucket text,
  category_total numeric,
  transaction_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(NULLIF(bt.user_category, ''), bt.category, 'other') AS category,
    public.category_bucket(COALESCE(NULLIF(bt.user_category, ''), bt.category)) AS bucket,
    SUM(ABS(bt.amount))::numeric AS category_total,
    COUNT(*)::bigint AS transaction_count
  FROM bank_transactions bt
  WHERE bt.user_id = p_user_id
    AND bt.timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND bt.timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND bt.amount < 0
    AND public.category_bucket(COALESCE(NULLIF(bt.user_category, ''), bt.category))
        IN ('fixed_cost', 'variable_cost', 'discretionary')
  GROUP BY 1, 2
  ORDER BY 3 DESC;
$$;

COMMENT ON FUNCTION public.get_monthly_spending(uuid, integer, integer) IS
  'Per-category spending breakdown with the canonical bucket attached. Excludes internal_transfer + income.';
