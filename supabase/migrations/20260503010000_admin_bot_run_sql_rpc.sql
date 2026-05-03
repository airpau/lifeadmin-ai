-- Admin-bot run_sql RPC.
--
-- Powers the run_sql_query tool in src/lib/telegram/admin-tools.ts
-- (called from the founder-only /api/telegram/admin-command route).
-- Returns the rows of an arbitrary SELECT as JSONB so the bot can
-- answer ad-hoc business questions without us pre-shaping every query.
--
-- DEFENCE IN DEPTH (4 layers, in order of importance):
--   1. The Telegram webhook gates on FOUNDER_CHAT_ID — only Paul can
--      reach this RPC at all.
--   2. The application-layer tool (admin-tools.ts) refuses anything
--      that isn't a SELECT before it ever calls this function.
--   3. This function REJECTS non-SELECT queries server-side via a
--      regex check. So even if a future caller forgets layer 2 the
--      worst that happens is read access.
--   4. EXECUTE is REVOKED from anon and authenticated, so PostgREST
--      will only run this for service_role-bearing requests.
--
-- We intentionally use SECURITY DEFINER so the function inherits the
-- definer's permissions (postgres, full RLS bypass), not the caller's.
-- That's safe given layer 4 — only service_role can invoke it — and it
-- means the founder-bot can read the auth.* schema and any RLS-protected
-- tables without per-table policy work.
--
-- Idempotent: CREATE OR REPLACE + REVOKE IF EXISTS-equivalent (REVOKE
-- is silently no-op when nothing was granted).

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

  -- Reject anything that isn't a SELECT or WITH (CTE-prefixed SELECT).
  IF NOT (
    trimmed ~* '^select\s'
    OR trimmed ~* '^with\s'
  ) THEN
    RAISE EXCEPTION 'run_sql only accepts SELECT or WITH queries';
  END IF;

  -- Reject obvious multi-statement payloads. A semicolon followed by
  -- non-whitespace means a second statement.
  IF query ~ ';\s*\S' THEN
    RAISE EXCEPTION 'run_sql does not accept multi-statement queries';
  END IF;

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
  'Founder admin-bot only. Runs a single SELECT/WITH query and returns rows '
  'as JSONB. Service-role gated. See src/lib/telegram/admin-tools.ts.';
