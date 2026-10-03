-- ============================================================
-- "Mark bill as paid" — the two tables the feature needs
--
-- Both tables were written in the 12 April 2026 batch, but the
-- migration history stops at 20260412000003: files 000005 and
-- 000006 were never applied, so neither table exists in the
-- database. Every write from either surface has failed since.
--
--   bill_paid_overrides   — Money Hub, per bill_key per month
--                           (20260412000006, section 1)
--   manual_bill_payments  — Telegram Pocket Agent mark_bill_paid,
--                           per provider per month (20260412000005)
--
-- The DDL below is copied from those two files unchanged, so
-- re-running the originals is a no-op. Additive only: no DROP,
-- no ALTER ... DROP. The rest of 000006 (the
-- auto_categorise_transactions rewrite) is deliberately NOT
-- replayed — it was superseded by
-- 20260417010000_restore_categorisation_pipeline.sql, which is
-- applied and is the current definition.
-- ============================================================


-- ─── bill_paid_overrides (Money Hub "Mark as paid") ──────────────────────────
CREATE TABLE IF NOT EXISTS bill_paid_overrides (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bill_key      TEXT NOT NULL,
  bill_month    TEXT NOT NULL,  -- format: 'YYYY-MM'
  marked_paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, bill_key, bill_month)
);

ALTER TABLE bill_paid_overrides ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS; guard it so this migration
-- stays re-runnable and cannot collide with the original file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bill_paid_overrides'
      AND policyname = 'Users manage own bill paid overrides'
  ) THEN
    CREATE POLICY "Users manage own bill paid overrides"
      ON bill_paid_overrides FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bill_paid_overrides_user_month
  ON bill_paid_overrides(user_id, bill_month);


-- ─── manual_bill_payments (Telegram mark_bill_paid) ──────────────────────────
-- Lets users manually mark an expected bill as paid when the payment
-- came from a bank account not connected to Paybacker (e.g. cash, another bank).
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
