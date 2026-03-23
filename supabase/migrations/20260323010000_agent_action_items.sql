-- ════════════════════════════════════════════════════════════════════════════
-- AGENT ACTION ITEMS
-- Cross-agent coordination: agents flag items, others pick them up
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE agent_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flagged_by TEXT NOT NULL,
  assigned_to TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  category TEXT CHECK (category IN ('finance', 'technical', 'operations', 'marketing', 'support', 'compliance', 'growth')) DEFAULT 'operations',
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')) DEFAULT 'open',
  source_report_id UUID REFERENCES executive_reports(id) ON DELETE SET NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_action_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_agent_action_items_updated_at
  BEFORE UPDATE ON agent_action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_action_items_status ON agent_action_items(status);
CREATE INDEX idx_action_items_assigned ON agent_action_items(assigned_to) WHERE status = 'open';
CREATE INDEX idx_action_items_created ON agent_action_items(created_at DESC);
