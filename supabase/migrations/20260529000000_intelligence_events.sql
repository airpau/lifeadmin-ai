-- 20260529000000_intelligence_events.sql
--
-- Phase 0 of the closed-loop architecture (see docs/CLOSED_LOOP_ARCHITECTURE.md).
--
-- One unified ledger every action emits to + one rolled-up stats table the
-- intelligence layer consults before deciding to fire. Per the project rule
-- (CLAUDE.md): strictly additive — no DROP, no destructive ALTER. Text +
-- CHECK constraint over Postgres enums so new kinds can be added without
-- a migration.

CREATE TABLE IF NOT EXISTS public.intelligence_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who & when ─────────────────────────────────────────────
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  actor           text NOT NULL,
  emitted_at      timestamptz NOT NULL DEFAULT now(),

  -- What ──────────────────────────────────────────────────
  action_kind     text NOT NULL,
  subject_kind    text,
  subject_id      text,

  -- Prediction at emit time ──────────────────────────────
  predicted       jsonb,

  -- Outcome (filled when observed) ───────────────────────
  outcome_kind    text,
  outcome         jsonb,
  measured_at     timestamptz,

  -- Free-form context, never load-bearing ───────────────
  metadata        jsonb,

  CONSTRAINT intelligence_events_actor_chk
    CHECK (actor IN ('system','user','ai')),
  CONSTRAINT intelligence_events_outcome_kind_chk
    CHECK (outcome_kind IS NULL OR outcome_kind IN (
      'action_taken','dismissed','ignored','won','lost',
      'no_response','churned','switched','cancelled',
      'auto_suppressed','escalated'
    ))
);

CREATE INDEX IF NOT EXISTS idx_intelligence_events_action_emitted
  ON public.intelligence_events (action_kind, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_events_user_emitted
  ON public.intelligence_events (user_id, emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_intelligence_events_subject
  ON public.intelligence_events (subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_events_unmeasured
  ON public.intelligence_events (emitted_at)
  WHERE outcome_kind IS NULL;
CREATE INDEX IF NOT EXISTS idx_intelligence_events_outcome_kind
  ON public.intelligence_events (outcome_kind, measured_at DESC)
  WHERE outcome_kind IS NOT NULL;

COMMENT ON TABLE public.intelligence_events IS
  'Unified ledger — every consequential action the system takes writes one row here. ' ||
  'Every observed outcome updates the row. The intelligence layer consults this table ' ||
  '(via the SDK in src/lib/intelligence/) before firing the next action. ' ||
  'Supersedes the dormant agent_goals / agent_predictions / agent_feedback_events / ' ||
  'provider_intelligence tables.';


-- ── Rolled-up per-scope stats ───────────────────────────
CREATE TABLE IF NOT EXISTS public.intelligence_stats (
  scope_kind      text NOT NULL,
  scope_value     text NOT NULL,
  window_kind     text NOT NULL,
  window_start    date NOT NULL,

  emitted         integer NOT NULL DEFAULT 0,
  acted_on        integer NOT NULL DEFAULT 0,
  dismissed       integer NOT NULL DEFAULT 0,
  ignored         integer NOT NULL DEFAULT 0,
  won             integer NOT NULL DEFAULT 0,
  lost            integer NOT NULL DEFAULT 0,
  auto_suppressed integer NOT NULL DEFAULT 0,
  recovered_gbp   numeric(12,2) NOT NULL DEFAULT 0,
  precision_pct   numeric(5,2),    -- acted_on / emitted (NULL when emitted = 0)
  computed_at     timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (scope_kind, scope_value, window_kind, window_start),

  CONSTRAINT intelligence_stats_window_kind_chk
    CHECK (window_kind IN ('day','week','month','all_time'))
);

CREATE INDEX IF NOT EXISTS idx_intelligence_stats_scope_window
  ON public.intelligence_stats (scope_kind, window_kind, window_start DESC);

COMMENT ON TABLE public.intelligence_stats IS
  'Rolled-up per-scope precision / outcome stats, refreshed daily by ' ||
  '/api/cron/intelligence-rollup-daily. Read by the intelligence SDK ' ||
  '(consultLedger) before every consequential action. Per-scope examples: ' ||
  '(alert_template, paybacker_alert_price_increase, day, ...) | ' ||
  '(legal_ref, "CCA s.75", all_time, ...) | (merchant, "EE", week, ...)';


-- ── Dormancy markers on the superseded tables ──────────
-- We never DROP per the additive rule, but we leave a paper trail
-- so future readers don't try to revive them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_goals') THEN
    COMMENT ON TABLE public.agent_goals IS
      'DORMANT 2026-05-29 — superseded by intelligence_events. ' ||
      'Zero reads, zero writes confirmed in audit. Do not revive — ' ||
      'use intelligence_events with action_kind = goal_set instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_predictions') THEN
    COMMENT ON TABLE public.agent_predictions IS
      'DORMANT 2026-05-29 — superseded by intelligence_events.predicted. ' ||
      'Zero reads, zero writes confirmed in audit.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_feedback_events') THEN
    COMMENT ON TABLE public.agent_feedback_events IS
      'DORMANT 2026-05-29 — superseded by intelligence_events with ' ||
      'outcome_kind populated. /api/cron/self-improve reads from here but ' ||
      'never finds rows (zero writers confirmed in audit). Will be retargeted ' ||
      'in Phase 2.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_run_audit') THEN
    COMMENT ON TABLE public.agent_run_audit IS
      'DORMANT 2026-05-29 — superseded by intelligence_events. ' ||
      'Reads exist in telegram webhook + admin command but return empty. ' ||
      'Callers will be migrated in Phase 2.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'provider_intelligence') THEN
    COMMENT ON TABLE public.provider_intelligence IS
      'DORMANT 2026-05-29 — superseded by intelligence_stats with ' ||
      'scope_kind = merchant. Zero activity confirmed in audit.';
  END IF;
END$$;
