-- Let the two newest marketing emails persist their rate-limiter rows.
--
-- Root cause: `tasks_type_check` (last rebuilt in
-- 20260424030000_tasks_email_types.sql) is a closed whitelist. Any
-- `markEmailSent()` call whose type is missing from it raises a CHECK
-- violation, and `markEmailSent` only console.error()s the failure — so
-- the row silently never lands and `canSendEmail` keeps counting 0.
--
-- Two types drifted out of sync with `MARKETING_EMAIL_TYPES` in
-- src/lib/email-rate-limit.ts after that migration was written:
--
--   • 'daily_digest' — added when deal-alerts / targeted-deals /
--     price-increases were consolidated into ONE daily email. It is the
--     08:00 send, so its row is the one every later cron reads before
--     deciding whether it may send. Because the insert always failed,
--     the consolidated digest has never counted against the cap: 0 rows
--     of type 'daily_digest' exist in production, against 62
--     'renewal_reminder' rows written by the same helper. Every
--     marketing cron after 08:00 therefore still saw 0/1 and sent.
--     The digest's own 3-day deal-content dedup query
--     (`.in('type', ['deal_alert_email','daily_digest'])`) was reading
--     the same missing rows, so a replay could re-send deal content too.
--
--   • 'weekly_newsletter' — the Thu 11:00 cron never participated in the
--     cap at all; this migration is what lets it start recording sends.
--
-- Additive only: every previously-allowed value is retained verbatim, so
-- existing rows keep validating. No column or table is dropped.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_type_check CHECK (
    type = ANY (ARRAY[
      -- Original dispute-era task types
      'bill_dispute', 'complaint_letter', 'subscription_cancel',
      'refund_claim', 'price_negotiation', 'contract_review',
      'parking_appeal', 'insurance_claim', 'government_form',
      'cancellation_email', 'opportunity', 'other',
      'weekly_money_digest', 'energy_tariff_alert',
      -- Marketing-email tracking types (email-rate-limit.ts
      -- MARKETING_EMAIL_TYPES). Every new email cron must add its
      -- type here OR the rate limiter will fail silently.
      'deal_alert_email', 'targeted_deal_email', 'price_increase_alert',
      'renewal_reminder', 'churn_reengagement',
      'churn_inactive_7d', 'churn_inactive_14d', 'churn_pre_renewal',
      'founding_reminder', 'onboarding_email',
      'contract_expiry_alert', 'contract_end_alert',
      'overcharge_alert',
      -- Added 2026-08-14: consolidated daily digest (08:00) and the
      -- weekly newsletter (Thu 11:00).
      'daily_digest', 'weekly_newsletter',
      -- Transactional types that still write tasks for audit
      'welcome_email', 'ticket_reply', 'password_reset',
      'dispute_reminder_email',
      -- Meeting action-items inserted by the executive-meeting flow
      'meeting'
    ])
  );
