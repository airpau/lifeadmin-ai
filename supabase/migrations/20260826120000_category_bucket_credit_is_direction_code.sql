-- `credit` is a bank DIRECTION code, not a spending category.
--
-- Why: connection-store.ts writes the bank-side direction ('CREDIT' / 'DEBIT')
-- into bank_transactions.category, because the income RPCs key off it. The
-- normalisation CASE in category_bucket() folded a bare 'credit' in with the
-- credit-card plurals:
--
--     WHEN 'credit cards' THEN 'credit_card'
--     WHEN 'credit-cards' THEN 'credit_card'
--     WHEN 'credit'       THEN 'credit_card'   <-- wrong
--
-- and 'credit_card' buckets as 'fixed_cost', which is_spending_bucket() counts
-- as spending. So an INCOMING payment was classified as an outgoing fixed cost.
-- On this database that is 1,703 rows across 4 users, all of them positive
-- amounts, totalling £2,024,022.98.
--
-- Nothing is visibly wrong today: every current caller filters amount < 0
-- before bucketing (get_monthly_spending_breakdown, get_monthly_spending,
-- price-increase-detector.ts), so the rows never reach the bucket logic. This
-- is a latent trap for the next caller that forgets that filter, and it makes
-- the function disagree with BANK_DIRECTION_CODES in money-hub-classification.ts,
-- which already declares credit / debit / interest to be directions.
--
-- Fix: a bare 'credit' normalises to 'income', so it can never land in a
-- spending bucket regardless of how the caller filters. 'credit cards' and
-- 'credit-cards' are untouched and still bucket as fixed_cost, as does the
-- canonical 'credit_card' that users actually get from the category picker
-- (86 rows on this database — no user has ever stored a bare 'credit').
--
-- 'debit' is deliberately NOT changed. A debit is money out, so leaving it in
-- a spending bucket is the correct answer; only its precision is poor, which
-- PR#579 addressed at the resolution layer.
--
-- Strictly additive: CREATE OR REPLACE of one IMMUTABLE function. No table,
-- column, row or other function is touched. Mirrors the same one-line change
-- in src/lib/category-taxonomy.ts so the TS and SQL buckets stay identical —
-- src/app/api/money-hub/route.ts depends on that parity byte-for-byte.

