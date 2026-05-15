-- ============================================================
-- Drop the legacy (user_id, transaction_id) UNIQUE constraint on
-- bank_transactions and replace with a partial unique index that
-- only applies to non-soft-deleted rows (2026-05-15).
--
-- Backstory: the original 2026-03-21 open-banking migration added
--   UNIQUE(user_id, transaction_id)
-- when transaction_id was assumed stable across syncs. Yapily's
-- behaviour turned out to be the opposite — institutions reissue
-- transaction_ids, and the new stable_tx_hash partial unique index
-- (added 2026-04-27 Phase A) is now the authoritative dedup key.
--
-- The legacy constraint still bites in one specific failure mode:
-- when a user disconnects with mode=delete_transactions, rows are
-- soft-deleted (deleted_at IS NOT NULL). If Yapily later reissues
-- the same transaction_id for a fresh transaction after reconnect,
-- the legacy non-partial UNIQUE fires and the entire 500-row insert
-- batch in upsertYapilyTransactions errors out — silently dropping
-- today's legitimate new transactions along with the one collision.
--
-- Paul observed this 2026-05-15: bank sync ran 5× and the most
-- recent landed row was still 2026-05-13. The Vercel log at 16:00
-- UTC showed `[yapily.connection-store] insert batch failed`.
--
-- Fix: the partial stable_tx_hash unique on (user_id,
-- account_identifications_hash, stable_tx_hash) WHERE deleted_at
-- IS NULL is the new source of truth. We keep a partial
-- (user_id, transaction_id) unique on live rows only — that still
-- catches the rare case where a single Yapily call returns the
-- same transaction_id twice in one response, but lets a soft-
-- deleted row coexist with a fresh insert.
-- ============================================================

ALTER TABLE bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_user_id_transaction_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_user_tx_id_live_unique
  ON bank_transactions (user_id, transaction_id)
  WHERE deleted_at IS NULL;
