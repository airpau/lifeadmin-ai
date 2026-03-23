-- ════════════════════════════════════════════════════════════════════════════
-- 1. MISSING DATABASE INDEXES (scalability fixes)
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_bank_connections_user_status ON bank_connections(user_id, status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_action ON usage_logs(user_id, action);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. CONTRACT TRACKING — expand subscriptions table
-- Track contract terms, end dates, annual costs for deal targeting
-- ════════════════════════════════════════════════════════════════════════════

-- Contract type — what kind of commitment this is
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS contract_type TEXT
  CHECK (contract_type IN (
    'subscription',    -- Netflix, Spotify, etc.
    'fixed_contract',  -- broadband, mobile, energy (12/18/24 month)
    'mortgage',        -- mortgage with fixed/variable rate
    'loan',            -- personal loan, car finance
    'insurance',       -- home, car, pet, life, travel
    'lease',           -- car lease, equipment lease
    'membership',      -- gym, club, professional body
    'utility',         -- gas, electric, water, council tax
    'other'
  )) DEFAULT 'subscription';

-- Contract term and dates
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS contract_term_months INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renews BOOLEAN DEFAULT true;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS early_exit_fee DECIMAL(10, 2);

-- Financial details
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS annual_cost DECIMAL(10, 2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_contract_value DECIMAL(10, 2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5, 2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10, 2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS monthly_payment DECIMAL(10, 2);

-- Provider details for deal targeting
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_type TEXT
  CHECK (provider_type IN (
    'energy', 'broadband', 'mobile', 'tv',
    'insurance_home', 'insurance_car', 'insurance_pet', 'insurance_life', 'insurance_travel',
    'mortgage', 'loan', 'credit_card',
    'streaming', 'software', 'fitness', 'news',
    'council_tax', 'water',
    'other'
  ));

-- Deal targeting metadata
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_tariff TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS property_type TEXT CHECK (property_type IN ('flat', 'terraced', 'semi', 'detached', 'bungalow', 'other'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS data_allowance TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS speed_mbps INTEGER;

-- Indexes for contract queries and deal targeting
CREATE INDEX idx_subscriptions_contract_end ON subscriptions(contract_end_date) WHERE contract_end_date IS NOT NULL;
CREATE INDEX idx_subscriptions_provider_type ON subscriptions(provider_type) WHERE provider_type IS NOT NULL;
CREATE INDEX idx_subscriptions_user_contract ON subscriptions(user_id, contract_type);
CREATE INDEX idx_subscriptions_auto_renews ON subscriptions(auto_renews, contract_end_date) WHERE auto_renews = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. EXECUTIVE ASSISTANT AGENT
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE ai_executives DROP CONSTRAINT ai_executives_role_check;
ALTER TABLE ai_executives ADD CONSTRAINT ai_executives_role_check
  CHECK (role IN ('cfo', 'cto', 'cao', 'cmo', 'exec_assistant', 'support_lead', 'support_agent'));

INSERT INTO ai_executives (role, name, description, system_prompt, schedule, status) VALUES
('exec_assistant', 'Charlie — Executive Assistant', 'Executive Assistant to the founder. Monitors all business operations, AI agents, and tickets throughout the day. Emails a prioritised task list to the founder regularly.',
'You are Charlie, the Executive Assistant to Paul (the founder) at Paybacker LTD. Your job is to monitor everything happening across the business and send Paul a clear, prioritised task list.

Your responsibilities:
- Review the latest reports from all AI executives (Alex CFO, Morgan CTO, Jamie CAO, Taylor CMO)
- Check support ticket status (open, urgent, overdue, escalated to human)
- Monitor user growth and any anomalies
- Track what the AI agents have flagged as concerns or recommendations
- Identify tasks that need Paul''s personal attention TODAY
- Compile everything into a clear action list

Output format — return ONLY a JSON object:
{
  "title": "Executive Brief — [date] [time]",
  "summary": "2-3 sentence overview of the business right now",
  "urgent_tasks": [
    { "task": "description", "source": "which agent or system flagged this", "priority": "urgent/high/medium" }
  ],
  "agent_updates": [
    { "agent": "agent name", "status": "last run status", "key_finding": "most important thing from their latest report" }
  ],
  "ticket_summary": { "open": number, "urgent": number, "human_required": number, "oldest_unresolved_hours": number },
  "recommendations": ["recommendation 1", "recommendation 2"],
  "metrics_snapshot": { "mrr": number, "total_users": number, "new_users_today": number }
}

Rules:
- Be concise and actionable — Paul is busy
- Lead with what needs attention NOW
- Use British English
- If nothing urgent, say so — don''t invent problems
- Always include the metrics snapshot so Paul has a pulse on the business',
'0 7,12,17 * * *', 'active');
