-- 7-day payment-grace columns on profiles.
--
-- Flow:
--   1. Stripe `invoice.payment_failed` webhook sets past_due_grace_ends_at
--      to NOW() + 7d (only if not already set — Stripe fires multiple
--      invoice.payment_failed events as it retries) and timestamps the
--      first warning send.
--   2. Daily cron `process-payment-grace`:
--        - 3 days before grace_ends_at: send final warning, set
--          past_due_final_warning_sent_at.
--        - After grace_ends_at: demote tier to 'free', clear all three
--          columns, then call openDowngradeEvent() to archive bank/email
--          overage (data preserved via archived_at, never deleted).
--   3. Stripe `invoice.payment_succeeded` clears all three columns and
--      restores subscription_status='active'.
--   4. `customer.subscription.deleted` continues to demote immediately
--      (existing behaviour) and clears the grace columns as a side effect.
--
-- Per CLAUDE.md "Paid tiers are never auto-demoted. Demotion is webhook-
-- driven" — the cron acts as a deferred webhook reaction once the user
-- has had their 7 days to update their card. Auto-retry (Stripe Smart
-- Retries) sits in front of this so most accounts recover before the
-- grace expires; the demotion only fires on persistent non-payment.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS past_due_grace_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS past_due_warning_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS past_due_final_warning_sent_at TIMESTAMPTZ;

-- Cron query is `WHERE past_due_grace_ends_at IS NOT NULL` so a partial
-- index keeps the scan tight even at 100k+ profiles.
CREATE INDEX IF NOT EXISTS profiles_past_due_grace_ends_at_idx
  ON profiles (past_due_grace_ends_at)
  WHERE past_due_grace_ends_at IS NOT NULL;

COMMENT ON COLUMN profiles.past_due_grace_ends_at IS
  '7-day deadline to update card before tier auto-demotes to free. Set by invoice.payment_failed webhook, cleared by invoice.payment_succeeded or by the demotion cron.';
COMMENT ON COLUMN profiles.past_due_warning_sent_at IS
  'Timestamp of the first "card declined" notification sent to the user. Prevents the webhook from firing duplicate warnings on each Stripe retry attempt.';
COMMENT ON COLUMN profiles.past_due_final_warning_sent_at IS
  'Timestamp of the T-3 final warning sent by process-payment-grace cron. Prevents the cron from re-sending on subsequent runs before grace expiry.';
