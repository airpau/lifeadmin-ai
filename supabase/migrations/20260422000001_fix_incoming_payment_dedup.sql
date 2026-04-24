-- ============================================================
-- Fix: incoming Faster Payment pending/settled deduplication
-- 2026-04-22
--
-- Root cause:
--   PR #107 added a pending→settled trigger but its text-matching
--   only checks settled.merchant_name ⊂ pending.description.
--   For incoming Faster Payments the relationship is reversed:
--     pending  description = "Ben Rent Rm6"           (short ref)
--     settled  description = "B FRASER BEN RENT RM6 FP 15/04/26 0637 500000001749510782"
--   The pending description IS a substring of the settled description,
--   but none of the PR #107 conditions fire because:
--     • descriptions differ
--     • merchant_names differ / are null
--     • settled.merchant_name is not in the short pending description
--
-- Fix:
--   1. Add strip_faster_payment_suffix() — removes the trailing
--      "FP DD/MM/YY NNNN LONGREFNUMBER" block from settled descriptions.
--   2. Rewrite fn_reconcile_pending_on_settle() with bidirectional
--      substring checks plus FP-stripped comparison.
--   3. Replace the trigger (DROP IF EXISTS → CREATE).
--   4. Rewrite deduplicate_bank_transactions() with the same logic.
--   5. One-time backfill to clean any existing duplicates.
--
-- These are all CREATE OR REPLACE / DROP IF EXISTS so the migration
-- is safe whether or not PR #107 was merged first.
-- ============================================================


-- ─── 0. Helper: strip Faster Payment metadata suffix ─────────────────────────
-- Input:  "B FRASER BEN RENT RM6 FP 15/04/26 0637 500000001749510782"
-- Output: "B FRASER BEN RENT RM6"
-- Matches the pattern " FP DD/MM/YY ..." inserted by Faster Payments.
CREATE OR REPLACE FUNCTION strip_faster_payment_suffix(desc TEXT)
RETURNS TEXT AS $$
BEGIN
  IF desc IS NULL THEN RETURN NULL; END IF;
  RETURN TRIM(REGEXP_REPLACE(desc, '\s+FP\s+\d{2}/\d{2}/\d{2}.*$', '', 'i'));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

GRANT EXECUTE ON FUNCTION strip_faster_payment_suffix(text) TO authenticated, service_role;


