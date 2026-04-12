-- ============================================================
-- Budget merchant categories + bill reconciliation — 2026-04-12
--
-- 1. Update auto_categorise_transactions to detect groceries, travel,
--    eating_out, and software categories from merchant names BEFORE
--    the 'other' fallback in Phase 6.
-- 2. Re-categorise existing transactions where user_category = 'other'
--    but the merchant matches a known pattern.
-- 3. Add bill_paid_overrides table for manual "Mark as paid" per bill per month.
-- ============================================================


-- ─── 1. bill_paid_overrides table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_paid_overrides (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bill_key      TEXT NOT NULL,
  bill_month    TEXT NOT NULL,  -- format: 'YYYY-MM'
  marked_paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, bill_key, bill_month)
);

ALTER TABLE bill_paid_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bill paid overrides"
  ON bill_paid_overrides FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_bill_paid_overrides_user_month
  ON bill_paid_overrides(user_id, bill_month);


-- ─── 2. Updated auto_categorise_transactions ──────────────────────────────────
-- Adds Phase 5.5: detect specific spending categories from merchant/description
-- keywords before the catch-all 'other' assignment in Phase 6.
-- All other phases and safety guards unchanged.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_transfers integer := 0;
  v_income    integer := 0;
  v_spending  integer := 0;
  v_groceries integer := 0;
  v_travel    integer := 0;
  v_eating    integer := 0;
  v_software  integer := 0;
  v_bills     integer := 0;
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

  -- Phase 3: credit/loan disbursements
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
    AND user_category IS NULL
    AND income_type  IS NULL;

  -- Phase 5: mark remaining uncategorised credits as 'income'
  UPDATE bank_transactions
  SET user_category = 'income'
  WHERE user_id      = p_user_id
    AND amount       > 0
    AND user_category IS NULL;
  GET DIAGNOSTICS v_income = ROW_COUNT;

  -- Phase 5.5: detect known spending categories from merchant/description
  -- Groceries
  UPDATE bank_transactions
  SET user_category = 'groceries'
  WHERE user_id     = p_user_id
    AND amount      < 0
    AND user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(tesco|sainsbury|asda|morrisons|lidl|aldi|waitrose|co.?op|one stop|spar \
|nisa local|budgens|farmfood|marks.{0,8}spencer food|m&s food|iceland food|iceland grocery|costco|ocado|amazon.{0,6}fresh|amazon grocery)';
  GET DIAGNOSTICS v_groceries = ROW_COUNT;

  -- Travel (petrol, rail, flights, parking, ride-hail, car hire)
  UPDATE bank_transactions
  SET user_category = 'travel'
  WHERE user_id     = p_user_id
    AND amount      < 0
    AND user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(shell[^a-z]|shell$| bp | bp$|bpme|esso[^n]|texaco|gulf petro|jet petro|moto service|welcome break|extra msa|forecourt|petrol station\
|trainline|national rail|avanti west|lner|gwr|crosscountry|tpe |northern rail|southeastern rail|thameslink|c2c train|greater anglia|eurostar\
|ryanair|easyjet|british airways|jet2|wizz air\
|tfl |oyster card|tube fare|bus fare\
|ncp park|q.?park|ringgo|justpark|paybyphone\
|enterprise rent|hertz|europcar|zipcar|sixt rent\
|santander cycle|cycle hire\
|bolt ride|lyft|free now)';
  GET DIAGNOSTICS v_travel = ROW_COUNT;

  -- Eating out
  UPDATE bank_transactions
  SET user_category = 'eating_out'
  WHERE user_id     = p_user_id
    AND amount      < 0
    AND user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(mcdonald|burger king|kfc |nandos|dominos|greggs|costa coffee|starbucks|pret a|wetherspoon|wagamama|itsu|pizza hut|yo sushi)';
  GET DIAGNOSTICS v_eating = ROW_COUNT;

  -- Software / subscriptions
  UPDATE bank_transactions
  SET user_category = 'software'
  WHERE user_id     = p_user_id
    AND amount      < 0
    AND user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(adobe systems|microsoft 365|google one|dropbox|icloud storage|1password|notion|slack|zoom video|canva|chatgpt|openai|patreon)';
  GET DIAGNOSTICS v_software = ROW_COUNT;

  -- Phase 5.5 cont: NatWest-style direct debits (DD/MMM A/C <number> or A/C + digits) → bills
  -- These are mortgage/loan DDs that use NatWest's reference format and would otherwise
  -- fall through to 'other' in Phase 6.
  UPDATE bank_transactions
  SET user_category = 'bills'
  WHERE user_id     = p_user_id
    AND amount      < 0
    AND user_category IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = p_user_id AND o.transaction_id = bank_transactions.id::text
    )
    AND (
      LOWER(COALESCE(description,'')) ~ '\ba/c\s+\d+'
      OR LOWER(COALESCE(description,'')) ~ '\bdd/[a-z]{3}\s+a/c\b'
    );
  GET DIAGNOSTICS v_bills = ROW_COUNT;

  -- Phase 6: mark remaining uncategorised debits as 'other'
  UPDATE bank_transactions
  SET user_category = 'other'
  WHERE user_id      = p_user_id
    AND amount       < 0
    AND user_category IS NULL;
  GET DIAGNOSTICS v_spending = ROW_COUNT;

  RETURN jsonb_build_object(
    'transfers', v_transfers,
    'income',    v_income,
    'groceries', v_groceries,
    'travel',    v_travel,
    'eating_out',v_eating,
    'software',  v_software,
    'bills',     v_bills,
    'other',     v_spending,
    'status',    'complete'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION auto_categorise_transactions(uuid) TO authenticated, service_role;


-- ─── 3. Re-categorise existing 'other' transactions for known merchants ────────
-- Safe to run: only touches user_category = 'other' rows where no
-- transaction-specific user override exists in money_hub_category_overrides.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  total_groceries integer := 0;
  total_travel    integer := 0;
  total_eating    integer := 0;
  total_software  integer := 0;
  total_bills     integer := 0;
  n               integer := 0;
BEGIN

  -- Groceries
  UPDATE bank_transactions
  SET user_category = 'groceries'
  WHERE amount < 0
    AND user_category = 'other'
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = bank_transactions.user_id
        AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(tesco|sainsbury|asda|morrisons|lidl|aldi|waitrose|co.?op|one stop|spar |nisa local|budgens|farmfood|marks.{0,8}spencer food|m&s food|iceland food|iceland grocery|costco|ocado|amazon.{0,6}fresh|amazon grocery)';
  GET DIAGNOSTICS n = ROW_COUNT;
  total_groceries := n;

  -- Travel
  UPDATE bank_transactions
  SET user_category = 'travel'
  WHERE amount < 0
    AND user_category = 'other'
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = bank_transactions.user_id
        AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(shell[^a-z]|shell$| bp | bp$|bpme|esso[^n]|texaco|gulf petro|jet petro|moto service|welcome break|extra msa|forecourt|petrol station|trainline|national rail|avanti west|lner|gwr|crosscountry|tpe |ryanair|easyjet|british airways|jet2|wizz air|tfl |oyster card|ncp park|q.?park|ringgo|justpark|paybyphone|enterprise rent|hertz|europcar|zipcar|santander cycle|bolt ride|lyft|free now)';
  GET DIAGNOSTICS n = ROW_COUNT;
  total_travel := n;

  -- Eating out
  UPDATE bank_transactions
  SET user_category = 'eating_out'
  WHERE amount < 0
    AND user_category = 'other'
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = bank_transactions.user_id
        AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(mcdonald|burger king|kfc |nandos|dominos|greggs|costa coffee|starbucks|pret a|wetherspoon|wagamama|itsu|pizza hut|yo sushi)';
  GET DIAGNOSTICS n = ROW_COUNT;
  total_eating := n;

  -- Software
  UPDATE bank_transactions
  SET user_category = 'software'
  WHERE amount < 0
    AND user_category = 'other'
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = bank_transactions.user_id
        AND o.transaction_id = bank_transactions.id::text
    )
    AND LOWER(COALESCE(merchant_name,'') || ' ' || COALESCE(description,''))
        ~* '(adobe systems|microsoft 365|google one|dropbox|icloud storage|1password|notion|slack|zoom video|canva|chatgpt|openai|patreon)';
  GET DIAGNOSTICS n = ROW_COUNT;
  total_software := n;

  -- NatWest A/C direct debits: re-categorise existing 'other' rows
  UPDATE bank_transactions
  SET user_category = 'bills'
  WHERE amount < 0
    AND user_category = 'other'
    AND NOT EXISTS (
      SELECT 1 FROM money_hub_category_overrides o
      WHERE o.user_id = bank_transactions.user_id
        AND o.transaction_id = bank_transactions.id::text
    )
    AND (
      LOWER(COALESCE(description,'')) ~ '\ba/c\s+\d+'
      OR LOWER(COALESCE(description,'')) ~ '\bdd/[a-z]{3}\s+a/c\b'
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  total_bills := n;

  RAISE NOTICE 'Re-categorised: groceries=%, travel=%, eating_out=%, software=%, bills(a/c dd)=%',
    total_groceries, total_travel, total_eating, total_software, total_bills;
END $$;
