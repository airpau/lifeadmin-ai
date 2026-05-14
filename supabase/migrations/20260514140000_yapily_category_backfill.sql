-- Yapily transactions written before 2026-05-14 left bank_transactions.category
-- as NULL even though the row carried a signed amount (positive = credit,
-- negative = debit). Every downstream income query relies on UPPER(category)
-- = 'CREDIT' / 'INTEREST' to identify income — so for business accounts
-- (HSBC Business in particular, where descriptions are bare counterparty
-- names with no "salary" / "invoice" keywords) the historical rows showed
-- £0 income even though the credits were sitting in the table.
--
-- Backfill: for every existing row where category IS NULL OR '' set it
-- from the sign of signed_amount_pence. Going forward, the inserter at
-- src/lib/yapily/connection-store.ts:buildCandidate persists CREDIT /
-- DEBIT directly when it writes the row, so we never accumulate NULLs.
--
-- Idempotent — re-running is a no-op once category is populated.

UPDATE public.bank_transactions
SET category = CASE
  WHEN signed_amount_pence > 0 THEN 'CREDIT'
  WHEN signed_amount_pence < 0 THEN 'DEBIT'
  ELSE COALESCE(NULLIF(category, ''), 'OTHER')
END
WHERE category IS NULL OR category = '';

-- Extend auto_categorise_transactions to recognise the income patterns
-- common on UK business statements: BACS credits, CHAPS, FPS CR /
-- faster-payment credits, customer invoice references, and the
-- merchant-processor names (Stripe, GoCardless, SumUp, etc.). These
-- were the rows that silently became `kind: 'other'` for HSBC Business.
--
-- Constraint: amount > 0 throughout (never reclassify debits).
-- Constraint: respects money_hub_category_overrides (manual overrides
-- always win).
CREATE OR REPLACE FUNCTION auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  merchant_count  integer := 0;
  transfer_count  integer := 0;
  bills_count     integer := 0;
  income_count    integer := 0;
