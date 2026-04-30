-- One-time-link delivery for newly minted API keys.
-- We previously emailed the plaintext key directly; now we email a
-- single-use link that, on first GET, shows the plaintext and burns
-- the token. Improves the security posture: forwarded / archived
-- emails can't be replayed to recover the key.
ALTER TABLE b2b_portal_tokens
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'signin'
    CHECK (purpose IN ('signin', 'reveal_key')),
  ADD COLUMN IF NOT EXISTS payload TEXT;
