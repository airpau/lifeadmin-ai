-- Yapily Hosted Pages — pending consent request tracking.
--
-- The Vitally checklist (GH2) and the Hosted Pages tutorial both call
-- for an abandonment-handling pattern: if the user never returns to the
-- callback URL, start polling /hosted/consent-requests/{id} after 5 min,
-- every 5–10s, and treat as abandoned after 15 min. To do that, we need
-- to know which consentRequestIds we've issued without yet seeing a
-- successful callback.
--
-- Why a dedicated table rather than a status flag on bank_connections:
--   - bank_connections is the live "what banks does the user have"
--     surface. Abandoned consents shouldn't pollute it; they're an
--     ops concern, not a user-facing one.
--   - Keeps the flag-gated rollout clean — flipping
--     YAPILY_HOSTED_PAGES_ENABLED=false reverts to the legacy flow
--     without leaving orphan rows in the live table.
--   - Lets us keep a clean audit trail of attempted connects (for
--     funnel analysis later — drop-off at consent is meaningful).
--
-- Strictly additive. Honours the production-safety rules in CLAUDE.md.

CREATE TABLE IF NOT EXISTS yapily_pending_consent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_request_id TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  redirect_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- request created, waiting for user redirect-back
    'completed',   -- callback fired, connection persisted
    'abandoned',   -- 15+ min elapsed and never resolved
    'failed'       -- Yapily reported FAILED / REVOKED / REJECTED
  )),
  yapily_status TEXT,
  yapily_tracing_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ
);

-- Lookup index for the abandonment poller — "give me everything still
-- pending after N minutes". Conditional on status='pending' so the
-- index stays small as historical rows accumulate.
CREATE INDEX IF NOT EXISTS yapily_pending_consent_requests_pending_idx
  ON yapily_pending_consent_requests (created_at)
  WHERE status = 'pending';

-- Lookup by consent_request_id for the callback resolver.
CREATE UNIQUE INDEX IF NOT EXISTS yapily_pending_consent_requests_request_idx
  ON yapily_pending_consent_requests (consent_request_id);

-- Lookup by user for any future "your in-flight bank connect" UI.
CREATE INDEX IF NOT EXISTS yapily_pending_consent_requests_user_idx
  ON yapily_pending_consent_requests (user_id, created_at DESC);

-- RLS: users can read their own rows for diagnostic surfaces; only the
-- service role mutates them (auth/callback/cron). No INSERT/UPDATE
-- policy for end users.
ALTER TABLE yapily_pending_consent_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'yapily_pending_consent_requests'
      AND policyname = 'Users read own pending consents'
  ) THEN
    CREATE POLICY "Users read own pending consents"
      ON yapily_pending_consent_requests
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