-- ─── 1. Trigger function: reconcile pending on every settled insert ───────────
-- Fires immediately when a non-pending row is inserted or flipped to settled,
-- removing the corresponding stale pending row for the same transaction.
--
-- Text-matching logic (any one of these suffices):
--   a. Exact description match (lowercased)
--   b. Exact merchant_name match (lowercased)
--   c. settled.merchant_name ⊂ pending.description  (original PR #107 case)
--   d. pending.description ⊂ settled.description    (NEW — incoming FP case)
--   e. pending.description ⊂ FP-stripped settled.description  (NEW — extra safety)
--
-- Guards: minimum 4-char length on the needle prevents accidental
-- short-string false positives (e.g. "ING", "UOB").
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_reconcile_pending_on_settle()
RETURNS TRIGGER AS $$
DECLARE
  v_settled_desc      TEXT;
  v_settled_desc_norm TEXT;
BEGIN
  IF NEW.is_pending IS DISTINCT FROM FALSE THEN
    RETURN NEW;
  END IF;

  v_settled_desc      := LOWER(COALESCE(NEW.description, ''));
  v_settled_desc_norm := LOWER(strip_faster_payment_suffix(COALESCE(NEW.description, '')));

  DELETE FROM bank_transactions
  WHERE  user_id         = NEW.user_id
    AND  account_id      = NEW.account_id
    AND  amount          = NEW.amount
    AND  timestamp::DATE = NEW.timestamp::DATE
    AND  is_pending      = TRUE
    AND  id             != NEW.id
    AND (
      -- (a) exact description match
      LOWER(COALESCE(description, '')) = v_settled_desc

      -- (b) exact merchant_name match
      OR (
        NEW.merchant_name IS NOT NULL
        AND merchant_name IS NOT NULL
        AND LOWER(merchant_name) = LOWER(NEW.merchant_name)
      )

      -- (c) settled merchant_name appears inside pending description (original)
      OR (
        description IS NOT NULL
        AND NEW.merchant_name IS NOT NULL
        AND LENGTH(NEW.merchant_name) >= 4
        AND LOWER(description) LIKE '%' || LOWER(NEW.merchant_name) || '%'
      )

      -- (d) pending description appears inside settled description (NEW — incoming FP)
      OR (
        description IS NOT NULL
        AND LENGTH(description) >= 4
        AND v_settled_desc LIKE '%' || LOWER(description) || '%'
      )

      -- (e) pending description appears inside FP-stripped settled description (NEW)
      OR (
        description IS NOT NULL
        AND LENGTH(description) >= 4
        AND v_settled_desc_norm LIKE '%' || LOWER(description) || '%'
      )
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. Replace trigger ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reconcile_pending_on_settle ON bank_transactions;
CREATE TRIGGER trg_reconcile_pending_on_settle
  AFTER INSERT OR UPDATE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_reconcile_pending_on_settle();


-- ─── 3. Update batch deduplication function ───────────────────────────────────
-- Called by the nightly bank-sync cron and the manual "sync now" endpoint.
CREATE OR REPLACE FUNCTION deduplicate_bank_transactions(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Part A: Cross-connection deduplication (original logic, unchanged).
  -- Removes duplicate rows that exist across multiple bank connections
  -- (e.g. after a TrueLayer → Yapily migration).
  WITH duplicates AS (
    SELECT
      t.id AS transaction_id,
      ROW_NUMBER() OVER (
        PARTITION BY t.amount, t.timestamp::DATE, COALESCE(t.merchant_name, t.description)
        ORDER BY c.last_synced_at DESC NULLS LAST, t.created_at DESC
      ) AS rn,
      COUNT(DISTINCT t.connection_id) OVER (
        PARTITION BY t.amount, t.timestamp::DATE, COALESCE(t.merchant_name, t.description)
      ) AS distinct_conn_count
    FROM bank_transactions t
    LEFT JOIN bank_connections c ON t.connection_id = c.id
    WHERE t.user_id = p_user_id
  )
  DELETE FROM bank_transactions
  WHERE id IN (
    SELECT transaction_id FROM duplicates WHERE distinct_conn_count > 1 AND rn > 1
  );

  -- Part B: Pending → Settled reconciliation with FP-aware bidirectional matching.
  -- Deletes pending rows when a non-pending row exists for the same
  -- (account_id, amount, date) and the descriptions are recognisably the same.
  DELETE FROM bank_transactions AS pending_tx
  WHERE pending_tx.user_id    = p_user_id
    AND pending_tx.is_pending = TRUE
    AND EXISTS (
      SELECT 1
      FROM   bank_transactions settled_tx
      WHERE  settled_tx.user_id            = p_user_id
        AND  settled_tx.account_id         = pending_tx.account_id
        AND  settled_tx.amount             = pending_tx.amount
        AND  settled_tx.timestamp::DATE    = pending_tx.timestamp::DATE
        AND  settled_tx.is_pending         = FALSE
        AND  settled_tx.id                != pending_tx.id
        AND (
          -- (a) exact description match
          LOWER(COALESCE(settled_tx.description, '')) = LOWER(COALESCE(pending_tx.description, ''))

          -- (b) exact merchant_name match
          OR (
            settled_tx.merchant_name IS NOT NULL
            AND pending_tx.merchant_name IS NOT NULL
            AND LOWER(settled_tx.merchant_name) = LOWER(pending_tx.merchant_name)
          )

          -- (c) settled merchant_name ⊂ pending description (original)
          OR (
            pending_tx.description IS NOT NULL
            AND settled_tx.merchant_name IS NOT NULL
            AND LENGTH(settled_tx.merchant_name) >= 4
            AND LOWER(pending_tx.description) LIKE '%' || LOWER(settled_tx.merchant_name) || '%'
          )

          -- (d) pending description ⊂ settled description (NEW — incoming FP)
          OR (
            pending_tx.description IS NOT NULL
            AND LENGTH(pending_tx.description) >= 4
            AND LOWER(settled_tx.description) LIKE '%' || LOWER(pending_tx.description) || '%'
          )

          -- (e) pending description ⊂ FP-stripped settled description (NEW)
          OR (
            pending_tx.description IS NOT NULL
            AND LENGTH(pending_tx.description) >= 4
            AND LOWER(strip_faster_payment_suffix(COALESCE(settled_tx.description, '')))
                LIKE '%' || LOWER(pending_tx.description) || '%'
          )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduplicate_bank_transactions(uuid) TO authenticated, service_role;


-- ─── 4. One-time backfill ─────────────────────────────────────────────────────
-- Clean any existing pending/settled duplicates that the old logic missed.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM bank_transactions WHERE is_pending = TRUE LOOP
    PERFORM deduplicate_bank_transactions(r.user_id);
  END LOOP;
END;
$$;