CREATE OR REPLACE FUNCTION public.category_bucket(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    -- Normalise: lowercase + trim, then alias-collapse plurals/synonyms.
    WHEN p_category IS NULL OR TRIM(p_category) = '' THEN 'discretionary'
    ELSE (
      WITH normalised AS (
        SELECT CASE LOWER(TRIM(p_category))
          -- Plurals → singular canonicals
          WHEN 'mortgages'    THEN 'mortgage'
          WHEN 'loans'        THEN 'loan'
          WHEN 'credit cards' THEN 'credit_card'
          WHEN 'credit-cards' THEN 'credit_card'
          WHEN 'car finance'  THEN 'car_finance'
          WHEN 'car-finance'  THEN 'car_finance'
          WHEN 'fees'         THEN 'fee'
          WHEN 'utilities'    THEN 'utility'
          -- Bank-rail synonyms
          WHEN 'bank_transfer' THEN 'transfers'
          WHEN 'transfer'      THEN 'transfers'
          -- Bank DIRECTION code, not a category: 'credit' is money IN.
          WHEN 'credit'        THEN 'income'
          -- Bill-shape synonyms
          WHEN 'bill_payment'  THEN 'bills'
          WHEN 'billpayment'   THEN 'bills'
          WHEN 'bill-payment'  THEN 'bills'
          -- Food split synonyms
          WHEN 'dining'        THEN 'eating_out'
          WHEN 'restaurants'   THEN 'eating_out'
          WHEN 'supermarkets'  THEN 'groceries'
          WHEN 'supermarket'   THEN 'groceries'
          ELSE LOWER(TRIM(p_category))
        END AS canonical
      )
      SELECT CASE n.canonical
        -- income
        WHEN 'income'        THEN 'income'
        WHEN 'salary'        THEN 'income'
        WHEN 'freelance'     THEN 'income'
        WHEN 'rental'        THEN 'income'
        WHEN 'benefits'      THEN 'income'
        WHEN 'pension'       THEN 'income'
        WHEN 'dividends'     THEN 'income'
        WHEN 'investment'    THEN 'income'
        WHEN 'refund'        THEN 'income'
        WHEN 'gift'          THEN 'income'
        WHEN 'loan_repayment' THEN 'income'
        -- internal transfer (category-level marker)
        WHEN 'transfers'         THEN 'internal_transfer'
        WHEN 'internal_transfer' THEN 'internal_transfer'
        -- fixed_cost
        WHEN 'mortgage'      THEN 'fixed_cost'
        WHEN 'loan'          THEN 'fixed_cost'
        WHEN 'credit_card'   THEN 'fixed_cost'
        WHEN 'car_finance'   THEN 'fixed_cost'
        WHEN 'debt_repayment' THEN 'fixed_cost'
        WHEN 'council_tax'   THEN 'fixed_cost'
        WHEN 'tax'           THEN 'fixed_cost'
        WHEN 'insurance'     THEN 'fixed_cost'
        WHEN 'utility'       THEN 'fixed_cost'
        WHEN 'energy'        THEN 'fixed_cost'
        WHEN 'water'         THEN 'fixed_cost'
        WHEN 'broadband'     THEN 'fixed_cost'
        WHEN 'mobile'        THEN 'fixed_cost'
        WHEN 'fee'           THEN 'fixed_cost'
        WHEN 'parking'       THEN 'fixed_cost'
        WHEN 'rent'          THEN 'fixed_cost'
        -- variable_cost
        WHEN 'groceries'     THEN 'variable_cost'
        WHEN 'fuel'          THEN 'variable_cost'
        WHEN 'eating_out'    THEN 'variable_cost'
        WHEN 'food'          THEN 'variable_cost'
        WHEN 'transport'     THEN 'variable_cost'
        WHEN 'shopping'      THEN 'variable_cost'
        WHEN 'gambling'      THEN 'variable_cost'
        WHEN 'cash'          THEN 'variable_cost'
        -- discretionary (also default for unknown)
        WHEN 'streaming'           THEN 'discretionary'
        WHEN 'software'            THEN 'discretionary'
        WHEN 'fitness'             THEN 'discretionary'
        WHEN 'healthcare'          THEN 'discretionary'
        WHEN 'charity'             THEN 'discretionary'
        WHEN 'education'           THEN 'discretionary'
        WHEN 'pets'                THEN 'discretionary'
        WHEN 'travel'              THEN 'discretionary'
        WHEN 'music'               THEN 'discretionary'
        WHEN 'gaming'              THEN 'discretionary'
        WHEN 'security'            THEN 'discretionary'
        WHEN 'storage'             THEN 'discretionary'
        WHEN 'motoring'            THEN 'discretionary'
        WHEN 'property_management' THEN 'discretionary'
        WHEN 'credit_monitoring'   THEN 'discretionary'
        WHEN 'bills'               THEN 'discretionary'
        WHEN 'professional'        THEN 'discretionary'
        WHEN 'hobbies'             THEN 'discretionary'
        WHEN 'other'               THEN 'discretionary'
        ELSE 'discretionary'
      END
      FROM normalised n
    )
  END;
$$;

COMMENT ON FUNCTION public.category_bucket(text) IS
  'Canonical category → bucket (internal_transfer | income | fixed_cost | variable_cost | discretionary). Mirrors src/lib/category-taxonomy.ts. Spending = fixed_cost + variable_cost + discretionary. A bare ''credit'' is a bank direction code (money in) and buckets as income, not credit_card.';
