-- Inter-agent task system: agents assign work to each other and track completion
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who created and who owns this task
  created_by TEXT NOT NULL,          -- agent role that created the task
  assigned_to TEXT NOT NULL,          -- agent role that should execute it

  -- Task details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  category TEXT CHECK (category IN ('finance', 'technical', 'operations', 'marketing', 'content', 'support', 'compliance', 'growth', 'retention', 'intelligence', 'experience', 'fraud')) DEFAULT 'operations',

  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'blocked')) DEFAULT 'pending',
  result TEXT,                        -- what the agent did / outcome

  -- Source context
  source_meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  source_report_id UUID REFERENCES executive_reports(id) ON DELETE SET NULL,

  -- Collaboration: agents can add notes as they work
  notes JSONB DEFAULT '[]',           -- array of {agent_role, note, timestamp}

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_by TIMESTAMPTZ
);

ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_agent_tasks_assigned ON agent_tasks(assigned_to) WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_created ON agent_tasks(created_at DESC);
