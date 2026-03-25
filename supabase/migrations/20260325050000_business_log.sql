-- Shared business knowledge base for all agents and Telegram bot
CREATE TABLE IF NOT EXISTS business_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL, -- 'progress', 'decision', 'blocker', 'context', 'agent_note'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT DEFAULT 'founder',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_business_log_recent ON business_log(created_at DESC);
