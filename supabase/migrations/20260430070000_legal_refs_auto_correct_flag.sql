-- Additive: track when Perplexity verifier auto-overwrote canonical fields
-- so the admin UI can surface a "review auto-correction" badge.
ALTER TABLE public.legal_references
  ADD COLUMN IF NOT EXISTS auto_corrected BOOLEAN NOT NULL DEFAULT FALSE;
