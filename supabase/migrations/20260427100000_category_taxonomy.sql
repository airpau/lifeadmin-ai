-- ============================================================
-- Canonical Category Taxonomy (2026-04-27)
--
-- Single SQL source of truth for "what bucket does a category fall in?".
-- Mirrors src/lib/category-taxonomy.ts byte-for-byte; the parity is
-- enforced by tests/category-taxonomy-parity.test.ts.
--
-- Buckets:
--   internal_transfer  - own-account-to-own-account; never spending
--   income             - inbound money; never spending
--   fixed_cost         - debt servicing + contractual obligations
--   variable_cost      - recurring but naturally variable
--   discretionary      - lifestyle / catch-all
--
-- Spending = fixed_cost + variable_cost + discretionary.
--
-- Rationale:
--   The codebase had 8+ overlapping exclusion lists that drifted
--   ('EXCLUDED_SAVINGS_CATEGORIES', 'EXCLUDED_FROM_PRICE_DETECTION',
--   'EXCLUDED_DEAL_CATEGORIES', 'EXCLUDED_COMPARISON_CATEGORIES',
--   inline WHERE NOT IN clauses, etc). This function replaces the
--   spending-side lookups with a single buckets API.
-- ============================================================

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
          WHEN 'credit'       THEN 'credit_card'
          WHEN 'car finance'  THEN 'car_finance'
          WHEN 'car-finance'  THEN 'car_finance'
          WHEN 'fees'         THEN 'fee'
          WHEN 'utilities'    THEN 'utility'
          -- Bank-rail synonyms
          WHEN 'bank_transfer' THEN 'transfers'
          WHEN 'transfer'      THEN 'transfers'
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
  'Canonical category → bucket (internal_transfer | income | fixed_cost | variable_cost | discretionary). Mirrors src/lib/category-taxonomy.ts. Spending = fixed_cost + variable_cost + discretionary.';

-- Convenience predicates so callers don't repeat the bucket-name logic.
CREATE OR REPLACE FUNCTION public.is_spending_bucket(p_bucket text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT p_bucket IN ('fixed_cost', 'variable_cost', 'discretionary');
$$;

CREATE OR REPLACE FUNCTION public.is_spending_category(p_category text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT public.is_spending_bucket(public.category_bucket(p_category));
$$;
