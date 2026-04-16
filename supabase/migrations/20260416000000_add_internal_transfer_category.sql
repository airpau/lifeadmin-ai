-- Migration: add_internal_transfer_category
-- Adds 'internal_transfer' as a first-class category that is excluded from
-- BOTH income totals AND spending totals (same treatment as 'transfers').
-- This lets users mark transfers between their own accounts (e.g. personal ↔
-- business) so those movements don't inflate either side of the P&L view.

-- ─── get_monthly_income_total ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_monthly_income_total(p_user_id uuid, p_year int, p_month int)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM bank_transactions
  WHERE user_id   = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount    > 0
    AND COALESCE(user_category, '') NOT IN ('transfers', 'internal_transfer')
    AND COALESCE(income_type,   '') NOT IN ('transfer', 'credit_loan')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income_total(uuid, int, int) TO authenticated, service_role;

-- ─── get_monthly_income (breakdown by source) ─────────────────────────────
CREATE OR REPLACE FUNCTION get_monthly_income(p_user_id uuid, p_year int, p_month int)
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
    AND COALESCE(user_category, '') NOT IN ('transfers', 'internal_transfer')
    AND COALESCE(income_type,   '') NOT IN ('transfer', 'credit_loan')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
  GROUP BY income_type
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income(uuid, int, int) TO authenticated, service_role;

-- ─── get_monthly_spending_total ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_monthly_spending_total(p_user_id uuid, p_year int, p_month int)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(ABS(amount)), 0)
  FROM bank_transactions
  WHERE user_id   = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp <  (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount    < 0
    AND COALESCE(user_category, '') NOT IN ('transfers', 'income', 'internal_transfer')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending_total(uuid, int, int) TO authenticated, service_role;

-- ─── get_monthly_spending (breakdown by category) ─────────────────────────
CREATE OR REPLACE FUNCTION get_monthly_spending(p_user_id uuid, p_year int, p_month int)
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
    AND COALESCE(user_category, '') NOT IN ('transfers', 'income', 'internal_transfer')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
  GROUP BY COALESCE(user_category, 'other')
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending(uuid, int, int) TO authenticated, service_role;
