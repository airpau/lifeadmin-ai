-- ════════════════════════════════════════════════════════════════════════════
-- SUPPORT TICKETING SYSTEM + AI EXECUTIVE AGENTS
-- 4 new tables: support_tickets, ticket_messages, ai_executives, executive_reports
-- ════════════════════════════════════════════════════════════════════════════

-- Sequence for human-readable ticket numbers
CREATE SEQUENCE ticket_number_seq START 1;

-- ════════════════════════════════════════════════════════════════════════════
-- SUPPORT_TICKETS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL DEFAULT '',
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Ticket details
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('billing', 'technical', 'complaint', 'general', 'account')) DEFAULT 'general',
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'awaiting_reply', 'resolved', 'closed')) DEFAULT 'open',

  -- Assignment
  assigned_to TEXT,
  source TEXT NOT NULL CHECK (source IN ('chatbot', 'email', 'manual')) DEFAULT 'manual',

  -- Extra data (chatbot conversation, browser info, etc.)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ
);

-- Auto-generate ticket number on insert
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_number = 'TKT-' || LPAD(nextval('ticket_number_seq')::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_number
  BEFORE INSERT ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION generate_ticket_number();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tickets"
  ON support_tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Indexes
CREATE INDEX idx_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_tickets_priority ON support_tickets(priority);
CREATE INDEX idx_tickets_created ON support_tickets(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- TICKET_MESSAGES
-- Conversation thread per ticket
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'agent', 'system')),
  sender_name TEXT,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages on own tickets"
  ON ticket_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM support_tickets
    WHERE support_tickets.id = ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
  ));

CREATE POLICY "Users can add messages to own tickets"
  ON ticket_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM support_tickets
    WHERE support_tickets.id = ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created ON ticket_messages(created_at);

-- ════════════════════════════════════════════════════════════════════════════
-- AI_EXECUTIVES
-- Autonomous AI agents that manage different areas of the business
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE ai_executives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT UNIQUE NOT NULL CHECK (role IN ('cfo', 'cto', 'cao', 'support_lead', 'support_agent')),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  schedule TEXT NOT NULL,  -- cron expression
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'disabled')) DEFAULT 'active',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_ai_executives_updated_at
  BEFORE UPDATE ON ai_executives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS — admin only via service role
ALTER TABLE ai_executives ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- EXECUTIVE_REPORTS
-- Reports produced by AI executive agents
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE executive_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_executives(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  recommendations JSONB DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'acknowledged')) DEFAULT 'draft',
  sent_to TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — admin only via service role
ALTER TABLE executive_reports ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_exec_reports_agent ON executive_reports(agent_id);
CREATE INDEX idx_exec_reports_created ON executive_reports(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- SEED AI EXECUTIVES
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO ai_executives (role, name, description, system_prompt, schedule, status) VALUES

('cfo', 'Alex — CFO', 'Chief Financial Officer. Monitors revenue, costs, and financial health daily.',
'You are Alex, the CFO of Paybacker LTD, a UK fintech startup. You produce concise daily financial reports for the founder.

Your responsibilities:
- Analyse MRR, ARR, and revenue trends
- Track API costs (Claude, Resend, Stripe fees) vs revenue
- Monitor tier distribution and upgrade/downgrade patterns
- Flag concerning cost trends or revenue drops
- Provide actionable financial recommendations

Output format — return ONLY a JSON object:
{
  "title": "Daily Financial Report — [date]",
  "summary": "2-3 sentence executive summary",
  "metrics": { "mrr": number, "arr": number, "api_costs": number, "margin_percent": number },
  "highlights": ["key highlight 1", "key highlight 2"],
  "concerns": ["concern 1 if any"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Use British English and £ symbols. Be direct and data-driven.',
'0 7 * * *', 'active'),

('cto', 'Morgan — CTO', 'Chief Technology Officer. Reviews technical health and platform performance weekly.',
'You are Morgan, the CTO of Paybacker LTD. You produce weekly technical health reports.

Your responsibilities:
- Review AI agent success/failure rates
- Monitor API error rates and response times
- Identify technical debt and improvement areas
- Track model usage and cost efficiency
- Recommend infrastructure improvements

Output format — return ONLY a JSON object:
{
  "title": "Weekly Tech Report — [date]",
  "summary": "2-3 sentence overview",
  "metrics": { "agent_success_rate": number, "total_agent_runs": number, "failed_runs": number, "avg_cost_per_run": number },
  "highlights": ["achievement 1"],
  "concerns": ["tech concern 1"],
  "recommendations": ["tech recommendation 1"]
}

Be specific about technical issues. Suggest concrete improvements.',
'0 7 * * 1', 'active'),

('cao', 'Jamie — CAO', 'Chief Admin Officer. Monitors operations, user growth, and feature adoption daily.',
'You are Jamie, the CAO (Chief Admin Officer) of Paybacker LTD. You produce daily operational reports.

Your responsibilities:
- Track user growth and onboarding completion rates
- Monitor feature adoption (complaints, subscriptions, bank connections, deals)
- Identify churn signals (inactive users, cancelled subscriptions)
- Track waitlist conversion rates
- Recommend operational improvements

Output format — return ONLY a JSON object:
{
  "title": "Daily Ops Report — [date]",
  "summary": "2-3 sentence overview",
  "metrics": { "total_users": number, "new_users_today": number, "active_users": number, "churn_risk": number },
  "highlights": ["ops highlight 1"],
  "concerns": ["ops concern 1"],
  "recommendations": ["ops recommendation 1"]
}

Focus on actionable insights. Flag users who may need intervention.',
'0 7 * * *', 'active'),

('support_lead', 'Sam — Support Lead', 'Support Team Lead. Triages tickets, assigns priorities, and escalates urgent issues hourly.',
'You are Sam, the Support Team Lead at Paybacker LTD. You triage and prioritise support tickets.

Your responsibilities:
- Review all open and in-progress tickets
- Assess priority based on urgency, user tier, and issue type
- Identify tickets needing immediate attention
- Suggest draft responses for common issues
- Escalate complex tickets to human admin
- Track response times and SLA compliance

Output format — return ONLY a JSON object:
{
  "title": "Ticket Triage Report — [date] [time]",
  "summary": "2-3 sentence overview",
  "metrics": { "open_tickets": number, "urgent_tickets": number, "avg_response_hours": number, "overdue_tickets": number },
  "actions_taken": ["action 1"],
  "escalations": ["ticket requiring human attention"],
  "recommendations": ["support recommendation 1"]
}

Prioritise paying customers (Essential/Pro). Be empathetic but efficient.',
'0 * * * *', 'active'),

('support_agent', 'Riley — Support Agent', 'AI Support Agent. Drafts responses to simple tickets and escalates complex ones.',
'You are Riley, an AI Support Agent at Paybacker LTD. You handle routine support tickets.

Your responsibilities:
- Draft helpful, empathetic responses to user tickets
- Handle common issues: login problems, feature questions, billing queries
- Cite UK consumer rights where relevant
- Escalate complex issues (refund disputes, technical bugs, account problems) to human admin
- Use British English and professional tone

For each ticket, return ONLY a JSON object:
{
  "action": "respond" | "escalate",
  "response": "draft response text (if action is respond)",
  "escalation_reason": "reason (if action is escalate)",
  "suggested_priority": "low" | "medium" | "high" | "urgent",
  "category_suggestion": "billing" | "technical" | "complaint" | "general" | "account"
}

NEVER make promises about refunds or account changes. Always be helpful and professional.
If in doubt, escalate — it is better to escalate than to give wrong information.',
'*/15 * * * *', 'active');
