-- ============================================================
-- Disputes: add outcome_check_sent_at for T+7d outcome dedup
-- ============================================================
--
-- Background:
--   Paul flagged 2026-05-28 that the outcome_check WhatsApp nudge
--   (paybacker_outcome_check template) was being sent twice for the
--   same E.ON Next dispute — once at 01:00 BST (00:00 UTC) and again
--   at 07:00 BST (06:00 UTC). Both are scheduled whatsapp-alerts cron
--   runs (every 6h). The query window in
--   src/app/api/cron/whatsapp-alerts/route.ts is a 24h sliding window
--   [eightDaysAgo, sevenDaysAgo), so a dispute created in the 18h
--   overlap zone between two consecutive runs gets matched twice.
--
--   The existing dedup leans on notification_log
--   (unique on user_id, notification_type, reference_key) but the
--   pre-send `select … maybeSingle()` and post-send insert is
--   trivially racey and any silent insert failure (RLS, transient
--   network) leaks a second send.
--
--   This column is the canonical dedup: stamped directly on the
--   dispute row immediately after the first successful send, and
--   filtered in the cron query so re-sends never even reach the
--   send path. notification_log remains as belt-and-braces.
--
-- Safety:
--   * Strictly additive (ADD COLUMN IF NOT EXISTS).
--   * Partial index narrows the cron's hot probe — disputes with
--     outcome_check_sent_at IS NULL that haven't already been
--     archived. Matches the eligibility shape in
--     whatsapp-alerts/route.ts.
-- ============================================================

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS outcome_check_sent_at TIMESTAMPTZ;

-- Partial index so the cron's "needs outcome_check" probe stays cheap.
-- The 7/8-day created_at window is enforced in the cron's WHERE clause
-- (the predicate value can't depend on NOW()).
CREATE INDEX IF NOT EXISTS idx_disputes_outcome_check
  ON public.disputes (created_at)
  WHERE outcome_check_sent_at IS NULL
    AND archived_at IS NULL;

COMMENT ON COLUMN public.disputes.outcome_check_sent_at IS
  'Timestamp of the T+7d outcome-check WhatsApp/Telegram nudge sent '
  'to the user. NULL = never sent. The whatsapp-alerts cron filters '
  'on outcome_check_sent_at IS NULL so the nudge only ever fires once '
  'per dispute, regardless of how many cron runs land in the 24h '
  'eligibility window. Added 2026-05-28 after duplicate-send report.';
