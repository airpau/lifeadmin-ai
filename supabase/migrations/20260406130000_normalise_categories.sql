-- Normalise existing data to lowercase
UPDATE bank_transactions SET user_category = LOWER(TRIM(user_category)) WHERE user_category IS NOT NULL AND user_category != LOWER(TRIM(user_category));
UPDATE bank_transactions SET income_type = LOWER(TRIM(income_type)) WHERE income_type IS NOT NULL AND income_type != LOWER(TRIM(income_type));

-- Fix category aliases
UPDATE bank_transactions SET user_category = 'energy' WHERE LOWER(user_category) = 'utility';
UPDATE bank_transactions SET user_category = 'loans' WHERE LOWER(user_category) = 'loan';
UPDATE bank_transactions SET user_category = 'fees' WHERE LOWER(user_category) = 'fee';

-- CRITICAL: Update RPC functions to exclude transfers by income_type and normalize case
CREATE OR REPLACE FUNCTION get_monthly_spending(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(category text, category_total numeric, transaction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    LOWER(TRIM(COALESCE(user_category, category, 'other'))) AS category,
    SUM(ABS(amount)) AS category_total,
    COUNT(*) AS transaction_count
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND LOWER(COALESCE(user_category, '')) NOT IN ('transfers', 'income')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
  GROUP BY LOWER(TRIM(COALESCE(user_category, category, 'other')))
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
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND LOWER(COALESCE(user_category, '')) NOT IN ('transfers', 'income')
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
$$;
GRANT EXECUTE ON FUNCTION get_monthly_spending_total(uuid, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION get_monthly_income(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(income_type text, income_total numeric, transaction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    LOWER(TRIM(COALESCE(income_type, 'other'))) AS income_type,
    SUM(amount) AS income_total,
    COUNT(*) AS transaction_count
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount > 0
    AND user_category = 'income'
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
  GROUP BY LOWER(TRIM(COALESCE(income_type, 'other')))
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income(uuid, int, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION get_monthly_income_total(p_user_id uuid, p_year int, p_month int)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount > 0
    AND user_category = 'income'
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
$$;
GRANT EXECUTE ON FUNCTION get_monthly_income_total(uuid, int, int) TO authenticated, service_role;
