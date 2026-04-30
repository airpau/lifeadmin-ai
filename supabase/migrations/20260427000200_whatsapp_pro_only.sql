-- WhatsApp Pocket Agent → Pro-only tier gating (decided 2026-04-27).
--
-- Per CLAUDE.md additive-only rule: no DROP / ALTER-DROP. We add one column
-- to whatsapp_sessions to track whether we've already nudged a non-Pro user
-- about the upgrade — prevents spamming Free / Essential users every time
-- they message us.
--
-- Tier policy enforced at the application layer (canUseWhatsApp in
-- src/lib/plan-limits.ts) at three points:
--   1. /api/whatsapp/opt-in            → 403 if non-Pro
--   2. /api/whatsapp/webhook (POST)    → one-time upgrade nudge if non-Pro
--   3. /api/cron/whatsapp-alerts (GET) → filter recipients to Pro-only
--
-- Telegram remains free-tier accessible (Telegram API has no per-message
-- cost on our side).

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS upgrade_nudge_sent_at TIMESTAMPTZ;

-- Backfill: existing rows are pre-Pro-gate. Treat them as not-yet-nudged so
-- the first inbound after this migration reaches them with the upgrade
-- message (one-time, then suppressed).
-- (Default NULL is the right backfill — no UPDATE needed.)

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_nudge
  ON whatsapp_sessions(upgrade_nudge_sent_at)
  WHERE upgrade_nudge_sent_at IS NULL;

COMMENT ON COLUMN whatsapp_sessions.upgrade_nudge_sent_at IS
  'When we sent the one-time "WhatsApp is Pro-only" upgrade nudge. NULL = not yet nudged. Set the first time a non-Pro user inbound-messages us inside the 24h session window. After this is set we silently log inbounds without replying, until they upgrade.';
