-- ---------------------------------------------------------------------------
-- Phase 2 — extend intelligence_events.outcome_kind enum
-- ---------------------------------------------------------------------------
-- Phase 2 introduces two new closed loops that need fresh outcome kinds:
--
--   chat_reply_sent  → positive | negative          (thumbs feedback)
--   tool_call         → tool_success | tool_failed   (auto-downrank input)
--
-- Strictly additive: every old value remains valid (so all Phase 0/1 writers
-- continue to compile and run). We drop+re-add the named CHECK constraint
-- inside a DO block so the operation is idempotent and atomic.
--
-- This is NOT a DROP COLUMN — the column stays, and no data moves. Only the
-- CHECK predicate widens.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Drop the existing constraint if present (keeps the migration re-runnable
  -- on top of half-applied state — important if a previous deploy crashed
  -- between drop and add).
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'intelligence_events_outcome_kind_chk'
      AND conrelid = 'public.intelligence_events'::regclass
  ) THEN
    ALTER TABLE public.intelligence_events
      DROP CONSTRAINT intelligence_events_outcome_kind_chk;
  END IF;

  ALTER TABLE public.intelligence_events
    ADD CONSTRAINT intelligence_events_outcome_kind_chk
    CHECK (
      outcome_kind IS NULL OR outcome_kind IN (
        -- Phase 0 enums (alerts)
        'action_taken','dismissed','ignored',
        -- Phase 1 enums (dispute outcomes)
        'won','lost',
        -- Phase 0 ambient
        'no_response','churned','switched','cancelled',
        'auto_suppressed','escalated',
        -- Phase 2 — chat reply feedback (thumbs)
        'positive','negative',
        -- Phase 2 — tool call telemetry
        'tool_success','tool_failed'
      )
    );
END$$;

COMMENT ON CONSTRAINT intelligence_events_outcome_kind_chk
  ON public.intelligence_events
  IS 'Phase 2 (2026-06-08): added positive/negative for chat thumbs feedback ' ||
     'and tool_success/tool_failed for tool-call auto-downrank input. Strictly ' ||
     'additive — every prior value remains valid.';
