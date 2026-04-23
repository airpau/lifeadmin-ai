-- Unified notification preferences: per event type, which channels
-- should deliver it. Replaces the scattered booleans across email
-- code paths + telegram_alert_preferences.
--
-- Design:
--   - One row per (user_id, event_type)
--   - Each row holds email + telegram + push flags
--   - Default = all channels enabled (matches existing behaviour
--     so nobody silently stops getting alerts)
--
-- Event types are deliberately string-typed (not an enum) so new
-- event types can be added without a migration. Canonical list is
-- maintained in src/lib/notifications/events.ts.
--
-- Quiet hours + preferred timezone live on `profiles` because they
-- apply globally across channels, not per-event.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  email boolean NOT NULL DEFAULT true,
  telegram boolean NOT NULL DEFAULT true,
  push boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON public.notification_preferences (user_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification prefs" ON public.notification_preferences;
CREATE POLICY "Users read own notification prefs"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notification prefs" ON public.notification_preferences;
CREATE POLICY "Users update own notification prefs"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Quiet hours at the user level. NULL start/end = 24/7 delivery OK.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS quiet_hours_start time,
  ADD COLUMN IF NOT EXISTS quiet_hours_end time,
  ADD COLUMN IF NOT EXISTS notification_timezone text DEFAULT 'Europe/London';

-- Backfill: copy existing telegram_alert_preferences so nobody
-- loses quiet hours when the new code starts reading profiles.
UPDATE public.profiles p
SET
  quiet_hours_start = COALESCE(p.quiet_hours_start, tap.quiet_start::time),
  quiet_hours_end   = COALESCE(p.quiet_hours_end, tap.quiet_end::time)
FROM public.telegram_alert_preferences tap
WHERE tap.user_id = p.id
  AND tap.quiet_start IS NOT NULL
  AND tap.quiet_end IS NOT NULL
  AND (p.quiet_hours_start IS NULL OR p.quiet_hours_end IS NULL);
