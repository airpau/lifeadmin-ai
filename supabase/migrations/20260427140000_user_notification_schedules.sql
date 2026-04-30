-- User-configurable notification schedules (decided 2026-04-27).
--
-- Lets users tell their Pocket Agent — in plain English over Telegram or
-- WhatsApp — when and how they want scheduled alerts to fire.
-- Example: "send me a morning summary at 9am every day"
-- → Claude inside the Pocket Agent calls set_notification_schedule({
--     event: 'morning_summary',
--     cron_expression: '0 9 * * *',
--     custom_prompt: ...
--   })
-- This row then OVERRIDES the default cron schedule for that event.
--
-- Three categories of events as far as scheduling goes (enforced by the
-- application — see src/lib/notifications/events.ts:user_schedulable):
--
--   schedulable:    user controls timing + (Pro) prompt
--                   morning/evening/payday/weekly/monthly summaries,
--                   budget thresholds
--   lead_time:      user controls days-before triggers
--                   renewal_reminder, contract_expiry, dispute_reminder
--   system_managed: user can ONLY enable/disable
--                   price_increase, dispute_reply, money_recovered,
--                   overcharge, unusual_charge, savings_milestone,
--                   support_reply, new_opportunity
--
-- Critical events (`critical: true` in the catalog — money_recovered,
-- dispute_reply, overcharge_detected, savings_milestone, price_increase)
-- can NEVER be disabled regardless of category. They're protective alerts
-- — disabling them would defeat the value prop.
--
-- Tier matrix:
--   free:      cannot create custom schedules; sees defaults only
--   essential: can customise timing on schedulable events; lead_time on
--              lead_time events
--   pro:       all of essential + custom prompts (`custom_prompt`)

CREATE TABLE IF NOT EXISTS public.user_notification_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,

  schedule_kind text NOT NULL CHECK (schedule_kind IN (
    'cron',       -- fires at a fixed cron expression in user's timezone
    'lead_time',  -- fires N days before a date trigger
    'threshold',  -- fires when a metric crosses a threshold
    'always_on'   -- system-managed; user can only enable/disable
  )),

  -- For schedule_kind = 'cron'
  cron_expression text,
  cron_timezone   text DEFAULT 'Europe/London',

  -- For schedule_kind = 'lead_time' (e.g. ARRAY[30,14,7] for renewal)
  lead_time_days int[],

  -- For schedule_kind = 'threshold' (e.g. {"value": 80, "unit": "percent"})
  threshold jsonb,

  -- Optional Pro feature: bias the agent's response style for this event.
  -- Example: "Keep it punchy, focus on what's overspending."
  custom_prompt text,

  -- Per-schedule channel override. NULL = use the user's per-event prefs
  -- in notification_preferences. JSONB: { telegram: bool, whatsapp: bool,
  -- email: bool, push: bool }
  channel_overrides jsonb,

  -- On / off without losing the configuration. The user can flip this
  -- via "pause my morning summary" without us forgetting their 9am time.
  enabled boolean NOT NULL DEFAULT true,

  -- Tracks who created the row so we know whether it overrides default
  -- behaviour. 'user_chat' rows always override; 'default' rows are
  -- seed data for the UI.
  source text NOT NULL DEFAULT 'user_chat'
    CHECK (source IN ('user_chat', 'user_ui', 'default', 'admin')),

  -- Idempotency for the agent: if the user says "morning summary at 9am"
  -- twice, we update the existing row rather than insert a duplicate.
  -- Multiple schedules per (user, event) are allowed for Pro (e.g. two
  -- daily check-ins), so the unique key is on (user, event, source).
  -- For source='user_chat' we keep one row per (user, event) — the
  -- latest-named replaces the previous.
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  last_fired_at timestamptz,
  last_fired_status text,

  -- For 'cron' schedules: dedup key per (minute, day) so we don't double-fire
  -- if the cron sweeper runs more than once in a minute.
  last_fired_dedup_key text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notif_schedules_chat
  ON public.user_notification_schedules(user_id, event_type)
  WHERE source = 'user_chat';

CREATE INDEX IF NOT EXISTS idx_user_notif_schedules_user
  ON public.user_notification_schedules(user_id, enabled);

CREATE INDEX IF NOT EXISTS idx_user_notif_schedules_event_type
  ON public.user_notification_schedules(event_type, enabled);

ALTER TABLE public.user_notification_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own schedules" ON public.user_notification_schedules;
CREATE POLICY "Users read own schedules"
  ON public.user_notification_schedules FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own schedules" ON public.user_notification_schedules;
CREATE POLICY "Users write own schedules"
  ON public.user_notification_schedules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.user_notification_schedules IS
  'User-configurable notification schedules set conversationally via the Pocket Agent (or via the settings UI). One row per (user, event) for source=user_chat overrides the default cron schedule for that event.';

COMMENT ON COLUMN public.user_notification_schedules.schedule_kind IS
  'cron|lead_time|threshold|always_on. Constrains which other columns are populated and how the dispatcher reads this row.';

COMMENT ON COLUMN public.user_notification_schedules.custom_prompt IS
  'Pro-only field. A natural-language style preference passed to the Claude system prompt when generating this notification, e.g. "Keep it punchy, focus on overspending."';
