-- Adds account_id + account_display_name to disconnect audit so per-account
-- disconnect actions are distinguishable from full-connection ones.
-- account_id is the provider-scoped id (matches bank_transactions.account_id);
-- account_display_name captures the user-facing name at the moment of action
-- so it survives later edits to bank_connections.account_display_names.
--
-- Applied to prod 2026-04-27 via mcp__claude_ai_Supabase__apply_migration.
ALTER TABLE bank_disconnect_audit
  ADD COLUMN IF NOT EXISTS account_id TEXT,
  ADD COLUMN IF NOT EXISTS account_display_name TEXT;
