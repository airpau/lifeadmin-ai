-- ============================================================
-- Disputes: add stall_alert_sent_at for 14-day stall alerts
-- ============================================================
--
-- Background:
--   The dispute-letter-followup cron (every 30 min) is being extended
--   to detect disputes that have been sitting in 'open',
--   'awaiting_user_input', or 'draft' for 14+ days with no movement,
--   and nudge the user via WhatsApp (falls back to Telegram if the
--   user's Pocket Agent channel is Telegram).
--
--   To avoid hammering the user every 30 min once they cross the 14-day
--   threshold, the cron dedups on `stall_alert_sent_at`. After we fire
--   a nudge we stamp `NOW()` here; subsequent runs only re-alert when
--   the stamp is null OR >7 days old (so a still-stalled dispute gets a
--   weekly poke until the user acts).
--
-- Safety:
--   * Strictly additive (ADD COLUMN IF NOT EXISTS).
--   * Index narrows the cron's hot query (open/awaiting/draft +
--     stall_alert_sent_at IS NULL/old + updated_at < 14d ago) without
--     touching existing dispute reads.
-- ============================================================

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS stall_alert_sent_at TIMESTAMPTZ;

-- Partial index so the cron's "needs alert" probe stays cheap even as
-- the disputes table grows. The 14-day threshold is enforced in the
-- WHERE clause of the cron query (we don't bake it into the index
-- predicate because the predicate value can't depend on NOW()).
--
-- The stall-prone state set spans BOTH `status` (open) and `agent_state`
-- (draft, awaiting_user_input) — the disputes table uses two columns:
-- `status` is the user-visible lifecycle and `agent_state` is the
-- dispute-agent state machine (see 20260501100000_dispute_agent.sql).
-- The index covers the union via the OR predicate.
CREATE INDEX IF NOT EXISTS idx_disputes_stall_alert
  ON public.disputes (updated_at)
  WHERE stall_alert_sent_at IS NULL
    AND archived_at IS NULL
    AND (
      status = 'open'
      OR agent_state IN ('draft', 'awaiting_user_input')
    );

COMMENT ON COLUMN public.disputes.stall_alert_sent_at IS
  'Timestamp of the last 14-day stall WhatsApp/Telegram nudge sent to '
  'the user. NULL = never alerted. Dispute-letter-followup cron re-alerts '
  'when stall_alert_sent_at is NULL or older than 7 days, so a user who '
  'lets a stalled dispute sit gets at most one nudge per week. Added '
  '2026-05-17.';