BEGIN
  -- ── 1. Apply merchant_rules by description (longest match wins) ──────
  WITH merchant_matched AS (
    SELECT DISTINCT ON (bt.id) bt.id,
      CASE
        WHEN mr.is_transfer = true         THEN 'transfers'
        WHEN mr.category = 'utility'       THEN 'energy'
        WHEN mr.category = 'loan'          THEN 'loans'
        WHEN mr.category = 'fee'           THEN 'bills'
        WHEN mr.category = 'food' AND bt.amount < -20 THEN 'groceries'
        WHEN mr.category = 'food'          THEN 'eating_out'
        WHEN mr.category = 'gambling'      THEN 'entertainment'
        WHEN mr.category = 'travel'        THEN 'transport'
        WHEN mr.category = 'healthcare'    THEN 'insurance'
        WHEN mr.category = 'charity'       THEN 'bills'
        WHEN mr.category = 'education'     THEN 'professional'
        WHEN mr.category = 'pets'          THEN 'bills'
        ELSE mr.category
      END AS new_category
    FROM bank_transactions bt
    JOIN merchant_rules mr
      ON LOWER(COALESCE(bt.description, '')) LIKE '%' || mr.raw_name_normalised || '%'
    WHERE bt.user_id = p_user_id
      AND bt.user_category IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM money_hub_category_overrides o
        WHERE o.user_id = p_user_id
          AND o.transaction_id = bt.id::text
      )
    ORDER BY bt.id, LENGTH(mr.raw_name_normalised) DESC
  )
  UPDATE bank_transactions bt
  SET    user_category = mm.new_category
  FROM   merchant_matched mm
  WHERE  bt.id = mm.id;
  GET DIAGNOSTICS merchant_count = ROW_COUNT;

  -- ── 2. UK transfer patterns ──────────────────────────────────────────
  -- Tightened: do NOT classify bare 'fps' as transfer for credits — a
  -- positive Faster Payment with 'FPS' in the description is almost
  -- always a customer payment IN (e.g. 'FPS CR ACME LTD'). Only the
  -- 'FPS DR' direction is a transfer-style debit. We keep the broad
  -- pattern for amount < 0 only.
  UPDATE bank_transactions
  SET    user_category = 'transfers'
  WHERE  user_id = p_user_id
    AND  user_category IS NULL
    AND  (
           merchant_name ILIKE 'a/c'
        OR LOWER(COALESCE(description, '')) LIKE '%to a/c%'
        OR LOWER(COALESCE(description, '')) LIKE '%from a/c%'
        OR LOWER(COALESCE(description, '')) LIKE '%a/c no%'
        OR (amount < 0 AND LOWER(COALESCE(description, '')) LIKE '% fps %')
        OR (amount < 0 AND LOWER(COALESCE(description, '')) LIKE 'fps %')
        OR LOWER(COALESCE(description, '')) LIKE '% tfr %'
        OR LOWER(COALESCE(description, '')) LIKE '% trf %'
        OR LOWER(COALESCE(description, '')) LIKE '%transfer from%'
        OR LOWER(COALESCE(description, '')) LIKE '%transfer to%'
        OR LOWER(COALESCE(description, '')) LIKE '%interaccount%'
        OR LOWER(COALESCE(description, '')) LIKE '%internal transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%savings transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%isa transfer%'
        OR LOWER(COALESCE(description, '')) LIKE '%via mobile%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id
        AND o.transaction_id = bank_transactions.id::text
    );
  GET DIAGNOSTICS transfer_count = ROW_COUNT;

  -- ── 3. Direct debits / standing orders → bills ───────────────────────
  UPDATE bank_transactions
  SET    user_category = 'bills'
  WHERE  user_id = p_user_id
    AND  user_category IS NULL
    AND  amount < 0
    AND  (
           LOWER(COALESCE(description, '')) LIKE '%direct debit%'
        OR LOWER(COALESCE(description, '')) LIKE '%standing order%'
        OR LOWER(COALESCE(description, '')) LIKE '% d/d %'
        OR LOWER(COALESCE(description, '')) LIKE '% s/o %'
    )
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id
        AND o.transaction_id = bank_transactions.id::text
    );
  GET DIAGNOSTICS bills_count = ROW_COUNT;

  -- ── 4. Income credits ────────────────────────────────────────────────
  -- Salary, payroll, BACS / CHAPS / FPS-CR credits, invoice payments,
  -- and payment-processor receipts (Stripe / SumUp / Worldpay etc.).
  -- All gated on amount > 0 so we never reclassify a debit.
  UPDATE bank_transactions
  SET    user_category = 'income',
         income_type   = CASE
           WHEN LOWER(COALESCE(description, '')) LIKE '%salary%'
             OR LOWER(COALESCE(description, '')) LIKE '%payroll%'
             OR LOWER(COALESCE(description, '')) LIKE '%wages%'
             OR LOWER(COALESCE(description, '')) LIKE '%net pay%'
             OR LOWER(COALESCE(description, '')) LIKE '%director%'
             THEN 'salary'
           WHEN LOWER(COALESCE(description, '')) LIKE '%invoice%'
             OR LOWER(COALESCE(description, '')) LIKE '%freelance%'
             OR LOWER(COALESCE(description, '')) LIKE '%consulting%'
             THEN 'freelance'
           WHEN LOWER(COALESCE(description, '')) LIKE '%hmrc%'
             OR LOWER(COALESCE(description, '')) LIKE '%tax credit%'
             OR LOWER(COALESCE(description, '')) LIKE '%dwp%'
             OR LOWER(COALESCE(description, '')) LIKE '%universal credit%'
             OR LOWER(COALESCE(description, '')) LIKE '%child benefit%'
             THEN 'benefits'
           WHEN LOWER(COALESCE(description, '')) LIKE '%dividend%'
             OR LOWER(COALESCE(description, '')) LIKE '%interest earned%'
             OR LOWER(COALESCE(description, '')) LIKE '%interest payment%'
             THEN 'investment'
           WHEN LOWER(COALESCE(description, '')) LIKE '%refund%'
             OR LOWER(COALESCE(description, '')) LIKE '%cashback%'
             THEN 'refund'
           ELSE 'other'
         END
  WHERE  user_id = p_user_id
    AND  user_category IS NULL
    AND  amount > 0
    AND  (
           -- Specific income keywords
           LOWER(COALESCE(description, '')) LIKE '%salary%'
        OR LOWER(COALESCE(description, '')) LIKE '%payroll%'
        OR LOWER(COALESCE(description, '')) LIKE '%wages%'
        OR LOWER(COALESCE(description, '')) LIKE '%net pay%'
        OR LOWER(COALESCE(description, '')) LIKE '%director%'
        OR LOWER(COALESCE(description, '')) LIKE '%invoice%'
        OR LOWER(COALESCE(description, '')) LIKE '%freelance%'
        OR LOWER(COALESCE(description, '')) LIKE '%consulting%'
        OR LOWER(COALESCE(description, '')) LIKE '%hmrc%'
        OR LOWER(COALESCE(description, '')) LIKE '%tax credit%'
        OR LOWER(COALESCE(description, '')) LIKE '%dwp%'
        OR LOWER(COALESCE(description, '')) LIKE '%universal credit%'
        OR LOWER(COALESCE(description, '')) LIKE '%child benefit%'
        OR LOWER(COALESCE(description, '')) LIKE '%dividend%'
        OR LOWER(COALESCE(description, '')) LIKE '%interest earned%'
        OR LOWER(COALESCE(description, '')) LIKE '%interest payment%'
        OR LOWER(COALESCE(description, '')) LIKE '%refund%'
        OR LOWER(COALESCE(description, '')) LIKE '%cashback%'
           -- UK business-statement credit patterns. None of these are
           -- transfers — they are real money landing in the account.
        OR LOWER(COALESCE(description, '')) LIKE '%bacs%'
        OR LOWER(COALESCE(description, '')) LIKE '%chaps%'
        OR LOWER(COALESCE(description, '')) LIKE 'fps cr %'
        OR LOWER(COALESCE(description, '')) LIKE '% fps cr %'
        OR LOWER(COALESCE(description, '')) LIKE 'faster payment%'
        OR LOWER(COALESCE(description, '')) LIKE '%faster payment%'
        OR LOWER(COALESCE(description, '')) LIKE 'payment from%'
        OR LOWER(COALESCE(description, '')) LIKE '%payment from %'
        OR LOWER(COALESCE(description, '')) LIKE 'stripe %'
        OR LOWER(COALESCE(description, '')) LIKE '% stripe%'
        OR LOWER(COALESCE(description, '')) LIKE 'gocardless%'
        OR LOWER(COALESCE(description, '')) LIKE '%gocardless%'
        OR LOWER(COALESCE(description, '')) LIKE 'sumup%'
        OR LOWER(COALESCE(description, '')) LIKE '%sumup%'
        OR LOWER(COALESCE(description, '')) LIKE 'worldpay%'
        OR LOWER(COALESCE(description, '')) LIKE '%worldpay%'
        OR LOWER(COALESCE(description, '')) LIKE 'takepayments%'
        OR LOWER(COALESCE(description, '')) LIKE 'square %'
        OR LOWER(COALESCE(description, '')) LIKE 'paypal %'
           -- Bank-side direction indicator. After the 2026-05-14
           -- backfill, every credit carries category='CREDIT', so this
           -- catches the residual "no description keyword" rows.
        OR UPPER(COALESCE(category, '')) IN ('CREDIT', 'INTEREST')
    )
    -- Exclude internal transfers even if they're credits — handled
    -- by rule 2 above.
    AND NOT (
      LOWER(COALESCE(description, '')) LIKE '%from a/c%'
      OR LOWER(COALESCE(description, '')) LIKE '%to a/c%'
      OR LOWER(COALESCE(description, '')) LIKE '%via mobile xfer%'
      OR LOWER(COALESCE(description, '')) LIKE '%internal transfer%'
      OR LOWER(COALESCE(description, '')) LIKE '%isa transfer%'
      OR LOWER(COALESCE(description, '')) LIKE '%savings transfer%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id
        AND o.transaction_id = bank_transactions.id::text
    );
  GET DIAGNOSTICS income_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'merchant_rules_applied', merchant_count,
    'transfers_tagged',        transfer_count,
    'bills_tagged',            bills_count,
    'income_tagged',           income_count,
    'status',                  'complete'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_categorise_transactions(uuid) TO authenticated, service_role;

-- Back-fill: run for every user with bank rows so existing data picks
-- up the new income rules immediately. Idempotent + bounded by the
-- function's own NULL-check.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM bank_transactions
  LOOP
    PERFORM auto_categorise_transactions(r.user_id);
  END LOOP;
END $$;
