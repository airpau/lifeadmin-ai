-- 20260821140000_yapily_institutions_cache.sql
--
-- Durable cache for GET /institutions.
--
-- Migle Ivanauskaite (Yapily), 21 Aug 2026:
--   "GET /institutions: cached for up to 7 days"
--   "Cache of institutions is used efficiently and refreshed no more
--    than once per week"
--
-- We already had a cache, but only in module scope with a 1-hour TTL.
-- On Vercel that is close to no cache at all: every cold lambda gets a
-- fresh, empty module scope, so a quiet period followed by a fan-out
-- of cron invocations produces one GET /institutions per instance. The
-- payload is every UK institution — one of the largest responses Yapily
-- serves — and it changes maybe monthly.
--
-- Worse than the wasted calls: when that fetch failed, the helper
-- returned an empty feature list, and the capability gate is fail-open,
-- so a transient error turned into calls against endpoints we had just
-- been told not to call. A durable cache also gives us something to
-- serve stale from, which removes that failure mode entirely.
--
-- Single-row table by design. This is a cache of one global list, not
-- per-user data.

CREATE TABLE IF NOT EXISTS yapily_institutions_cache (
  -- Fixed key. The CHECK keeps this genuinely single-row rather than
  -- relying on every caller remembering to pass 'default'.
  id                 TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  -- Which Yapily application the list was fetched under. Institution
  -- availability is per-application, so a credential change must
  -- invalidate the cache rather than silently serving another app's
  -- coverage.
  application_uuid   TEXT,
  institutions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  institution_count  INTEGER NOT NULL DEFAULT 0,
  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE yapily_institutions_cache IS
  'Durable cache of GET /institutions. Refreshed at most weekly per Yapily guidance. Served stale on fetch failure.';
COMMENT ON COLUMN yapily_institutions_cache.application_uuid IS
  'YAPILY_APPLICATION_UUID the list was fetched under. A mismatch invalidates the cache.';

ALTER TABLE yapily_institutions_cache ENABLE ROW LEVEL SECURITY;

-- No policies. This is server-side infrastructure written and read by
-- the service role only; end users reach institution data through
-- /api/yapily/institutions, never through PostgREST.
