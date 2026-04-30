-- Soft-delete flag for bank connections.
--
-- `disconnect` marks a connection as `status='revoked'` for audit, but the
-- row still shows up in the Telegram bot (see get_bank_connections tool)
-- because hard-deleting would CASCADE-kill bank_transactions — we'd lose
-- historical spending data.
--
-- `deleted_at` gives the user a way to permanently hide a connection
-- (typically a sandbox/test connection they never want to see again)
-- without destroying the transaction history it anchors.

ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index: most queries filter deleted_at IS NULL, so a narrow index
-- of live rows keeps list lookups fast without bloating on soft-deleted rows.
CREATE INDEX IF NOT EXISTS bank_connections_live_user_idx
  ON bank_connections (user_id)
  WHERE deleted_at IS NULL;
