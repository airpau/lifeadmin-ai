-- Additive: extra columns for AI-assisted legal reference verification.
-- verification_notes already exists on legal_references (see
-- 20260327020000_legal_references.sql), but adding IF NOT EXISTS keeps
-- this migration safe to re-run. verified_url is new — it stores the
-- canonical URL Perplexity confirms during a manual review pass, so the
-- founder can spot when the citation has moved without overwriting the
-- original `source_url`.

ALTER TABLE public.legal_references
  ADD COLUMN IF NOT EXISTS verified_url TEXT,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;
