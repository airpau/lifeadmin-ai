-- Per-user money-in / upcoming-bill alert thresholds.
--
-- Adds two columns to profiles so users can configure their personal
-- numbers without us shipping new code each time. Defaults match the
-- product spec:
--   money_received_min_amount  £10     — quietly skip dust transactions
--   upcoming_bill_threshold    £100    — only flag bills "large" above this
--   upcoming_bill_days_ahead   7 days  — how far out to alert
--
-- Columns are nullable so existing rows continue to use defaults at the
-- application layer until the user explicitly opts a value.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS money_received_min_amount numeric(12,2)
    DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS upcoming_bill_threshold numeric(12,2)
    DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS upcoming_bill_days_ahead integer
    DEFAULT 7;

COMMENT ON COLUMN public.profiles.money_received_min_amount IS
  'Minimum credit amount (£) before money_received alert fires. NULL = use app default (£10).';

COMMENT ON COLUMN public.profiles.upcoming_bill_threshold IS
  'Minimum scheduled payment amount (£) before large_upcoming_bill alert fires. NULL = use app default (£100).';

COMMENT ON COLUMN public.profiles.upcoming_bill_days_ahead IS
  'How many days ahead to scan for large upcoming bills. NULL = use app default (7).';

-- Per-transaction dedup marker for money-in alerts. Lives on
-- bank_transactions so the sync loop can scan only un-alerted credits.
-- Nullable; stamped with now() the first time an alert fires (or is
-- skipped as a transfer, so we don't re-check the same row forever).
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS alerted_money_in_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_money_in_pending
  ON public.bank_transactions (user_id, created_at)
  WHERE alerted_money_in_at IS NULL
    AND signed_amount_pence > 0
    AND deleted_at IS NULL;

