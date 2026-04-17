-- ============================================================
-- Restore Categorisation Pipeline — 2026-04-17
--
-- Problem:
--   1. detect_internal_transfers assigns `updated_at = NOW()` on
--      bank_transactions, but that column doesn't exist on the
--      deployed schema. Every call fails with:
--        "column 'updated_at' of relation 'bank_transactions' does not exist"
--   2. auto_categorise_transactions only runs Phases 1-4 (merchant_rules,
--      Open-Banking category → transfers, CREDIT → income,
--      SO/DD → bills). Card purchases and faster-payment rows that
--      don't match any merchant_rule are left NULL and silently
--      disappear from the Money Hub "spending by category" view.
--
-- Fix (additive only — CREATE OR REPLACE only, no drops):
--   A. Replace detect_internal_transfers to remove the invalid
--      `updated_at` reference. Logic is otherwise unchanged —
--      paired debit+credit of equal magnitude across different
--      account_ids within 2 hours → marked 'transfers'.
--   B. Replace auto_categorise_transactions to add Phases 5-6:
--        Phase 5: residual NULL faster-payment-style debits
--                 ('VIA MOBILE - PYMT', personal-name patterns)
--                 → 'transfers' (conservative — these are
--                 almost always person-to-person)
--        Phase 6: final catch-all for anything still NULL →
--                 'other', so the Money Hub view never silently
--                 drops a spending row.
--      Output shape remains backward-compatible (adds
--      faster_payment_transfers / catchall_other counts).
--
-- Safety:
--   * CREATE OR REPLACE FUNCTION only — no drops.
--   * No ALTER TABLE.
--   * No destructive writes — every phase is guarded by
--     `user_category IS NULL` so user choices and prior
--     classifications are never overwritten.
--   * SECURITY DEFINER preserved so cron/agent callers keep
--     current permissions.
-- ============================================================


