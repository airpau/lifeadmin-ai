-- Widen dispute_shares.platform to allow 'instagram' and 'tiktok'.
-- Both platforms have no web share intent URL, so the modal flow is
-- copy-to-clipboard + open the site in a new tab — but we still want
-- to log the click as a share event.

ALTER TABLE dispute_shares DROP CONSTRAINT IF EXISTS dispute_shares_platform_check;

ALTER TABLE dispute_shares
  ADD CONSTRAINT dispute_shares_platform_check
  CHECK (platform IN ('twitter', 'whatsapp', 'linkedin', 'facebook', 'copy', 'instagram', 'tiktok'));
