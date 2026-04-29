-- Yapily Hosted Pages migration — Phase 1 (additive only).
--
-- Migle (Yapily Implementation Engineer) confirmed in our 29 Apr 2026
-- onboarding call + follow-up email that build sign-off requires the
-- Hosted Pages auth flow (POST /hosted/consent-requests), not the
-- existing /account-auth-requests path. The Hosted Pages response
-- carries a consentRequestId that's distinct from the underlying
-- consentId we already store. We need to retain both so:
--
--   - the renew flow keeps using yapily_consent_id for
--     PUT /account-auth-requests/{consentId}
--   - the abandonment poller uses yapily_consent_request_id for
--     GET /hosted/consent-requests/{consentRequestId}
--   - rollback to /account-auth-requests is one env flag away — the
--     new column being null on legacy rows is harmless.
--
-- Strictly additive. No DROP / no ALTER-to-remove. Honours the
-- production-safety rules in CLAUDE.md.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS yapily_consent_request_id TEXT;

-- Lookup index — the abandonment poller scans by status='pending' and
-- then reads the request id; the index keeps that lookup cheap. Partial
-- so we don't pay the cost on the millions of legacy / TrueLayer rows
-- that will never have one.
CREATE INDEX IF NOT EXISTS bank_connections_yapily_consent_request_idx
  ON bank_connections (yapily_consent_request_id)
  WHERE yapily_consent_request_id IS NOT NULL;