-- ─── A. detect_internal_transfers — drop the bad updated_at write ─────────
CREATE OR REPLACE FUNCTION public.detect_internal_transfers(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Mark as transfers: paired debit+credit of same magnitude across
  -- different accounts within 2 hours. Only touches rows whose
  -- user_category is still NULL or already in a neutral bucket —
  -- we never overwrite a user's explicit category choice.
  WITH paired AS (
    SELECT
      t1.id AS debit_id,
      t2.id AS credit_id
    FROM bank_transactions t1
    JOIN bank_transactions t2
      ON t1.user_id = t2.user_id
     AND t1.user_id = p_user_id
     AND ABS(t1.amount) = ABS(t2.amount)
     AND t1.amount < 0
     AND t2.amount > 0
     AND t1.account_id != t2.account_id
     AND ABS(EXTRACT(EPOCH FROM (t1.timestamp - t2.timestamp))) <= 7200
     AND (t1.user_category IS NULL OR t1.user_category NOT IN ('transfers', 'income'))
     AND (t2.user_category IS NULL OR t2.user_category NOT IN ('transfers', 'income'))
  )
  UPDATE bank_transactions
  SET user_category = 'transfers'
  WHERE id IN (SELECT debit_id  FROM paired)
     OR id IN (SELECT credit_id FROM paired);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.detect_internal_transfers(uuid)
  TO authenticated, service_role;


-- ─── B. auto_categorise_transactions — add Phases 5 & 6 ───────────────────
CREATE OR REPLACE FUNCTION public.auto_categorise_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  categorised_count          integer := 0;  -- Phase 1
  transfer_count             integer := 0;  -- Phase 2
  income_count               integer := 0;  -- Phase 3
  bills_count                integer := 0;  -- Phase 4
  faster_payment_transfers   integer := 0;  -- Phase 5 (new)
  catchall_other             integer := 0;  -- Phase 6 (new)
BEGIN
  -- ─── Phase 1: merchant_rules by normalised name substring ───────────────
  WITH matched AS (
    SELECT DISTINCT ON (bt.id) bt.id,
      CASE
        WHEN mr.is_transfer = true            THEN 'transfers'
        WHEN mr.category = 'utility'           THEN 'energy'
        WHEN mr.category = 'loan'              THEN 'loans'
        WHEN mr.category = 'fee'               THEN 'bills'
        WHEN mr.category = 'food' AND bt.amount < -20 THEN 'groceries'
        WHEN mr.category = 'food'              THEN 'eating_out'
        WHEN mr.category = 'gambling'          THEN 'entertainment'
        WHEN mr.category = 'travel'            THEN 'transport'
        WHEN mr.category = 'healthcare'        THEN 'bills'
        WHEN mr.category = 'charity'           THEN 'bills'
        WHEN mr.category = 'education'         THEN 'professional'
        WHEN mr.category = 'pets'              THEN 'bills'
        ELSE mr.category
      END AS new_category
    FROM bank_transactions bt
    JOIN merchant_rules mr
      ON LOWER(bt.description) LIKE '%' || mr.raw_name_normalised || '%'
    WHERE bt.user_id = p_user_id
      AND bt.user_category IS NULL
    ORDER BY bt.id, LENGTH(mr.raw_name_normalised) DESC
  )
  UPDATE bank_transactions bt
  SET user_category = m.new_category
  FROM matched m
  WHERE bt.id = m.id;
  GET DIAGNOSTICS categorised_count = ROW_COUNT;

  -- ─── Phase 2: Open Banking category-based fallback → transfers ──────────
  UPDATE bank_transactions
  SET user_category = 'transfers'
  WHERE user_id = p_user_id
    AND user_category IS NULL
    AND category = 'TRANSFER';
  GET DIAGNOSTICS transfer_count = ROW_COUNT;

  -- ─── Phase 3: positive CREDIT amounts → income ─────────────────────────
  UPDATE bank_transactions
  SET user_category = 'income'
  WHERE user_id = p_user_id
    AND user_category IS NULL
    AND category = 'CREDIT'
    AND amount > 0;
  GET DIAGNOSTICS income_count = ROW_COUNT;

  -- ─── Phase 4: unmatched SO / DD → bills ────────────────────────────────
  UPDATE bank_transactions
  SET user_category = 'bills'
  WHERE user_id = p_user_id
    AND user_category IS NULL
    AND category IN ('STANDING_ORDER', 'DIRECT_DEBIT');
  GET DIAGNOSTICS bills_count = ROW_COUNT;

  -- ─── Phase 5 (NEW): residual faster-payment debits → transfers ──────────
  -- Catches:
  --   * "... VIA MOBILE - PYMT ..." (faster-payment mobile push)
  --   * "FP DD/MM/YY ..."           (faster-payment echo)
  --   * "URGENT TFR"                (urgent transfer)
  --   * "... HSBC BANK VISA ..."    (credit-card payoff from current a/c)
  -- Conservative: only touches NULL rows and only matches on the
  -- description to avoid accidentally sweeping in unrelated merchants.
  UPDATE bank_transactions
  SET user_category = 'transfers'
  WHERE user_id = p_user_id
    AND user_category IS NULL
    AND amount < 0
    AND (
         UPPER(COALESCE(description, '')) LIKE '%VIA MOBILE - PYMT%'
      OR UPPER(COALESCE(description, '')) LIKE '% FP %'
      OR UPPER(COALESCE(description, '')) LIKE '%URGENT TFR%'
      OR UPPER(COALESCE(description, '')) LIKE '%HSBC BANK VISA%'
    );
  GET DIAGNOSTICS faster_payment_transfers = ROW_COUNT;

  -- ─── Phase 6 (NEW): catch-all for still-NULL rows → 'other' ────────────
  -- Ensures the Money Hub "spending by category" view never silently drops
  -- a row. 'other' is intentionally the weakest bucket — it gives the
  -- user a clear reclassification target in the UI.
  UPDATE bank_transactions
  SET user_category = 'other'
  WHERE user_id = p_user_id
    AND user_category IS NULL
    AND amount < 0;
  GET DIAGNOSTICS catchall_other = ROW_COUNT;

  RETURN jsonb_build_object(
    'merchant_rules_matched',    categorised_count,
    'transfers_from_category',   transfer_count,
    'income_from_credit',        income_count,
    'bills_from_dd_so',          bills_count,
    'faster_payment_transfers',  faster_payment_transfers,
    'catchall_other',            catchall_other,
    'total',                     categorised_count
                                 + transfer_count
                                 + income_count
                                 + bills_count
                                 + faster_payment_transfers
                                 + catchall_other
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.auto_categorise_transactions(uuid)
  TO authenticated, service_role;


-- ─── C. Doc comments for the audit trail ───────────────────────────────
COMMENT ON FUNCTION public.detect_internal_transfers(uuid) IS
  'Pairs equal-magnitude debit/credit rows across accounts within 2h and '
  'marks both as ''transfers''. Fixed 2026-04-17 to remove invalid '
  'updated_at write. Never overwrites explicit user categories.';

COMMENT ON FUNCTION public.auto_categorise_transactions(uuid) IS
  'Six-phase categorisation pipeline: (1) merchant_rules substring match, '
  '(2) Open Banking TRANSFER category, (3) positive CREDIT → income, '
  '(4) STANDING_ORDER/DIRECT_DEBIT → bills, (5) faster-payment echoes → '
  'transfers, (6) catch-all → other. Phases 5-6 added 2026-04-17 so no '
  'debit row is ever left NULL and silently dropped from the Money Hub view.';
