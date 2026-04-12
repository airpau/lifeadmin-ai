-- ============================================================
-- Gmail OAuth re-verification notice (2026-04-12)
--
-- Google approved the OAuth app verification today for
-- paybacker-490820 / gmail.readonly scope.
--
-- Any Gmail connections created before today may have had their
-- refresh tokens revoked or restricted while the app was in
-- "Testing" mode. Mark them as needing reconnection so the
-- Scanner UI prompts users to re-authorise.
--
-- Safe: only touches Google OAuth connections. IMAP and Outlook
-- connections are unaffected.
-- ============================================================

UPDATE email_connections
SET
  status       = 'needs_reauth',
  last_error   = 'Gmail access needs reauthorisation following Paybacker''s Google OAuth verification. Please reconnect your Gmail account — your scan history is preserved.',
  last_error_at = NOW(),
  updated_at   = NOW()
WHERE provider_type = 'google'
  AND auth_method   = 'oauth'
  AND status        = 'active';

-- Mirror to gmail_tokens table so the /api/gmail/scan route also picks it up
UPDATE gmail_tokens
SET
  updated_at = NOW()
WHERE created_at < '2026-04-12 00:00:00+00';
