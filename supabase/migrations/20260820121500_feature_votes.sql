-- Feature voting for the marketing site and dashboard.
-- Additive only. Votes are written via the service role from
-- src/app/api/feature-votes/route.ts; no client-side access is granted.

CREATE TABLE IF NOT EXISTS feature_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  voter_hash text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_key, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_feature_votes_feature_key
  ON feature_votes (feature_key);

ALTER TABLE feature_votes ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role reads/writes this table.
