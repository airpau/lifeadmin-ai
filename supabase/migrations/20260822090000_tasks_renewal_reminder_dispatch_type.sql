-- Add the `renewal_reminder_dispatch` task type so renewal-reminder DEDUP
-- rows can stop consuming the daily marketing EMAIL cap.
--
-- Root cause: `/api/cron/renewal-reminders` uses `tasks` rows of type
-- `renewal_reminder` for two unrelated jobs at once:
--
--   1. Dedup — "did we already cover the 30d/14d/7d window for this user
--      today?", keyed on `tasks.description`.
--   2. Cap accounting — `renewal_reminder` is in MARKETING_EMAIL_TYPES
--      (src/lib/email-rate-limit.ts), so every such row counts against
--      MAX_MARKETING_EMAILS_PER_DAY, currently 1.
--
-- The rows are written whenever ANY channel delivers
-- (`dispatchResult.delivered.length > 0`). So a Telegram-only or
-- WhatsApp-only renewal digest — including one where the email leg was
-- already suppressed because the user had hit the cap — still burns the
-- user's single daily email slot. Every later cron in the 08:00 block
-- (deal-alerts, targeted-deals, price-increases, contract-expiry-alerts)
-- is then blocked from emailing, to pay for an email that was never sent.
--
-- This is the follow-up PR#532 deliberately deferred: it fixed the same
-- "email cap mutes the Pocket Agent" defect in contract-expiry-alerts but
-- noted renewal-reminders "needs its dedup rows decoupled from the cap
-- rows first". This migration is that decoupling.
--
-- Fix: dedup rows move to `renewal_reminder_dispatch`, which is
-- deliberately NOT in MARKETING_EMAIL_TYPES and therefore never counted.
-- The counted `renewal_reminder` row is written once, and only when the
-- dispatcher reports an actual email delivery, via markEmailSent() — the
-- same pattern contract-expiry-alerts already uses.
--
-- Strictly additive: one new allowed value. Every previously valid value
-- stays valid, so existing rows keep validating and the cron's read path
-- accepts both the old and the new type during the transition.

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
      -- Dedup-only bookkeeping. Deliberately absent from
      -- MARKETING_EMAIL_TYPES: it records "this renewal window has been
      -- covered on some channel", which says nothing about whether an
      -- email was sent, so it must not consume an email cap slot.
      'renewal_reminder_dispatch',
      -- Transactional types that still write tasks for audit
      'welcome_email', 'ticket_reply', 'password_reset',
      'dispute_reminder_email',
      -- Meeting action-items inserted by the executive-meeting flow
      'meeting'
    ])
  );

COMMENT ON CONSTRAINT tasks_type_check ON public.tasks IS
  'Allowed task types. Types listed in MARKETING_EMAIL_TYPES (src/lib/email-rate-limit.ts) count towards the daily email cap; renewal_reminder_dispatch is dedup-only and must stay out of that list.';
