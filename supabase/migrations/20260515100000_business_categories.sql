-- Business account support: is_business flag on bank_connections (2026-05-15)
--
-- Adds an is_business boolean to bank_connections so the UI and
-- classification pipeline can treat transactions from business accounts
-- differently from personal ones.
--
-- Business categories (wages_received, professional_services, etc.) are now
-- valid user_category values — the permissive check constraint added in the
-- previous migration allows them without changes here.
-- ============================================================

-- ─── 1. Add is_business flag ──────────────────────────────────────────────────
ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. Backfill from bank_name ──────────────────────────────────────────────
-- Any connection whose bank_name contains "business" (case-insensitive) is
-- treated as a business account. Users can override this in the UI later.
UPDATE bank_connections
SET    is_business = true
WHERE  bank_name ILIKE '%business%'
   AND is_business = false;
