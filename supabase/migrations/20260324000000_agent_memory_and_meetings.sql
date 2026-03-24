-- Agent persistent memory: each agent stores key learnings and decisions
CREATE TABLE IF NOT EXISTS agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_role TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('learning', 'decision', 'context', 'user_feedback', 'action_result')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ  -- null = permanent memory
);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_agent_memory_role ON agent_memory(agent_role);
CREATE INDEX idx_agent_memory_importance ON agent_memory(importance DESC);
CREATE INDEX idx_agent_memory_created ON agent_memory(created_at DESC);

-- Meeting conversations: persistent history
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')) DEFAULT 'active',
  summary TEXT,  -- AI-generated summary after meeting ends
  action_items JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_started ON meetings(started_at DESC);

-- Individual messages in a meeting
CREATE TABLE IF NOT EXISTS meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  agent_role TEXT,  -- which agent responded (null for user messages)
  agent_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE meeting_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meeting_messages_meeting ON meeting_messages(meeting_id);
CREATE INDEX idx_meeting_messages_created ON meeting_messages(created_at);
