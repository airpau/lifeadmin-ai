-- =============================================================================
-- Dispute ⇄ Email Thread Auto-Sync ("Watchdog")
-- =============================================================================
-- Feature branch: feature/watchdog-email-sync
-- Plan: docs/DISPUTE_EMAIL_SYNC_PLAN.md
-- Drafted: 19 April 2026
--
-- Adds the ability to link a dispute to an email thread in the user's connected
-- inbox (Gmail / Outlook / IMAP) so that supplier replies are auto-imported into
-- the dispute's correspondence timeline.
--
-- ALL CHANGES ADDITIVE. No DROP. No destructive ALTER. Safe to deploy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. dispute_watchdog_links
-- One row per (dispute, linked email thread). A dispute can have at most one
-- active linked thread at a time (enforced in application code via unique
-- constraint on dispute_id WHERE sync_enabled=true), but history is preserved
-- when the user relinks.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispute_watchdog_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_connection_id UUID REFERENCES email_connections(id) ON DELETE SET NULL,

  -- Which provider the thread lives in
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),

  -- Provider-native thread identifier:
  --   gmail  -> threadId from users.threads.list
  --   outlook-> conversationId from Graph /me/messages
  --   imap   -> Message-ID of the root message (used for References: chain)
  thread_id TEXT NOT NULL,

  -- Metadata cached at link time so the UI can display context without an API hit
  subject TEXT,
  sender_domain TEXT,
  sender_address TEXT,
  first_message_id TEXT,

  -- Sync bookkeeping
  last_synced_at TIMESTAMPTZ,
  last_message_date TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT TRUE,

  -- How the thread was matched
  match_source TEXT CHECK (match_source IN ('user_confirmed', 'auto_domain', 'auto_ai')),
  match_confidence NUMERIC(3,2), -- 0.00 to 1.00, only set for auto matches

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, provider, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_dispute_watchdog_links_dispute
  ON dispute_watchdog_links(dispute_id);

CREATE INDEX IF NOT EXISTS idx_dispute_watchdog_links_user_sync
  ON dispute_watchdog_links(user_id, sync_enabled)
  WHERE sync_enabled = TRUE;

-- Cron-loop index: find all active threads ready for sync
CREATE INDEX IF NOT EXISTS idx_dispute_watchdog_links_sync_due
  ON dispute_watchdog_links(last_synced_at NULLS FIRST)
  WHERE sync_enabled = TRUE;

-- -----------------------------------------------------------------------------
-- 2. correspondence additions (all additive, no data loss)
-- -----------------------------------------------------------------------------
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS supplier_message_id TEXT;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS detected_from_email BOOLEAN DEFAULT FALSE;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS email_thread_id UUID REFERENCES dispute_watchdog_links(id) ON DELETE SET NULL;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS sender_address TEXT;
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Deduplication: same supplier message cannot be imported twice into the
-- same dispute. Partial index because null message_ids are allowed (manual entries).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_correspondence_msgid
  ON correspondence(dispute_id, supplier_message_id)
  WHERE supplier_message_id IS NOT NULL;

-- Query index: find auto-imported entries for a dispute quickly
CREATE INDEX IF NOT EXISTS idx_correspondence_detected
  ON correspondence(dispute_id, detected_from_email, entry_date DESC)
  WHERE detected_from_email = TRUE;

-- -----------------------------------------------------------------------------
-- 3. disputes additions (per-dispute reply counters)
-- -----------------------------------------------------------------------------
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS last_reply_received_at TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS unread_reply_count INTEGER DEFAULT 0;

-- -----------------------------------------------------------------------------
-- 4. user_notifications (in-app bell / notification centre)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- dispute_reply | dispute_resolved | bank_alert | ...
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_time
  ON user_notifications(user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE dispute_watchdog_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own linked threads
DROP POLICY IF EXISTS "own_dispute_watchdog_links" ON dispute_watchdog_links;
CREATE POLICY "own_dispute_watchdog_links"
  ON dispute_watchdog_links
  FOR ALL
  USING (user_id = auth.uid());

-- Users can only see their own notifications
DROP POLICY IF EXISTS "own_user_notifications" ON user_notifications;
CREATE POLICY "own_user_notifications"
  ON user_notifications
  FOR ALL
  USING (user_id = auth.uid());

-- Service-role writes bypass RLS automatically, so cron jobs can still insert.

-- -----------------------------------------------------------------------------
-- 6. Helper function: atomically increment unread_reply_count and update
-- last_reply_received_at when a new reply is imported.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_dispute_reply(
  p_dispute_id UUID,
  p_received_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE disputes
  SET last_reply_received_at = GREATEST(
        COALESCE(last_reply_received_at, p_received_at),
        p_received_at
      ),
      unread_reply_count = COALESCE(unread_reply_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_dispute_id;
END;
$$;

COMMENT ON FUNCTION record_dispute_reply IS
  'Called by the Watchdog cron when a new supplier reply is imported into a dispute.';

-- -----------------------------------------------------------------------------
-- 7. Usage tracking row for plan limits (additive)
-- Thread-link count is checked by querying dispute_watchdog_links directly;
-- no usage_logs row needed. Plan limits: Free=1, Essential=5, Pro=unlimited
-- (enforced in src/lib/plan-limits.ts > checkWatchdogLinkLimit).
-- -----------------------------------------------------------------------------
-- No DDL required.

-- -----------------------------------------------------------------------------
-- 8. Telegram alert preference for Watchdog reply alerts
-- Distinct from the existing dispute_followups (aging-nudges). Default ON
-- per the approved plan §7.
-- -----------------------------------------------------------------------------
ALTER TABLE telegram_alert_preferences
  ADD COLUMN IF NOT EXISTS dispute_replies BOOLEAN DEFAULT TRUE;

-- =============================================================================
-- END
-- =============================================================================
