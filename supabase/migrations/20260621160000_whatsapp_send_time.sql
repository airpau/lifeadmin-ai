-- Phase 2 — WhatsApp send-time optimisation (additive only).
--
-- Defers non-urgent, non-critical WhatsApp alerts to each user's learned best
-- engagement hour. preferred_alert_hour already exists on
-- user_intelligence_profile (integer 0-23); this adds the deferral queue + a
-- set-based learner that derives the best hour from the intelligence ledger.

-- Deferral queue: a held alert waiting for the user's preferred hour.
CREATE TABLE IF NOT EXISTS public.whatsapp_alert_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  event_type    TEXT NOT NULL,
  template_name TEXT,
  payload       JSONB NOT NULL,                  -- the WhatsAppPayload to re-send
  release_after TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | sent | cancelled
  dedup_key     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_waq_due
  ON public.whatsapp_alert_queue (status, release_after)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_waq_user
  ON public.whatsapp_alert_queue (user_id, created_at DESC);
-- Never queue the same event twice while one is still pending.
CREATE UNIQUE INDEX IF NOT EXISTS uq_waq_pending_dedup
  ON public.whatsapp_alert_queue (user_id, dedup_key)
  WHERE status = 'pending' AND dedup_key IS NOT NULL;

ALTER TABLE public.whatsapp_alert_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_alert_queue'
      AND policyname = 'waq_owner_read'
  ) THEN
    CREATE POLICY waq_owner_read ON public.whatsapp_alert_queue
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Learner: for each user, pick the send-hour with the highest engagement rate
-- (acted/sent) over the last 60 days, among hours with >= min_samples sends,
-- and write it to user_intelligence_profile.preferred_alert_hour. Set-based +
-- idempotent — safe to run daily.
CREATE OR REPLACE FUNCTION public.update_preferred_alert_hours(min_samples INT DEFAULT 8)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_count INT;
BEGIN
  WITH per_hour AS (
    SELECT user_id,
           (predicted->>'hour_london')::int AS hr,
           count(*) AS sent,
           count(*) FILTER (WHERE outcome_kind = 'action_taken') AS acted
    FROM public.intelligence_events
    WHERE action_kind = 'alert_sent'
      AND subject_kind = 'alert_template'
      AND user_id IS NOT NULL
      AND predicted ? 'hour_london'
      AND emitted_at > now() - interval '60 days'
    GROUP BY user_id, (predicted->>'hour_london')::int
  ),
  ranked AS (
    SELECT user_id, hr,
           row_number() OVER (
             PARTITION BY user_id
             ORDER BY (acted::numeric / NULLIF(sent, 0)) DESC NULLS LAST, sent DESC
           ) AS rn
    FROM per_hour
    WHERE sent >= min_samples
  )
  INSERT INTO public.user_intelligence_profile (user_id, preferred_alert_hour, last_updated_at)
  SELECT user_id, hr, now() FROM ranked WHERE rn = 1
  ON CONFLICT (user_id)
  DO UPDATE SET preferred_alert_hour = EXCLUDED.preferred_alert_hour,
                last_updated_at = now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END $$;
