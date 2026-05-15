-- Harden public.run_sql against side-effecting SELECTs.
--
-- Codex P1 on PR #454 caught it: the original guard only checked the
-- leading keyword (SELECT / WITH). A query like `SELECT dismiss_subscription(...)`
-- would still run the volatile function and mutate rows, because
-- SECURITY DEFINER means we run as postgres with full write access.
--
-- Fix: pin transaction_read_only=on for the function's transaction.
-- Postgres rejects any write attempt (UPDATE/INSERT/DELETE, plus any
-- volatile function call that tries to write) with
-- "cannot execute X in a read-only transaction".
--
-- Belt-and-braces: also block the obvious DML/DDL keywords anywhere
-- in the body, not just at the start. A user-quoted UPDATE inside a
-- string literal is a false positive but the admin bot doesn't need
-- to support those — easier to be conservative.

CREATE OR REPLACE FUNCTION public.run_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  result jsonb;
  trimmed text;
BEGIN
  trimmed := regexp_replace(query, '^\s+', '', 'i');

  -- Layer 1: must start with SELECT or WITH.
  IF NOT (
    trimmed ~* '^select\s'
    OR trimmed ~* '^with\s'
  ) THEN
    RAISE EXCEPTION 'run_sql only accepts SELECT or WITH queries';
  END IF;

  -- Layer 2: no semicolon-separated multi-statements.
  IF query ~ ';\s*\S' THEN
    RAISE EXCEPTION 'run_sql does not accept multi-statement queries';
  END IF;

  -- Layer 3: refuse any obvious write keyword anywhere in the body.
  -- Word-boundary regex so column names like "updated_at" or
  -- "deletion_count" don't false-positive.
  IF query ~* '\m(insert|update|delete|truncate|drop|alter|create|grant|revoke|copy|merge|call|do)\M' THEN
    RAISE EXCEPTION 'run_sql refuses queries that mention DDL/DML keywords';
  END IF;

  -- Layer 4: pin the transaction read-only at runtime. Postgres
  -- rejects any write attempt — including volatile functions that
  -- try to mutate rows — with 'cannot execute X in a read-only
  -- transaction'. This is the critical layer that catches
  -- side-effecting SELECT calls like `SELECT dismiss_subscription(...)`
  -- which the leading-keyword check cannot.
  -- The setting only affects the RPC's own transaction (Supabase
  -- opens a new one per rpc() call) so it doesn't bleed elsewhere.
  EXECUTE 'SET TRANSACTION READ ONLY';

  EXECUTE 'SELECT to_jsonb(array_agg(row_to_json(t))) FROM (' || query || ') t'
  INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_sql(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_sql(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_sql(text) TO service_role;

COMMENT ON FUNCTION public.run_sql(text) IS
  'Founder admin-bot only. Runs a single SELECT/WITH query in a '
  'read-only transaction and returns rows as JSONB. Service-role '
  'gated. Codex P1 hardening: transaction_read_only=on prevents '
  'side-effecting volatile functions from mutating data. See '
  'src/lib/telegram/admin-tools.ts.';
