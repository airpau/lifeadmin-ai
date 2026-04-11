-- Shared context table for MCP server (replaces local filesystem context files)
-- Used by Managed Agents that run in the cloud and cannot access local files
CREATE TABLE IF NOT EXISTS shared_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with the same context files the stdio MCP server uses
INSERT INTO shared_context (file_name, content) VALUES
  ('project-status.md', '# Project Status'),
  ('memory.md', '# Memory'),
  ('task-queue.md', '# Task Queue\n\n## Critical\n\n## High\n\n## Medium\n\n## Low\n'),
  ('handoff-notes.md', '# Handoff Notes'),
  ('decisions-log.md', '# Decisions Log'),
  ('active-sessions.md', '# Active Sessions'),
  ('infrastructure.md', '# Infrastructure'),
  ('business-ops.md', '# Business Ops'),
  ('seo-analytics.md', '# SEO Analytics')
ON CONFLICT (file_name) DO NOTHING;

-- Enable RLS
ALTER TABLE shared_context ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by MCP server)
CREATE POLICY "service_role_full_access" ON shared_context
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
