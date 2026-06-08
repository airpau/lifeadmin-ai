-- Enable Row Level Security on dispute_outcome_intelligence (P1 security fix).
--
-- Context: this table holds ANONYMISED, AGGREGATE dispute-outcome data
-- (merchant_pattern + vote_count + win_rate). It has no user_id and no
-- dispute_id column -- there is no per-user ownership to scope on. By design
-- the aggregate rows are readable by every client (they back the engine
-- feedback loop and the public /dispute-success-rates moat surface), and they
-- are only ever written by server-side code using the service role.
--
-- The original table was created with RLS intentionally OFF. That trips
-- Supabase's "RLS disabled in public" linter AND leaves the door open for the
-- anon/authenticated roles to WRITE to the aggregate if they hold table grants.
--
-- Correct hardening for an intentionally-public aggregate table:
--   1. ENABLE RLS.
--   2. Add a permissive SELECT policy (USING true) so existing read paths
--      (authenticated + anon) keep working.
--   3. Add NO insert/update/delete policies -> all writes are restricted to the
--      service role, which bypasses RLS. No write policy is needed for that.
--
-- This is additive and non-destructive: no columns or data are touched.

ALTER TABLE public.dispute_outcome_intelligence ENABLE ROW LEVEL SECURITY;

-- Public read of the anonymised aggregate. Idempotent: drop-then-create so the
-- migration can be re-run safely.
DROP POLICY IF EXISTS "Public read of anonymised dispute intelligence"
  ON public.dispute_outcome_intelligence;

CREATE POLICY "Public read of anonymised dispute intelligence"
  ON public.dispute_outcome_intelligence
  FOR SELECT
  USING (true);

-- No INSERT / UPDATE / DELETE policies are defined on purpose. With RLS enabled
-- and no write policy, only the service role (which bypasses RLS) can mutate
-- this table -- exactly the intended write path.
