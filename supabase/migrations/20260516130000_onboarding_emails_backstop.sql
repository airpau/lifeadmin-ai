-- 2026-05-16: onboarding_emails backstop
--
-- The onboarding_emails table is referenced by four crons:
--   - /api/cron/onboarding-emails
--   - /api/cron/email-monitor
--   - /api/cron/churn-prevention (three insert sites)
-- but no `CREATE TABLE` migration ships in this repo. The table almost
-- certainly exists in prod (created out-of-band via the Supabase
-- dashboard) — without this backstop, a fresh `supabase db reset` would
-- break those crons immediately. This migration is idempotent so it's
-- a no-op against the existing prod table.
--
-- Shape mirrors every existing call site: every insert uses
-- (user_id, email_key) — see e.g. src/app/api/cron/onboarding-emails/
-- route.ts:77.

CREATE TABLE IF NOT EXISTS onboarding_emails (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, email_key)
);

ALTER TABLE onboarding_emails ENABLE ROW LEVEL SECURITY;
-- Service role only — crons run with service-role key.

CREATE INDEX IF NOT EXISTS idx_onboarding_emails_user
  ON onboarding_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_emails_sent_at
  ON onboarding_emails(sent_at DESC);
