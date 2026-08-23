-- Balance sync opt-in for bank_connections.
--
-- bank_connections.current_balance / available_balance / balance_updated_at
-- were added by 20260406120000_add_bank_balance.sql and are read in six
-- places (MCP accounts route, Money Hub forecast + upcoming, report
-- generator, Telegram tool handlers) but NEVER written by any code path.
-- Every balance figure the product shows is therefore null.
--
-- Fetching them costs one extra GET /accounts per connection per sync
-- cycle. The bank-sync cron deliberately makes ZERO /accounts calls on a
-- healthy connection (account_ids acts as the cache, per Migle's guidance
-- on not re-polling a consent), so switching this on globally would add
-- ~6 Yapily calls/day/connection against the GLOBAL_DAILY_API_CEILING of
-- 500. This flag makes it opt-in per connection instead.
--
-- First consumer: the JPG Operations Ltd HSBC Business connection feeding
-- the énergie Fitness Hoddesdon weekly cash tracker, which needs a real
-- "available balance today" figure rather than asking Paul for it.
--
-- Strictly additive. No DROP, no ALTER-to-remove.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS balance_sync_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN bank_connections.balance_sync_enabled IS
  'When true, the bank-sync cron spends one extra GET /accounts per cycle to refresh current_balance / available_balance / balance_updated_at. Off by default because the cron otherwise makes zero /accounts calls on a healthy connection.';

-- Partial index: the balance-sync block only ever looks at enabled rows.
CREATE INDEX IF NOT EXISTS idx_bank_connections_balance_sync_enabled
  ON bank_connections (id)
  WHERE balance_sync_enabled = true;
