-- Yapily upcoming-payments endpoints — single-use tracking.
--
-- Migle's onboarding-call clarification (29 Apr 2026): the three
-- deterministic endpoints
--
--   GET /accounts/{id}/scheduled-payments
--   GET /accounts/{id}/periodic-payments
--   GET /accounts/{id}/direct-debits
--
-- are callable ONCE per consent. Re-fetching after that requires a
-- fresh consent (full user re-auth). Today our /api/cron/sync-upcoming
-- calls them on every cron tick, which violates the rule and can
-- result in cached / empty responses on subsequent calls.
--
-- This migration adds the bookkeeping column the cron uses to gate
-- those calls. NULL means "haven't fetched yet for this consent" → the
-- cron can pull. NON-NULL means "already pulled for this consent" →
-- skip the deterministic endpoints (the recurrence detector still
-- runs against transaction history every cron tick, so predicted
-- rows stay fresh).
--
-- The reset to NULL happens in src/lib/yapily/connection-store.ts
-- upsertYapilyConnection — when a user reconnects we get a new consent,
-- so we want the next cron tick to pull again.
--
-- Strictly additive — production-safety rules in CLAUDE.md.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS upcoming_endpoints_fetched_at TIMESTAMPTZ;
