-- Fix income categorisation: internal transfers and credit/loan disbursements
-- should not appear in income totals.
--
-- Root causes fixed:
-- 1. income_type constraint was missing 'credit_loan', 'loan_repayment', 'gift'
-- 2. Internal transfers with bank descriptions containing 'parent', 'rent savings', etc.
--    were being mis-tagged as 'rental' due to an overly broad text match
-- 3. FlexiPay and credit facility credits were not excluded from income RPCs
-- 4. RPC functions did not filter out transfers/credit_loans from income totals

-- ─── 1. Update income_type constraint to include all valid types ──────────────
ALTER TABLE bank_transactions DROP CONSTRAINT IF EXISTS bank_transactions_income_type_check;
ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_income_type_check
  CHECK (income_type IN (
    'salary', 'freelance', 'benefits', 'rental', 'investment',
    'refund', 'transfer', 'loan_repayment', 'gift', 'credit_loan', 'other'
  ));

-- ─── 2. Retroactively fix credit/loan disbursements mis-tagged as income ──────
UPDATE bank_transactions
SET income_type = 'credit_loan',
    user_category = 'transfers'
WHERE amount > 0
  AND (
    LOWER(description) LIKE '%flexipay%'
    OR LOWER(description) LIKE '%credit facility%'
    OR LOWER(description) LIKE '%loan advance%'
    OR LOWER(description) LIKE '%loan drawdown%'
    OR LOWER(description) LIKE '%overdraft advance%'
  )
  AND income_type NOT IN ('transfer', 'credit_loan');

-- ─── 3. Retroactively fix internal transfers mis-tagged as rental income ───────
-- Target: positive transactions with income_type = 'rental' that have
-- transfer-pattern descriptions (e.g. 'TFR', 'from savings', 'TRANSFER FROM')
UPDATE bank_transactions
SET income_type = 'transfer',
    user_category = 'transfers'
WHERE amount > 0
  AND income_type = 'rental'
  AND (
    LOWER(description) LIKE '%tfr%'
    OR LOWER(description) LIKE '%trf%'
    OR LOWER(description) LIKE 'ft %'
    OR LOWER(description) LIKE '% ft %'
    OR LOWER(description) LIKE '%transfer%'
    OR LOWER(description) LIKE '%from a/c%'
    OR LOWER(description) LIKE '%to a/c%'
    OR LOWER(description) LIKE '%from savings%'
    OR LOWER(description) LIKE '%from current%'
    OR LOWER(description) LIKE '%savings account%'
    OR LOWER(description) LIKE '%isa transfer%'
    OR LOWER(description) LIKE '%via mobile%'
    OR LOWER(description) LIKE '%fps %'
  );

-- ─── 4. Replace RPC functions with versions that exclude transfers/credit_loans ─
-- DROP first to allow return-type changes (error 42P13 if omitted)
DROP FUNCTION IF EXISTS get_monthly_income(uuid, int, int);
DROP FUNCTION IF EXISTS get_monthly_income_total(uuid, int, int);
DROP FUNCTION IF EXISTS get_monthly_spending(uuid, int, int);
DROP FUNCTION IF EXISTS get_monthly_spending_total(uuid, int, int);

-- Monthly income total (excludes transfers and credit/loan disbursements)
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
    AND COALESCE(user_category, '') NOT IN ('transfers')
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
$$;

GRANT EXECUTE ON FUNCTION get_monthly_income_total(uuid, int, int) TO authenticated, service_role;

-- Monthly income by type (for breakdown chart)
CREATE OR REPLACE FUNCTION get_monthly_income(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(source text, source_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(income_type, 'other') AS source,
    SUM(amount) AS source_total
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount > 0
    AND COALESCE(user_category, '') NOT IN ('transfers')
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
  GROUP BY income_type
$$;

GRANT EXECUTE ON FUNCTION get_monthly_income(uuid, int, int) TO authenticated, service_role;

-- Monthly spending total (excludes transfers and income credits)
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
    AND COALESCE(user_category, '') NOT IN ('transfers', 'income')
$$;

GRANT EXECUTE ON FUNCTION get_monthly_spending_total(uuid, int, int) TO authenticated, service_role;

-- Monthly spending by category
CREATE OR REPLACE FUNCTION get_monthly_spending(p_user_id uuid, p_year int, p_month int)
RETURNS TABLE(category text, category_total numeric, transaction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(user_category, category, 'other') AS category,
    SUM(ABS(amount)) AS category_total,
    COUNT(*) AS transaction_count
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND COALESCE(user_category, '') NOT IN ('transfers', 'income')
  GROUP BY COALESCE(user_category, category, 'other')
$$;

GRANT EXECUTE ON FUNCTION get_monthly_spending(uuid, int, int) TO authenticated, service_role;
