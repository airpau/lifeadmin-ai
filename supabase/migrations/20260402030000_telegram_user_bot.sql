-- Telegram User Bot — Phase 1
-- Pro-user-facing financial assistant bot
-- Tables: sessions, link codes, message log, pending actions

-- ============================================================
-- 1. TELEGRAM SESSIONS — links Telegram chats to Paybacker users
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  is_active BOOLEAN DEFAULT true,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ
);

ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
-- Service role only — no user-facing RLS policies needed (bot uses service key)

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat_id ON telegram_sessions(telegram_chat_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_user_id ON telegram_sessions(user_id);

-- ============================================================
-- 2. TELEGRAM LINK CODES — one-time codes for account linking
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;
-- Service role only

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON telegram_link_codes(code) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user ON telegram_link_codes(user_id, created_at DESC);

-- ============================================================
-- 3. TELEGRAM MESSAGE LOG — analytics for bot interactions
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_message_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_chat_id BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT,
  tools_used TEXT[],
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telegram_message_log ENABLE ROW LEVEL SECURITY;
-- Service role only

CREATE INDEX IF NOT EXISTS idx_telegram_log_user ON telegram_message_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_log_chat ON telegram_message_log(telegram_chat_id, created_at DESC);

-- ============================================================
-- 4. TELEGRAM PENDING ACTIONS — draft letters awaiting approval
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_pending_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('dispute_letter')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

ALTER TABLE telegram_pending_actions ENABLE ROW LEVEL SECURITY;
-- Service role only

CREATE INDEX IF NOT EXISTS idx_telegram_pending_user ON telegram_pending_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_chat ON telegram_pending_actions(telegram_chat_id);

-- Auto-expire old pending actions (run via pg_cron or cron job)
-- For now, the application layer handles expiry checks
