-- 20260423000000_upcoming_payments.sql
--
-- "Upcoming Payments" feature — stores the unified next 7/14/30 day feed
-- across four deterministic Yapily endpoints (scheduled-payments,
-- periodic-payments, direct-debits, pending transactions) plus
-- prediction rows from the recurrence detector.
--
-- Additive only: CREATE TABLE IF NOT EXISTS, no DROP / ALTER-drop.

CREATE TABLE IF NOT EXISTS upcoming_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'pending_credit',
    'pending_debit',
    'scheduled_payment',
    'standing_order',
    'direct_debit',
    'predicted_recurring'
  )),
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  counterparty TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'GBP',
  expected_date DATE NOT NULL,
  confidence NUMERIC(3, 2),  -- 1.00 for deterministic (OB endpoints), <1.0 for predicted
  yapily_resource_id TEXT,   -- Yapily's id for scheduled/periodic/DD resources
  yapily_provider_id TEXT,   -- bank_connections.provider_id
  raw JSONB,                 -- full upstream payload for debugging
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Fast lookup per user for the UI feed.
CREATE INDEX IF NOT EXISTS idx_upcoming_user_date
  ON upcoming_payments(user_id, expected_date);

-- Dedupe key for upsert on the deterministic path: (user_id,
-- account_id, source, yapily_resource_id). Used by sync-upcoming.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_upcoming_deterministic
  ON upcoming_payments(user_id, account_id, source, yapily_resource_id)
  WHERE yapily_resource_id IS NOT NULL;

-- Dedupe key for predicted rows where we have no upstream id —
-- counterparty + expected_date + amount + account is the natural key.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_upcoming_predicted
  ON upcoming_payments(user_id, account_id, source, counterparty, expected_date, amount)
  WHERE yapily_resource_id IS NULL;

-- ── RLS ──
ALTER TABLE upcoming_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'upcoming_payments'
      AND policyname = 'upcoming_payments_select_own'
  ) THEN
    CREATE POLICY upcoming_payments_select_own
      ON upcoming_payments
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'upcoming_payments'
      AND policyname = 'upcoming_payments_modify_own'
  ) THEN
    -- The sync cron runs with the service role so this policy only
    -- governs direct user-context writes (e.g. a future "dismiss row"
    -- UX). Service role bypasses RLS for the cron path.
    CREATE POLICY upcoming_payments_modify_own
      ON upcoming_payments
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- Keep updated_at fresh on every update.
CREATE OR REPLACE FUNCTION touch_upcoming_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_upcoming_payments_touch'
  ) THEN
    CREATE TRIGGER trg_upcoming_payments_touch
      BEFORE UPDATE ON upcoming_payments
      FOR EACH ROW
      EXECUTE FUNCTION touch_upcoming_payments_updated_at();
  END IF;
END$$;
