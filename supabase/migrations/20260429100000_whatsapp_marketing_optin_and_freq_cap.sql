-- Marketing opt-in + frequency cap fields for whatsapp_sessions.
--
-- Why:
--   Meta re-categorised 5 of our approved templates from UTILITY to
--   MARKETING on approval (welcome, alert_renewal, morning_summary,
--   savings_goal_milestone, recovery_total_weekly). Marketing
--   conversations cost ~6x utility on Meta's UK tariff (~£0.05 vs
--   ~£0.009) AND require a separate marketing opt-in per Meta's
--   commerce policy. Sending marketing templates without explicit
--   opt-in puts our WABA quality rating at risk and starts double-
--   billing us at marketing rates.
--
-- New columns:
--   marketing_opt_in_at — timestamp the user explicitly granted
--     marketing template consent. NULL means "no marketing
--     templates may be sent". The dispatch helper checks this
--     before sending any MARKETING-category template.
--   last_marketing_template_at — when we last opened a marketing
--     conversation with this user. Used by the 24h frequency cap
--     in dispatch.ts (max 1 marketing template per user per 24h).
--
-- Both are additive and nullable. No backfill needed — existing
-- users default to opted-OUT of marketing and we'll surface a
-- one-time tickbox in the connect flow + settings.
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_marketing_template_at timestamptz;

CREATE INDEX IF NOT EXISTS whatsapp_sessions_marketing_opt_in_idx
  ON whatsapp_sessions (marketing_opt_in_at)
  WHERE marketing_opt_in_at IS NOT NULL;

COMMENT ON COLUMN whatsapp_sessions.marketing_opt_in_at IS
  'Timestamp the user granted explicit marketing-template consent. NULL = no marketing sends allowed. Required before any MARKETING-category Meta template send.';
COMMENT ON COLUMN whatsapp_sessions.last_marketing_template_at IS
  'When we last opened a marketing conversation with this user. Drives the 1-marketing-template-per-24h frequency cap in dispatch.ts.';
