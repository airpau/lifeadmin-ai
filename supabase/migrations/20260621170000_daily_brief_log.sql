-- Dedicated daily-brief page backing store (additive only).
--
-- Persists the exact morning brief that was sent to each user so the
-- "open for the full brief" link can land on a focused /dashboard/brief page
-- that shows precisely what the update contained, instead of the generic
-- dashboard. Written fire-and-forget from dispatchWhatsAppMorningBrief.

CREATE TABLE IF NOT EXISTS public.daily_brief_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  brief_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  body_markdown TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One brief per user per day; re-runs update in place (upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_brief_user_date
  ON public.daily_brief_log (user_id, brief_date);
CREATE INDEX IF NOT EXISTS idx_daily_brief_user
  ON public.daily_brief_log (user_id, brief_date DESC);

ALTER TABLE public.daily_brief_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'daily_brief_log'
      AND policyname = 'dbl_owner_read'
  ) THEN
    CREATE POLICY dbl_owner_read ON public.daily_brief_log
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
