-- Add telegram_request and notification to allowed agent_tasks categories
ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_category_check;
ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_category_check CHECK (category = ANY (ARRAY['finance', 'technical', 'operations', 'marketing', 'content', 'support', 'compliance', 'growth', 'retention', 'intelligence', 'experience', 'fraud', 'telegram_request', 'notification']));
