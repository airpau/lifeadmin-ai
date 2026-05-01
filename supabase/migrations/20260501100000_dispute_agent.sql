-- Dispute Agent state machine + per-decision audit log.
-- Strictly additive — never DROP, never ALTER existing columns.
--
-- The agent owns each open dispute and proactively drives it forward.
-- Every decision and the resulting outcome becomes additional training
-- signal for the dispute_intelligence_stats flywheel.

-- State machine columns on disputes
ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS agent_state TEXT
    CHECK (agent_state IN (
      'draft','sent','responded','awaiting_user_input',
      'escalation_due','escalated','resolved_won','resolved_partial',
      'resolved_lost','withdrawn','timeout','still_open'
    )),
  ADD COLUMN IF NOT EXISTS agent_state_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_disabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS first_letter_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fca_8_week_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_response_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_agent_action_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_disputes_agent_next_action
  ON public.disputes(next_agent_action_at)
  WHERE agent_disabled IS NOT TRUE
    AND agent_state NOT IN ('resolved_won','resolved_partial','resolved_lost','withdrawn','timeout');

CREATE INDEX IF NOT EXISTS idx_disputes_agent_state
  ON public.disputes(agent_state, agent_state_set_at DESC);

-- Per-dispute agent decision log
CREATE TABLE IF NOT EXISTS public.dispute_agent_decisions (
  id BIGSERIAL PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  from_state TEXT,
  to_state TEXT,
  recommended_action TEXT NOT NULL,
  rationale TEXT NOT NULL,
  data_grounded BOOLEAN NOT NULL DEFAULT FALSE,
  historical_signal JSONB,
  surfaced_via TEXT[],
  user_action TEXT,
  user_action_at TIMESTAMPTZ,
  expired BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_decisions_dispute_at
  ON public.dispute_agent_decisions(dispute_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_pending
  ON public.dispute_agent_decisions(user_action) WHERE user_action IS NULL AND expired IS FALSE;
