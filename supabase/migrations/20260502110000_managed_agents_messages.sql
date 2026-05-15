-- Managed Agents observability table.
--
-- The 9 Claude Managed Agents (alert-tester, digest-compiler, support-triager,
-- email-marketer, ux-auditor, feature-tester, finance-analyst, bug-triager,
-- reviewer, builder) are dispatched by /api/cron/managed-agents hourly. Each
-- session creation + initial task message is recorded here so the founder can
-- see from SQL whether sessions are firing — independent of platform.claude.com.
--
-- The admin AI Team panel and CLAUDE.md both reference this table; this
-- migration creates it for the first time. Strictly additive.

CREATE TABLE IF NOT EXISTS agent_messages (
  id BIGSERIAL PRIMARY KEY,
  agent_key TEXT NOT NULL,             -- e.g. 'alert-tester'
  agent_id TEXT,                        -- platform.claude.com agent id (agent_*)
  session_id TEXT,                      -- platform.claude.com session id
  event_type TEXT NOT NULL,             -- 'session_created' | 'task_sent' | 'error'
  triggered_by TEXT,                    -- 'vercel-cron' | 'manual' | 'on-demand'
  status TEXT,                          -- 'ok' | 'error'
  error TEXT,                           -- non-null when status='error'
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_recent
  ON agent_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_agent
  ON agent_messages(agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_status
  ON agent_messages(status, created_at DESC);
