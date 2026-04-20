-- ============================================================
-- Fix: Pending → Settled Transaction Duplicates
-- 2026-04-20
--
-- Root cause:
--   TrueLayer assigns DIFFERENT transaction_ids to the pending
--   and settled versions of the same transaction. The existing
--   unique constraint is UNIQUE(user_id, transaction_id), so
--   both rows insert cleanly. The existing deduplicate function
--   only deduplicates across *different* connection_ids, missing
--   this case entirely. The client-side dedup in money-hub uses
--   amount|date|merchant as a key, but the pending row has no
--   merchant_name (raw description only) while the settled row
--   has a cleaned name — so the keys differ and both pass through.
--
-- Fix (three layers of defence):
--   1. Update deduplicate_bank_transactions to also remove pending
--      rows when a settled row exists for the same
--      (account_id, amount, DATE(timestamp)).
--   2. A DB trigger that auto-removes stale pending rows whenever
--      a settled row is inserted — prevents the duplicate appearing
--      in the UI before the daily cron runs.
--   3. One-time backfill: clean existing duplicates for all users.
-- ============================================================


-- ─── 1. Update deduplicate_bank_transactions ─────────────────────────────────
CREATE OR REPLACE FUNCTION deduplicate_bank_transactions(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Part A: Cross-connection deduplication (original logic, unchanged)
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
    SELECT transaction_id
    FROM duplicates
    WHERE distinct_conn_count > 1 AND rn > 1
  );

  -- Part B: Pending → Settled reconciliation (new)
  -- TrueLayer gives a brand-new transaction_id when a pending transaction
  -- settles, so UNIQUE(user_id, transaction_id) cannot catch this case.
  -- Delete any is_pending=true row for which a settled row already exists
  -- with the same (user_id, account_id, amount, DATE(timestamp)) AND a
  -- matching description or merchant_name (case-insensitive).
  --
  -- The description/merchant guard prevents false positives: if a user makes
  -- two genuinely different £10 purchases on the same day (e.g. two coffees
  -- at different shops), we must not delete one just because the amounts and
  -- dates collide. Requiring at least one text field to match ensures we only
  -- remove the ghost row from the same real-world transaction.
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
        -- Narrow by text: description or merchant_name must match (case-insensitive).
        -- Pending rows typically carry only description (no merchant_name yet);
        -- the settled row may have either. We match if ANY pairing aligns.
        AND (
          LOWER(COALESCE(settled_tx.description,   '')) = LOWER(COALESCE(pending_tx.description,   ''))
          OR LOWER(COALESCE(settled_tx.merchant_name, '')) = LOWER(COALESCE(pending_tx.merchant_name, ''))
          -- Also catch the common case: settled merchant_name appears inside pending description
          OR (
            pending_tx.description   IS NOT NULL
            AND settled_tx.merchant_name IS NOT NULL
            AND LOWER(pending_tx.description) LIKE '%' || LOWER(settled_tx.merchant_name) || '%'
          )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION deduplicate_bank_transactions(uuid) TO authenticated, service_role;


-- ─── 2. DB trigger: auto-reconcile pending on every settled insert ────────────
-- Fires immediately when a settled transaction row is inserted, removing any
-- matching pending row for the same account_id + amount + date. This prevents
-- the duplicate appearing in the UI even intra-day (before the nightly cron).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_reconcile_pending_on_settle()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when a settled (non-pending) row is inserted or updated.
  IF NEW.is_pending = FALSE THEN
    DELETE FROM bank_transactions
    WHERE  user_id         = NEW.user_id
      AND  account_id      = NEW.account_id
      AND  amount          = NEW.amount
      AND  timestamp::DATE = NEW.timestamp::DATE
      AND  is_pending      = TRUE
      AND  id             != NEW.id
      -- P1 fix: narrow by text so two genuinely different transactions with the
      -- same amount on the same day (e.g. two £10 coffees) are not collapsed.
      -- Match if description equals OR merchant_name equals (case-insensitive),
      -- OR if the settled merchant_name appears anywhere in the pending description
      -- (TrueLayer pending rows often contain the full raw bank string that includes
      -- the merchant name as a substring once the transaction settles).
      AND (
        LOWER(COALESCE(description,    '')) = LOWER(COALESCE(NEW.description,    ''))
        OR LOWER(COALESCE(merchant_name,   '')) = LOWER(COALESCE(NEW.merchant_name,   ''))
        OR (
          description      IS NOT NULL
          AND NEW.merchant_name IS NOT NULL
          AND LOWER(description) LIKE '%' || LOWER(NEW.merchant_name) || '%'
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_reconcile_pending_on_settle ON bank_transactions;

CREATE TRIGGER trg_reconcile_pending_on_settle
  AFTER INSERT OR UPDATE ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_reconcile_pending_on_settle();


-- ─── 3. One-time backfill ────────────────────────────────────────────────────
-- Clean up existing pending duplicates for every user who currently has
-- is_pending=true rows in the DB.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_user_id  UUID;
  v_count    INTEGER := 0;
BEGIN
  FOR v_user_id IN
    SELECT DISTINCT user_id
    FROM   bank_transactions
    WHERE  is_pending = TRUE
  LOOP
    PERFORM deduplicate_bank_transactions(v_user_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Pending-duplicate backfill complete: processed % user(s)', v_count;
END;
$$;
