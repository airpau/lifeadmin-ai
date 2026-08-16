-- 20260816190000_upcoming_income_forecast.sql
--
-- Forward view for Money Hub: recurring INCOME prediction alongside the
-- existing outgoing-only upcoming feed.
--
-- STRICTLY ADDITIVE. No column or table is dropped. The only DDL that
-- touches an existing object is the widening of the `source` CHECK
-- constraint — it gains a value, it never loses one, so every row that
-- validated before still validates.
--
-- Two changes:
--
--  1. `connection_id` — upcoming_payments has always stored account_id
--     but never connection_id, while /api/money-hub/upcoming SELECTs
--     `connection_id` and applySpaceToTxnQuery() filters on it. That
--     select was failing with 42703 (column does not exist), which made
--     the whole upcoming endpoint return 500. Adding the column fixes
--     the read path and makes Space filtering work for this table the
--     same way it works for bank_transactions.
--
--  2. `predicted_income` source — recurring credits detected from
--     transaction history (salary, regular client payments, benefits).
--     Distinct from `predicted_recurring` (outgoings) so the UI can
--     label and the cron can prune them independently.

-- ── 1. connection_id ───────────────────────────────────────────────
ALTER TABLE upcoming_payments
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES bank_connections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_upcoming_connection
  ON upcoming_payments (connection_id, expected_date);

-- Backfill from bank_connections where the account is unambiguous.
-- account_ids is a text[] on bank_connections; match on containment.
UPDATE upcoming_payments up
SET connection_id = bc.id
FROM bank_connections bc
WHERE up.connection_id IS NULL
  AND bc.user_id = up.user_id
  AND bc.account_ids @> ARRAY[up.account_id];

-- ── 2. widen the source CHECK ──────────────────────────────────────
-- Adding an allowed value. Everything previously valid stays valid.
ALTER TABLE upcoming_payments
  DROP CONSTRAINT IF EXISTS upcoming_payments_source_check;

ALTER TABLE upcoming_payments
  ADD CONSTRAINT upcoming_payments_source_check
  CHECK (source = ANY (ARRAY[
    'pending_credit'::text,
    'pending_debit'::text,
    'scheduled_payment'::text,
    'standing_order'::text,
    'direct_debit'::text,
    'predicted_recurring'::text,
    'predicted_income'::text
  ]));

COMMENT ON COLUMN upcoming_payments.connection_id IS
  'Owning bank_connections row. Enables Space filtering on the upcoming feed.';

-- ── 3. make the deterministic upsert actually work ─────────────────
--
-- The cron has always upserted with
--   onConflict: 'user_id,account_id,source,yapily_resource_id'
-- but the only matching index, uniq_upcoming_deterministic, is PARTIAL
-- (WHERE yapily_resource_id IS NOT NULL). Postgres can only infer a
-- partial index when the statement repeats its predicate, and PostgREST
-- emits no predicate — so every upsert since this table shipped has
-- failed with 42P10 and the table has stayed empty. Verified against
-- production on 2026-08-16: 0 rows, and the cron's own business_log
-- entries show deterministicRowsUpserted: 0 with otherFailures: 10.
--
-- A NON-partial unique index over the same four columns is functionally
-- identical here — NULLs are distinct in a Postgres unique index, so
-- predicted rows (yapily_resource_id IS NULL) still never collide with
-- each other. The difference is that ON CONFLICT can infer it.
--
-- The old partial index is left in place. It is now redundant, but
-- dropping it buys nothing and this table is live.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_upcoming_deterministic_full
  ON upcoming_payments (user_id, account_id, source, yapily_resource_id);

-- Predicted rows deliberately get NO new index: the cron now replaces
-- them wholesale each run (delete the future window, insert fresh), so
-- stale predictions disappear instead of lingering until the date-based
-- prune. Predicted rows are never alerted on, so re-inserting them
-- daily can't produce duplicate notifications.
