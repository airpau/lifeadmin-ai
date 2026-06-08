-- ---------------------------------------------------------------------------
-- P5-2 — runtime tool downrank substrate
-- ---------------------------------------------------------------------------
-- Phase 2 sprint 2 ships an auto-downrank step that FLAGS failing tools
-- via tool_downrank_flagged events but doesn't suppress them at runtime
-- — the founder has to act. This migration adds the runtime suppression
-- layer: tool_registry_overrides rows are read at tool-selection time by
-- the Pocket Agent loops and used to skip downranked tools.
--
-- Schema:
--   tool_name       — canonical identifier (e.g. 'get_disputes')
--   suppressed_at   — when the override took effect
--   expires_at      — when the override naturally decays (default +14d)
--   reason          — short string, e.g. 'auto_downrank_high_fail_rate'
--   metadata        — full snapshot of the stats that triggered the flag
--   reactivated_at  — set by founder click to clear an override early
--
-- The 14-day expiry prevents permanent loss of a tool that had a bad
-- spike — if the underlying issue is fixed, the tool comes back and the
-- agent retries. Auto-downrank cron re-evaluates and re-suppresses if
-- the fail rate is still > 30%.
--
-- Strictly additive. CREATE TABLE IF NOT EXISTS per the codebase rules.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tool_registry_overrides (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tool_name       TEXT NOT NULL,
  suppressed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  reason          TEXT NOT NULL,
  metadata        JSONB,
  reactivated_at  TIMESTAMPTZ,
  reactivated_by  UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_registry_overrides_tool
  ON public.tool_registry_overrides (tool_name);

-- Hot path for the agent lookup: active (non-expired, non-reactivated)
-- overrides only.
CREATE INDEX IF NOT EXISTS idx_tool_registry_overrides_active
  ON public.tool_registry_overrides (tool_name, expires_at)
  WHERE reactivated_at IS NULL;

-- RLS off — service-role only. The agent loops run with the service
-- role; founders manage via the admin dashboard which also uses service
-- role. No user-facing read needed.
ALTER TABLE public.tool_registry_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages tool overrides"
  ON public.tool_registry_overrides FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.tool_registry_overrides IS
  'P5-2 — runtime tool downrank registry. The Pocket Agent loops query ' ||
  'this table at tool-selection time and skip any tool with an active row ' ||
  '(suppressed_at < NOW() < expires_at AND reactivated_at IS NULL). ' ||
  'Daily intelligence-rollup-daily cron inserts rows for tools with ' ||
  '>30% fail rate at >20 invocations. Founder can clear early via the ' ||
  'admin dashboard. 14-day expiry means tools naturally re-enter if the ' ||
  'underlying issue is fixed.';
