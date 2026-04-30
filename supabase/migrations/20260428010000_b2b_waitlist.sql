-- B2B waitlist for the /for-business landing page (UK Consumer Rights API).
-- Separate from the consumer waitlist_signups table because the fields
-- collected, the lifecycle (manual founder review), and the email
-- sequence are all distinct.

CREATE TABLE IF NOT EXISTS b2b_waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Submission fields (collected from the form)
  name TEXT NOT NULL,
  work_email TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT,
  expected_volume TEXT NOT NULL CHECK (expected_volume IN ('<1k', '1k-10k', '10k-100k', '100k+')),
  use_case TEXT NOT NULL CHECK (length(use_case) >= 20),
  -- Attribution
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  ip_country TEXT,
  -- Founder workflow
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'contacted', 'rejected', 'converted')),
  notes TEXT,
  reviewed_at TIMESTAMPTZ,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One signup per work_email
  CONSTRAINT b2b_waitlist_email_unique UNIQUE (work_email)
);

CREATE INDEX IF NOT EXISTS b2b_waitlist_created_at_idx
  ON b2b_waitlist (created_at DESC);

CREATE INDEX IF NOT EXISTS b2b_waitlist_status_idx
  ON b2b_waitlist (status, created_at DESC)
  WHERE status IN ('new', 'qualified');

COMMENT ON TABLE b2b_waitlist IS
  'Validation waitlist for /for-business (UK Consumer Rights API). Founder reviews weekly. Decision criterion: 10+ qualified signups in first 30d → green-light B2B build; otherwise archive the page.';
