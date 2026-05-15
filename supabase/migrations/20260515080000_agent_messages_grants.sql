-- Fix agent_messages INSERT failures from managed-agents cron (2026-05-15)
--
-- The original migration created the table but omitted explicit GRANT statements
-- and RLS setup. PostgREST requires table-level grants even for service_role in
-- some Supabase versions (and always for anon/authenticated). Adding them now.
--
-- Root cause: inserts from /api/cron/managed-agents were silently failing because
-- the service_role had no INSERT grant on the table (Supabase changed default
-- ownership grants in a 2024 PostgREST upgrade).

-- Enable RLS so we can add policies (service_role bypasses RLS, anon/auth can read their own)
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Allow the service_role to do everything (cron inserts)
CREATE POLICY "service_role full access"
  ON agent_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Explicit grants so PostgREST exposes the table
GRANT SELECT, INSERT ON agent_messages TO service_role;
GRANT SELECT ON agent_messages TO authenticated;

-- Make sure the sequence is also grantable (BIGSERIAL)
GRANT USAGE ON SEQUENCE agent_messages_id_seq TO service_role;
