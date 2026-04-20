-- Allow 'reconnect' as a valid trigger_type in bank_sync_log.
-- The original constraint only covered ('cron', 'manual', 'initial').
-- The TrueLayer reconnect callback now writes trigger_type = 'reconnect'
-- to distinguish re-auth syncs from first-connect syncs in audit queries.

ALTER TABLE bank_sync_log
  DROP CONSTRAINT IF EXISTS bank_sync_log_trigger_type_check;

ALTER TABLE bank_sync_log
  ADD CONSTRAINT bank_sync_log_trigger_type_check
  CHECK (trigger_type IN ('cron', 'manual', 'initial', 'reconnect'));
