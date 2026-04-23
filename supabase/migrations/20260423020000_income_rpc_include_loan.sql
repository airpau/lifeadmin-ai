-- Rewrite get_monthly_income + get_monthly_income_total so loan drawdowns
-- (income_type='credit_loan' / 'loan_repayment') count towards historical
-- monthly income totals. They're collapsed client-side into a "Loan Credit"
-- bucket (src/lib/income-normalise.ts LOAN_INCOME_KEYS) — the RPC just
-- needs to stop filtering them out.
--
-- Why: real user (paul@airproperty.co.uk) had a £12,000 Iwoca loan
-- in March. The Money Hub monthly card was silently £12k short because
-- both RPCs excluded income_type='credit_loan' AND excluded any row
-- whose description matched a "loan advance / credit facility / flexipay"
-- regex. PR #203 fixed the client-side normaliser; this migration brings
-- the DB into lockstep.
--
-- Safe to re-run: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_monthly_income_total(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(SUM(amount), 0)
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount > 0
    AND UPPER(COALESCE(category, '')) != 'TRANSFER'
    -- Keep only 'transfer' excluded. credit_loan + loan_repayment count
    -- as "Loan Credit" in the UI, so they must contribute to the total.
    AND COALESCE(income_type, '') NOT IN ('transfer')
    AND (
      user_category = 'income'
      OR user_category IN ('salary', 'freelance', 'rental', 'property_management', 'benefits', 'pension', 'dividends', 'investment', 'refund', 'gift')
      OR (income_type IS NOT NULL AND income_type NOT IN ('', 'transfer'))
      OR UPPER(COALESCE(category, '')) IN ('CREDIT', 'INTEREST')
      OR LOWER(COALESCE(merchant_name, '') || ' ' || COALESCE(description, '')) ~* '(salary|wages|payroll|net pay|director|freelance|invoice|consulting|hmrc|tax credit|dwp|universal credit|child benefit|pension|rent received|rental income|tenant payment|letting income|airbnb|booking\.com|vrbo|dividend|interest earned|interest payment|investment return|loan advance|loan drawdown|credit facility|flexipay)'
    )
    -- Internal transfers still excluded — these are money moving between
    -- user's own accounts, not real income.
    AND NOT (
      LOWER(COALESCE(description, '')) ~* '(from a/c|to a/c|via mobile xfer|personal transfer|internal transfer|between accounts|isa transfer|savings transfer|from savings|account transfer|^tfr |^trf |^fps )'
    );
$function$;

DROP FUNCTION IF EXISTS public.get_monthly_income(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_monthly_income(
  p_user_id uuid, p_year integer, p_month integer
)
RETURNS TABLE(source text, source_total numeric)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    COALESCE(
      CASE
        -- Collapse loan drawdowns + repayments into a single "Loan Credit"
        -- bucket to match the client-side LOAN_INCOME_KEYS collapse.
        WHEN income_type IN ('credit_loan', 'loan_repayment', 'loan_credit', 'loan_drawdown') THEN 'loan_credit'
        WHEN user_category IN ('salary', 'freelance', 'rental', 'property_management', 'benefits', 'pension', 'dividends', 'investment', 'refund', 'gift') THEN user_category
        WHEN income_type IS NOT NULL AND income_type NOT IN ('', 'transfer') THEN income_type
        ELSE 'other'
      END,
      'other'
    ) AS source,
    SUM(amount) AS source_total
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount > 0
    AND UPPER(COALESCE(bank_transactions.category, '')) != 'TRANSFER'
    AND COALESCE(income_type, '') NOT IN ('transfer')
    AND (
      user_category = 'income'
      OR user_category IN ('salary', 'freelance', 'rental', 'property_management', 'benefits', 'pension', 'dividends', 'investment', 'refund', 'gift')
      OR (income_type IS NOT NULL AND income_type NOT IN ('', 'transfer'))
      OR UPPER(COALESCE(bank_transactions.category, '')) IN ('CREDIT', 'INTEREST')
      OR LOWER(COALESCE(merchant_name, '') || ' ' || COALESCE(description, '')) ~* '(salary|wages|payroll|net pay|director|freelance|invoice|consulting|hmrc|tax credit|dwp|universal credit|child benefit|pension|rent received|rental income|tenant payment|letting income|airbnb|booking\.com|vrbo|dividend|interest earned|interest payment|investment return|loan advance|loan drawdown|credit facility|flexipay)'
    )
    AND NOT (
      LOWER(COALESCE(description, '')) ~* '(from a/c|to a/c|via mobile xfer|personal transfer|internal transfer|between accounts|isa transfer|savings transfer|from savings|account transfer|^tfr |^trf |^fps )'
    )
  GROUP BY 1;
$function$;
