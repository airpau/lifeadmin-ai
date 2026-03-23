CREATE TABLE improvement_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by TEXT NOT NULL,
  source_report_id UUID REFERENCES executive_reports(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  implementation TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('config', 'code', 'data', 'prompt', 'schedule', 'feature', 'bugfix', 'infrastructure')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  estimated_impact TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'implemented', 'failed')) DEFAULT 'pending',
  approval_token TEXT UNIQUE NOT NULL,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  implemented_at TIMESTAMPTZ,
  implementation_result TEXT,
  github_issue_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE improvement_proposals ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_improvement_proposals_updated_at
  BEFORE UPDATE ON improvement_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_proposals_status ON improvement_proposals(status);
CREATE INDEX idx_proposals_token ON improvement_proposals(approval_token);
CREATE INDEX idx_proposals_created ON improvement_proposals(created_at DESC);
