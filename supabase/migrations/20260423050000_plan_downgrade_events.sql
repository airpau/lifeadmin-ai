-- Plan downgrade grace-period system.
--
-- When a user's tier drops (Stripe subscription ends / changes to a
-- cheaper plan) and they have more banks/emails than the new tier
-- allows, we open a grace-period event. Over 14 days the user can:
--   - Upgrade back (event resolved, nothing archived)
--   - Manually disconnect to get under the cap (event resolved)
--   - Do nothing — the cron auto-archives the overflow at T+14
--
-- Archived connections keep their transactions but stop syncing.
-- They can be re-activated by upgrading or manually reconnecting.

CREATE TABLE IF NOT EXISTS public.plan_downgrade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_tier text NOT NULL,
  to_tier text NOT NULL,
  downgraded_at timestamptz NOT NULL DEFAULT now(),
  grace_ends_at timestamptz NOT NULL,
  first_reminder_sent_at timestamptz,
  week_reminder_sent_at timestamptz,
  final_reminder_sent_at timestamptz,
  resolved_at timestamptz,
  resolution text CHECK (resolution IN ('upgraded_back', 'user_pruned', 'auto_archived', 'nothing_to_do')),
  snapshot jsonb NOT NULL DEFAULT '{}',
  archive_log jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Active events only — most queries filter by "is this user in a
-- grace period right now?" so a partial index keeps it cheap.
CREATE INDEX IF NOT EXISTS idx_plan_downgrade_active
  ON public.plan_downgrade_events (user_id)
  WHERE resolved_at IS NULL;

-- Second index for the daily cron's "whose grace ends today?" query.
CREATE INDEX IF NOT EXISTS idx_plan_downgrade_grace_end
  ON public.plan_downgrade_events (grace_ends_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.plan_downgrade_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own downgrade events" ON public.plan_downgrade_events;
CREATE POLICY "Users read own downgrade events"
  ON public.plan_downgrade_events FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service-role can insert / update rows (webhook + cron).

-- Archive flags on bank_connections. Sync crons should skip rows
-- where archived_at IS NOT NULL. Status stays 'active' so we don't
-- break the existing CHECK constraint; archived_at is the source of
-- truth for "is this connection paid-up".
ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

CREATE INDEX IF NOT EXISTS idx_bank_connections_active
  ON public.bank_connections (user_id, status)
  WHERE archived_at IS NULL;

-- Same treatment for email_connections.
ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

CREATE INDEX IF NOT EXISTS idx_email_connections_active
  ON public.email_connections (user_id, status)
  WHERE archived_at IS NULL;
