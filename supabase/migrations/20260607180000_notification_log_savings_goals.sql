-- 20260607180000_notification_log_savings_goals.sql
--
-- Two tables that Phase 2 cron code (2026-05-28) referenced but never
-- existed in production. Without them the dedup logic + savings-milestone
-- detection silently no-op every run. Per the project rule, strictly
-- additive — CREATE TABLE IF NOT EXISTS only.

-- ── notification_log ─────────────────────────────────────────────
-- Generic dedup ledger for any cron that needs "have I already sent
-- this notification?" lookups. Reference_key is the dedup primary —
-- callers compose it from (notification_type, entity_id, date).
CREATE TABLE IF NOT EXISTS public.notification_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type   text NOT NULL,
  reference_key       text NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_type
  ON public.notification_log (user_id, notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_type_created
  ON public.notification_log (notification_type, created_at DESC);

COMMENT ON TABLE public.notification_log IS
  'Generic per-notification dedup ledger. Cron writers insert one row per (reference_key) before sending; the UNIQUE constraint prevents double-sends across cron retries / overlap windows. Reference keys conventionally encode (notification_type, entity_id, date) so callers can scope dedup per-day or per-event.';


-- ── savings_goals ────────────────────────────────────────────────
-- User-set savings goals. The Pocket Agent tools (get_savings_goals,
-- create_savings_goal, update_savings_goal, delete_savings_goal) plus
-- the savings_goal_milestone detector reference this table.
CREATE TABLE IF NOT EXISTS public.savings_goals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  target_amount       numeric(12,2) NOT NULL,
  current_amount      numeric(12,2) NOT NULL DEFAULT 0,
  target_date         date,
  category            text,
  icon                text,
  notes               text,
  is_active           boolean NOT NULL DEFAULT true,
  achieved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT savings_goals_target_amount_positive
    CHECK (target_amount > 0),
  CONSTRAINT savings_goals_current_amount_nonnegative
    CHECK (current_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_savings_goals_user_active
  ON public.savings_goals (user_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_savings_goals_progress
  ON public.savings_goals (user_id, current_amount, target_amount);

COMMENT ON TABLE public.savings_goals IS
  'User-set savings goals tracked by the Money Hub UI + the Pocket Agent tool registry. Used by the savings_goal_milestone detector in /api/cron/whatsapp-daily-checks to fire paybacker_savings_goal_milestone when a goal crosses 25/50/75/100% funded.';

-- RLS — same shape as the rest of the per-user tables in the app
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'savings_goals'
      AND policyname = 'savings_goals_owner_select'
  ) THEN
    CREATE POLICY savings_goals_owner_select
      ON public.savings_goals FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'savings_goals'
      AND policyname = 'savings_goals_owner_insert'
  ) THEN
    CREATE POLICY savings_goals_owner_insert
      ON public.savings_goals FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'savings_goals'
      AND policyname = 'savings_goals_owner_update'
  ) THEN
    CREATE POLICY savings_goals_owner_update
      ON public.savings_goals FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'savings_goals'
      AND policyname = 'savings_goals_owner_delete'
  ) THEN
    CREATE POLICY savings_goals_owner_delete
      ON public.savings_goals FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END$do$;
