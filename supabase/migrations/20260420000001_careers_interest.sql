-- /careers job-interest table
-- 20 Apr 2026 — Paul asked for a Careers landing page with a live form
-- that captures interest ahead of us posting roles. Email-first, with
-- enough metadata to triage quickly.

CREATE TABLE IF NOT EXISTS careers_interest (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  full_name TEXT NOT NULL,
  email TEXT NOT NULL,

  -- Free-text role slug, e.g. "founding-engineer" | "growth-marketer" | "open".
  -- Kept open so we don't have to migrate every time we add a role.
  role_of_interest TEXT,

  -- Optional profile links (LinkedIn, portfolio, GitHub).
  linkedin_url TEXT,
  portfolio_url TEXT,

  -- Why they're interested / anything they want to tell Paul up-front.
  why TEXT,

  -- "now" | "1-month" | "3-months" | "exploring"
  availability TEXT,

  -- UK-based? (We're London-hybrid for now.)
  uk_based BOOLEAN,

  -- Admin triage
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'contacted', 'archived')),
  notes TEXT,

  -- Source attribution so we can measure careers-page conversion later
  referrer TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedup guard: one open (non-archived) interest per email. If they change
-- their mind later we can flip status to 'archived' and a fresh insert works.
CREATE UNIQUE INDEX IF NOT EXISTS careers_interest_email_open_uidx
  ON careers_interest (lower(email))
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS careers_interest_created_at_idx
  ON careers_interest (created_at DESC);

-- RLS — public insertions happen via service-role from the API route, so
-- regular clients should not be able to read at all. We lock this down by
-- enabling RLS without any permissive policies; only the service role
-- bypasses RLS.
ALTER TABLE careers_interest ENABLE ROW LEVEL SECURITY;
