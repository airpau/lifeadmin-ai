-- Accountant register share links (Pro).
--
-- Strictly additive. A share link lets someone the user chooses (their
-- accountant) open a read-only register of the user's documents at
-- /shared/register/<token> and download them through short-lived signed
-- URLs. The plaintext token is shown to the user once and never stored:
-- only its SHA-256 hash and an 8 character prefix are kept, the same
-- pattern as b2b_api_keys / b2b_portal_tokens.
--
-- RLS: owners may read their own link rows (no secret is stored), all
-- writes are server side.

CREATE TABLE IF NOT EXISTS public.document_share_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_prefix  text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  label         text,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  use_count     integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_share_links_user_idx
  ON public.document_share_links (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_share_links_prefix_idx
  ON public.document_share_links (token_prefix);

ALTER TABLE public.document_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own share links" ON public.document_share_links;
CREATE POLICY "Users can view own share links"
  ON public.document_share_links
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.document_share_links IS
  'Revocable, expiring read-only links to a Pro user''s documents register, for their accountant. Only the SHA-256 hash and prefix of each token are stored.';
