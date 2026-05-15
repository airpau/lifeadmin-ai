-- Tracks payment alerts the /api/cron/payment-alerts route has sent so it
-- can dedup across runs. Two alert types:
--   upcoming_payment  — recurring debit due in next 1-3 days, balance < 1.2× expected
--   large_debit       — single debit ≥ £100 just posted
--
-- Money-in ("large_credit") alerts are owned by /api/cron/income-received
-- and use that route's own notification_log dedup, not this table.
--
-- Dedup keys:
--   upcoming_payment: (user_id, merchant, due_date)
--   large_debit:      (user_id, transaction_id)

CREATE TABLE IF NOT EXISTS payment_alerts_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('upcoming_payment', 'large_debit')),
  transaction_id UUID REFERENCES bank_transactions(id) ON DELETE CASCADE,
  merchant TEXT,
  amount NUMERIC,
  due_date DATE,
  balance_at_send NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_alerts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users view own payment alerts" ON payment_alerts_log
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_payment_alerts_log_user_recent
  ON payment_alerts_log(user_id, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_alerts_upcoming
  ON payment_alerts_log(user_id, merchant, due_date)
  WHERE alert_type = 'upcoming_payment';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_alerts_large_debit
  ON payment_alerts_log(user_id, transaction_id)
  WHERE alert_type = 'large_debit';
