-- Migration: Track reconnect events on bank_connections
-- Adds reconnected_at (timestamp of most recent reconnect) and reconnect_count
-- so gap audits are possible without querying bank_sync_log.
--
-- NOTE: connected_at now preserves the ORIGINAL connection date.
-- The callback route previously overwrote connected_at on every reconnect;
-- after this change it only sets connected_at when the row is first inserted.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS reconnected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconnect_count  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN bank_connections.reconnected_at IS
  'Timestamp of the most recent OAuth reconnect (null for connections that have never expired and been re-authorised).';

COMMENT ON COLUMN bank_connections.reconnect_count IS
  'How many times the user has had to re-authorise this connection after an expiry.';

COMMENT ON COLUMN bank_connections.connected_at IS
  'Timestamp of the ORIGINAL connection — never overwritten on reconnect. Use reconnected_at for the latest re-auth date.';
