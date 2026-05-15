-- Migration: 20260515060000_security_hardening
-- Author: morning audit (2026-05-15)
-- Applied directly to project kcxxlesishltdmfctlmo at 06:00 UTC.
-- Committed as a file so the repo's migration history stays in sync with the DB.
--
-- Outcome of advisor re-scan after applying:
--   Before: 243 lints (2 ERROR, 184 WARN, 57 INFO)
--   After : 166 lints (0 ERROR, 109 WARN, 57 INFO)

------------------------------------------------------------------------------
-- 1. Switch the two SECURITY DEFINER views to SECURITY INVOKER so they
--    respect the caller's RLS. Service-role callers (cron / edge funcs) are
--    unaffected because service_role bypasses RLS. End-user reads continue
--    to work because the underlying tables already scope by auth.uid().
------------------------------------------------------------------------------
ALTER VIEW public.bank_connections_due_sync   SET (security_invoker = on);
ALTER VIEW public.subscriptions_expiring_soon SET (security_invoker = on);

------------------------------------------------------------------------------
-- 2. Replace the two wide-open "Service role can ..." policies with policies
--    actually scoped to the service_role. Existing user-facing SELECT
--    policies are untouched. waitlist_signups."Anyone can sign up for
--    waitlist" is intentional (public signup form) and is deliberately
--    NOT changed here.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert sync logs" ON public.bank_sync_log;
CREATE POLICY "Service role can insert sync logs"
  ON public.bank_sync_log FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage fees" ON public.success_fees;
CREATE POLICY "Service role can manage fees"
  ON public.success_fees FOR ALL TO service_role USING (true) WITH CHECK (true);

------------------------------------------------------------------------------
-- 3. Pin search_path on every public function with proconfig=NULL. This
--    fixes the 73 function_search_path_mutable WARN-level lints in a single
--    transaction. pg_catalog is always implicitly first, so core builtins
--    (gen_random_uuid, etc.) still resolve. `extensions` is included so
--    that any function calling pgcrypto helpers continues to work — at the
--    time of this migration only `mark_internal_transfers` did, but new
--    code is free to use the extensions schema without revisiting search_path.
------------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proconfig IS NULL
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;
