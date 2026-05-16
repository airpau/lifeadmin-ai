-- 2026-05-16: widen telegram_pending_actions.action_type CHECK constraint
--
-- Background: the daily-audit cron (added 2026-05-15) writes one
-- telegram_pending_actions row per fixable audit finding so the Telegram
-- button taps in the webhook know what to dispatch. The original CHECK
-- constraint (from 20260402030000_telegram_user_bot.sql) only allows
-- `'dispute_letter'`, which rejects every audit-action id and fails the
-- whole cron run. This widens the constraint to cover the audit actions
-- registered in src/lib/daily-audit.ts and dispatched by
-- src/app/api/telegram/audit-actions/route.ts.
--
-- Strictly additive: only the allow-list widens, no data is touched.

ALTER TABLE telegram_pending_actions
  DROP CONSTRAINT IF EXISTS telegram_pending_actions_action_type_check;

ALTER TABLE telegram_pending_actions
  ADD CONSTRAINT telegram_pending_actions_action_type_check
  CHECK (action_type IN (
    'dispute_letter',
    'fix_reappearing_dismissed_alerts',
    'fix_backfill_recovered_gbp',
    'clear_won_dispute_unread_counts',
    'compliance_ack_no_content',
    'compliance_review_dead_urls',
    'compliance_stale_refs',
    'compliance_review_candidates'
  ));
