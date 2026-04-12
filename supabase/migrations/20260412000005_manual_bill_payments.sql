-- Manual Bill Payments — Telegram "mark as paid" feature
-- Lets users manually mark an expected bill as paid when the payment
-- came from a bank account not connected to Paybacker (e.g. cash, another bank).
-- The expected_bills handler checks this table alongside actual bank transactions.

CREATE TABLE IF NOT EXISTS manual_bill_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  amount DECIMAL(10, 2),
  paid_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT manual_bill_payments_unique UNIQUE (user_id, provider_name, year, month)
);

ALTER TABLE manual_bill_payments ENABLE ROW LEVEL SECURITY;
-- Bot uses service role key — no user-facing RLS policies needed.

CREATE INDEX IF NOT EXISTS idx_manual_bill_payments_user_month
  ON manual_bill_payments (user_id, year, month);
