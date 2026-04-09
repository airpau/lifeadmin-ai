-- ============================================================
-- Sync Improvements — 2026-04-09
--
-- 1. Improve auto_categorise_transactions: detect NatWest-style
--    "DDMON A/C {account_number}" direct debits and classify them
--    as 'bills' instead of the generic 'other' fallback.
-- 2. One-time backfill: fix existing 'other' transactions matching
--    this pattern that were already categorised by the old logic.
-- 3. Ensure categorisation never overwrites user-set categories.
-- ============================================================


-- ─── 1. Update auto_categorise_transactions ───────────────────────────────────
-- Adds Phase 5.5 between income marking and the 'other' fallback.
-- Phase 5.5 detects bank-formatted direct debits to external account numbers
-- (e.g. "11APR A/C 80945686" — NatWest/RBS/Ulster Bank format for standing
-- orders and direct debits to mortgage/loan accounts) and classifies them as
-- 'bills'. Must run BEFORE Phase 6 (other fallback) so uncategorised rows get
-- the right label, and the rule is in auto_categorise so it applies on every
-- future sync too.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfers integer := 0;
  v_income    integer := 0;
  v_spending  integer := 0;
BEGIN

  -- Phase 1: user-defined merchant-pattern overrides
  UPDATE bank_transactions bt
  SET user_category = o.user_category
  FROM money_hub_category_overrides o
  WHERE o.user_id            = p_user_id
    AND bt.user_id           = p_user_id
    AND bt.user_category     IS NULL
    AND o.transaction_id     IS NULL
    AND o.merchant_pattern  != 'txn_specific'
    AND (
      LOWER(COALESCE(bt.merchant_name, '')) LIKE '%' || LOWER(o.merchant_pattern) || '%'
      OR LOWER(COALESCE(bt.description, '')) LIKE '%' || LOWER(o.merchant_pattern) || '%'
    );

  -- Phase 2: description-based transfer detection (debits + credits)
  -- Must run BEFORE income/spending classification so transfers are excluded.
  -- IMPORTANT: we only match explicit "to a/c" / "from a/c" with a preposition
  -- to avoid incorrectly tagging NatWest direct debit descriptions like
  -- "11APR A/C 80945686" (no "to" or "from" prefix).
  UPDATE bank_transactions
  SET user_category = 'transfers',
      income_type   = CASE WHEN amount > 0 THEN 'transfer' ELSE income_type END
  WHERE user_id        = p_user_id
    AND user_category  IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND (
         LOWER(COALESCE(description,'')) LIKE '%to a/c%'
      OR LOWER(COALESCE(description,'')) LIKE '%from a/c%'
      OR LOWER(COALESCE(description,'')) LIKE '%personal transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%via mobile xfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%via mobile-pymt%'
      OR LOWER(COALESCE(description,'')) LIKE '%via online-pymt%'
      OR LOWER(COALESCE(description,'')) LIKE '%transfer to%'
      OR LOWER(COALESCE(description,'')) LIKE '%transfer from%'
      OR LOWER(COALESCE(description,'')) LIKE '%from savings%'
      OR LOWER(COALESCE(description,'')) LIKE '%from current account%'
      OR LOWER(COALESCE(description,'')) LIKE '%isa transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%savings transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%account transfer%'
      OR LOWER(COALESCE(description,'')) LIKE '%barclaycard%'
      OR LOWER(COALESCE(description,'')) LIKE '%securepay.bos%'
      OR LOWER(COALESCE(description,'')) LIKE '% tfr %'
      OR LOWER(COALESCE(description,'')) LIKE '% trf %'
      OR LOWER(COALESCE(description,'')) ~ '^\s*(tfr|trf)\s+'
    );
  GET DIAGNOSTICS v_transfers = ROW_COUNT;

  -- Phase 3: credit/loan disbursements — not income, not spending
  UPDATE bank_transactions
  SET user_category = 'transfers',
      income_type   = 'credit_loan'
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL
    AND (
         LOWER(COALESCE(description,'')) LIKE '%flexipay%'
      OR LOWER(COALESCE(description,'')) LIKE '%credit facility%'
      OR LOWER(COALESCE(description,'')) LIKE '%loan advance%'
      OR LOWER(COALESCE(description,'')) LIKE '%loan drawdown%'
      OR LOWER(COALESCE(description,'')) LIKE '%overdraft advance%'
    );

  -- Phase 4: income-type detection for remaining credits
  UPDATE bank_transactions
  SET income_type = CASE
    WHEN LOWER(COALESCE(description,'')) LIKE '%salary%'
      OR LOWER(COALESCE(description,'')) LIKE '%payroll%'
      OR LOWER(COALESCE(description,'')) LIKE '%wages%'
      OR LOWER(COALESCE(description,'')) LIKE '%monthly pay%'
      OR LOWER(COALESCE(description,'')) LIKE '%net pay%'
      OR LOWER(COALESCE(description,'')) LIKE '%director%'
      OR LOWER(COALESCE(description,'')) LIKE '%pay ref%'         THEN 'salary'
    WHEN LOWER(COALESCE(description,'')) LIKE '%hmrc%'
      OR LOWER(COALESCE(description,'')) LIKE '%dwp%'
      OR LOWER(COALESCE(description,'')) LIKE '%universal credit%'
      OR LOWER(COALESCE(description,'')) LIKE '%child benefit%'
      OR LOWER(COALESCE(description,'')) LIKE '%tax credit%'
      OR LOWER(COALESCE(description,'')) LIKE '%working tax%'     THEN 'benefits'
    WHEN LOWER(COALESCE(description,'')) LIKE '%dividend%'
      OR LOWER(COALESCE(description,'')) LIKE '%interest earned%'
      OR LOWER(COALESCE(description,'')) LIKE '%interest payment%'
      OR LOWER(COALESCE(description,'')) LIKE '%capital gain%'    THEN 'investment'
    WHEN LOWER(COALESCE(description,'')) LIKE '%invoice%'
      OR LOWER(COALESCE(description,'')) LIKE '%consulting%'
      OR LOWER(COALESCE(description,'')) LIKE '%freelance%'       THEN 'freelance'
    WHEN (
           LOWER(COALESCE(description,'')) LIKE '% rent %'
        OR LOWER(COALESCE(description,'')) LIKE 'rent %'
        OR LOWER(COALESCE(description,'')) LIKE '%rental income%'
        OR LOWER(COALESCE(description,'')) LIKE '%letting income%'
        OR LOWER(COALESCE(description,'')) LIKE '%airbnb%'
        OR LOWER(COALESCE(description,'')) LIKE '%booking.com%'
      )
      AND LOWER(COALESCE(description,'')) NOT LIKE '%transfer%'
      AND LOWER(COALESCE(description,'')) NOT LIKE '%current account%' THEN 'rental'
    WHEN LOWER(COALESCE(description,'')) LIKE '%refund from%'
      OR LOWER(COALESCE(description,'')) LIKE '%your refund%'
      OR LOWER(COALESCE(description,'')) LIKE '%cashback%'        THEN 'refund'
    WHEN amount > 1000                                             THEN 'salary'
    ELSE                                                                'other'
  END
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL  -- not yet tagged as a transfer
    AND income_type  IS NULL;

  -- Phase 5: mark remaining uncategorised credits as 'income'
  UPDATE bank_transactions
  SET user_category = 'income'
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL;
  GET DIAGNOSTICS v_income = ROW_COUNT;

  -- Phase 5.5: bank-formatted direct debits to external account numbers
  -- NatWest/RBS/Ulster Bank format: "DDMMM A/C {account_number}"
  -- e.g. "11APR A/C 80945686" — mortgage, loan, or other direct debit
  -- These do NOT contain "to" or "from" so Phase 2 misses them.
  -- Classify as 'bills' (a safe general category for external account DDs).
  UPDATE bank_transactions
  SET user_category = 'bills'
  WHERE user_id      = p_user_id
    AND amount       < 0
    AND user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND COALESCE(description, '') ~ '^[0-9]{2}[A-Z]{3} A/C [0-9]+$';

  -- Phase 6: mark all remaining uncategorised debits as 'other'
  UPDATE bank_transactions
  SET user_category = 'other'
  WHERE user_id      = p_user_id
    AND amount       < 0
    AND user_category IS NULL;
  GET DIAGNOSTICS v_spending = ROW_COUNT;

  RETURN jsonb_build_object(
    'transfers', v_transfers,
    'income',    v_income,
    'spending',  v_spending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_categorise_transactions(uuid) TO authenticated, service_role;


-- ─── 2. One-time backfill ────────────────────────────────────────────────────
-- Fix existing transactions that were already set to 'other' by the old Phase 6
-- but actually match the NatWest "DDMMM A/C {number}" direct debit pattern.
-- Only touches rows with no user override (preserves any manual recategorisations).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  UPDATE bank_transactions bt
  SET user_category = 'bills'
  WHERE bt.amount       < 0
    AND bt.user_category = 'other'
    AND COALESCE(bt.description, '') ~ '^[0-9]{2}[A-Z]{3} A/C [0-9]+$'
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = bt.user_id AND o.transaction_id = bt.id::text
    );

  RAISE NOTICE 'Backfilled % NatWest A/C direct debit rows to bills', ROW_COUNT;
END;
$$;
