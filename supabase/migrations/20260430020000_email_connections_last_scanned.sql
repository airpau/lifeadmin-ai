-- Track when each email connection was last scanned and last fully scanned.
-- Enables incremental scans (only fetch emails since last_scanned_at) and
-- the "Full re-scan" button which clears last_full_scanned_at to force a
-- full 2-year sweep.
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS last_scanned_at TIMESTAMPTZ;
ALTER TABLE email_connections ADD COLUMN IF NOT EXISTS last_full_scanned_at TIMESTAMPTZ;
