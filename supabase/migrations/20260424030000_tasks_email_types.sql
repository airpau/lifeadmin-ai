-- Widen the tasks table CHECK constraints so the daily email-rate
-- limiter can actually persist rows.
--
-- Root cause: `src/lib/email-rate-limit.ts` writes a row to `tasks`
-- after every successful marketing email send so `canSendEmail` can
-- count them the next time a cron runs. The table was carrying old
-- CHECK constraints that only whitelisted dispute-era task types
-- (`bill_dispute`, `complaint_letter`, etc.) plus a handful of
-- status values (`pending_review`, `in_progress`, ...) — NONE of the
-- marketing email types or the `completed` status the limiter writes
-- were allowed.
--
-- Every insert has been silently failing (Supabase logs the error
-- but the cron swallows it), which meant canSendEmail saw 0
-- marketing sends today for every user and approved every cron in
-- sequence. The founder received three emails at 09:00 BST as a
-- result (two separate renewal-reminder windows + a price-increase
-- alert) when the limiter was supposed to cap the total at one.
--
-- Fix: drop both CHECK constraints and replace them with supersets
-- that cover:
--   • every email type in `MARKETING_EMAIL_TYPES` (email-rate-limit.ts)
--   • every status value the rate limiter + sync-runner write
--   • every original value that was already allowed (so existing
--     rows keep validating)

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
      -- Transactional types that still write tasks for audit
      'welcome_email', 'ticket_reply', 'password_reset',
      'dispute_reminder_email',
      -- Meeting action-items inserted by the executive-meeting flow
      'meeting'
    ])
  );

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check CHECK (
    status = ANY (ARRAY[
      -- Original dispute-era statuses
      'pending_review', 'in_progress', 'awaiting_response',
      'resolved_success', 'resolved_partial', 'resolved_failed',
      'escalated', 'cancelled', 'approved', 'dismissed',
      -- Generic state the email rate limiter writes on every send
      'completed',
      -- Used by the meeting action-item inserts
      'pending', 'in_review'
    ])
  );
