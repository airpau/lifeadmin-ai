ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS current_balance NUMERIC;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS available_balance NUMERIC;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS is_pending BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_pending ON bank_transactions(user_id, is_pending) WHERE is_pending = true;
