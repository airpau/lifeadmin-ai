-- Multi-seat support: invite teammates as admin (write) or viewer
-- (read-only) members of an owner's account. Members sign in to the
-- portal with their own work email; they see and act on the owner's
-- keys/audit/webhooks subject to their role.
CREATE TABLE IF NOT EXISTS b2b_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email TEXT NOT NULL,
  member_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  invited_by TEXT,
  CONSTRAINT b2b_members_unique UNIQUE (owner_email, member_email)
);
CREATE INDEX IF NOT EXISTS b2b_members_member_idx ON b2b_members (member_email);
CREATE INDEX IF NOT EXISTS b2b_members_owner_idx ON b2b_members (owner_email);

-- Per-key IP allow-list (paid tiers) and weekly-digest opt-in.
ALTER TABLE b2b_api_keys
  ADD COLUMN IF NOT EXISTS allowed_ips TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weekly_digest_opt_in BOOLEAN NOT NULL DEFAULT TRUE;
