-- Self-learning infrastructure for AI agent system
-- Adds goal tracking, predictions, feedback events, and audit logging

-- Agent goals: measurable objectives agents set for themselves
CREATE TABLE IF NOT EXISTS agent_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role TEXT NOT NULL,
  title TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  metric_name TEXT,
  target_value NUMERIC,
  current_value NUMERIC,
  baseline_value NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed', 'abandoned')) DEFAULT 'active',
  progress_notes JSONB DEFAULT '[]',
  deadline TIMESTAMPTZ NOT NULL,
  outcome TEXT,
  learnings TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE agent_goals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_goals_role ON agent_goals(agent_role) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agent_goals_deadline ON agent_goals(deadline) WHERE status = 'active';

-- Agent predictions: testable predictions agents make each run
CREATE TABLE IF NOT EXISTS agent_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role TEXT NOT NULL,
  prediction TEXT NOT NULL,
  confidence INTEGER CHECK (confidence >= 1 AND confidence <= 10),
  reasoning TEXT,
  evaluation_date TIMESTAMPTZ NOT NULL,
  actual_outcome TEXT,
  was_correct BOOLEAN,
  evaluation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_at TIMESTAMPTZ
);

ALTER TABLE agent_predictions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_predictions_role ON agent_predictions(agent_role);
CREATE INDEX IF NOT EXISTS idx_agent_predictions_pending ON agent_predictions(evaluation_date)
  WHERE was_correct IS NULL;

-- Feedback events: captures approval/rejection + outcome data for learning
CREATE TABLE IF NOT EXISTS agent_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'proposal_approved', 'proposal_rejected',
    'content_approved', 'content_rejected',
    'action_acknowledged', 'action_overridden',
    'goal_reviewed', 'direct_feedback'
  )),
  source TEXT,
  source_id UUID,
  feedback_content TEXT,
  impact_score INTEGER CHECK (impact_score >= 1 AND impact_score <= 10),
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_feedback_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_feedback_role ON agent_feedback_events(agent_role);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_unprocessed ON agent_feedback_events(agent_role)
  WHERE processed = FALSE;

-- Agent run audit: every tool call logged for safety and cost tracking
CREATE TABLE IF NOT EXISTS agent_run_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role TEXT NOT NULL,
  run_id UUID NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input JSONB,
  tool_output_summary TEXT,
  cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_run_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_agent_audit_run ON agent_run_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_role ON agent_run_audit(agent_role);
CREATE INDEX IF NOT EXISTS idx_agent_audit_created ON agent_run_audit(created_at DESC);

-- Enrich agent_memory with metadata for better self-learning
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'agent';
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS decay_rate NUMERIC DEFAULT 0.01;
