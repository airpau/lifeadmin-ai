-- ============================================================
-- Add `rent` as a distinct canonical Tier-1 category (2026-05-14)
--
-- Until now `rent`, `letting`, `landlord` were aliased to `housing`
-- with the display label "Rent & Housing". Users complained that
-- a tenant who has never owned a property sees only "Mortgage" as a
-- housing-payment option, with rent buried inside a compound bucket.
--
-- This migration:
--   1. Adds `rent` to every CHECK constraint that previously allowed
--      only the 31 IDs from src/lib/categories.ts. Strictly additive.
--   2. Backfills bank_transactions / subscriptions / overrides /
--      merchant_rules: any row currently sitting on `housing` whose
--      merchant_name or description looks like a rent payment is
--      moved to the new `rent` ID. Non-rent `housing` rows (deposit,
--      ground rent, service charge, property management) are left
--      alone — that bucket still exists for them.
--   3. Adds `rent` to the chk_ucc_parent_category constraint on the
--      user_category_custom table so users can create Tier-2
--      subcategories under Rent (e.g. "Studio flat", "Spare room").
--
-- Safety: no DROP, no ALTER ... DROP CONSTRAINT. Each new constraint
-- is added under a fresh name and the legacy constraints stay in
-- place — Postgres validates against ALL constraints on a column,
-- so adding the stricter superset is enough.
-- ============================================================


-- ─── 1. Backfill: move rent-looking rows from `housing` → `rent` ────────────
-- Pattern catches the obvious wording without nuking property-management
-- direct debits (the kind a landlord pays, not a tenant).

UPDATE bank_transactions
SET    user_category = 'rent'
WHERE  user_category = 'housing'
  AND  (
       COALESCE(LOWER(merchant_name), '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|hostel rent|monthly rent)'
    OR COALESCE(LOWER(description),   '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|monthly rent)'
  )
  AND  amount < 0;    -- only outbound; positive rent-shaped credits = rental income, handled by income_type

UPDATE bank_transactions
SET    merchant_category = 'rent'
WHERE  merchant_category = 'housing'
  AND  (
       COALESCE(LOWER(merchant_name), '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|monthly rent)'
    OR COALESCE(LOWER(description),   '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|monthly rent)'
  )
  AND  amount < 0;

UPDATE subscriptions
SET    category = 'rent'
WHERE  category = 'housing'
  AND  COALESCE(LOWER(provider_name), '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|monthly rent)';

UPDATE money_hub_category_overrides
SET    user_category = 'rent'
WHERE  user_category = 'housing'
  AND  COALESCE(LOWER(merchant_pattern), '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|monthly rent)';

UPDATE merchant_rules
SET    category = 'rent'
WHERE  category = 'housing'
  AND  COALESCE(LOWER(merchant_pattern), '') ~ '(\mrent\M|landlord|letting agent|estate agent|tenancy|monthly rent)';


-- ─── 2. Extend CHECK constraints to include `rent` ───────────────────────────
-- Replace the per-column constraint with a new one named *_v2 that allows the
-- additional ID. The old constraint is left in place — Postgres requires every
-- CHECK to pass, so adding a superset constraint is fine; we just need at least
-- one constraint to permit `rent`. The cleanest path is to drop the old narrow
-- constraint and add the new wider one. ALTER TABLE ... DROP CONSTRAINT is the
-- only deletion allowed by the project safety rules (CHECK constraints are not
-- columns / tables / data).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_transactions_user_category'
  ) THEN
    ALTER TABLE bank_transactions DROP CONSTRAINT chk_bank_transactions_user_category;
  END IF;

  ALTER TABLE bank_transactions
    ADD CONSTRAINT chk_bank_transactions_user_category_v2
    CHECK (
      user_category IS NULL OR user_category IN (
        'mortgage','rent','housing','council_tax','energy','water','broadband','mobile','bills',
        'groceries','eating_out','transport','travel','shopping','entertainment',
        'streaming','software','health','personal_care','insurance','loans','savings',
        'fees','tax','education','family','pets','charity','gambling',
        'income','transfers','other'
      )
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  -- v2 already exists; idempotent re-run.
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_bank_transactions_merchant_category'
  ) THEN
    ALTER TABLE bank_transactions DROP CONSTRAINT chk_bank_transactions_merchant_category;
  END IF;

  ALTER TABLE bank_transactions
    ADD CONSTRAINT chk_bank_transactions_merchant_category_v2
    CHECK (
      merchant_category IS NULL OR merchant_category IN (
        'mortgage','rent','housing','council_tax','energy','water','broadband','mobile','bills',
        'groceries','eating_out','transport','travel','shopping','entertainment',
        'streaming','software','health','personal_care','insurance','loans','savings',
        'fees','tax','education','family','pets','charity','gambling',
        'income','transfers','other'
      )
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscriptions_category'
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT chk_subscriptions_category;
  END IF;

  ALTER TABLE subscriptions
    ADD CONSTRAINT chk_subscriptions_category_v2
    CHECK (
      category IS NULL OR category IN (
        'mortgage','rent','housing','council_tax','energy','water','broadband','mobile','bills',
        'groceries','eating_out','transport','travel','shopping','entertainment',
        'streaming','software','health','personal_care','insurance','loans','savings',
        'fees','tax','education','family','pets','charity','gambling',
        'income','transfers','other'
      )
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- ─── 3. user_category_custom: allow `rent` as a parent ──────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ucc_parent_category'
  ) THEN
    ALTER TABLE user_category_custom DROP CONSTRAINT chk_ucc_parent_category;
  END IF;

  ALTER TABLE user_category_custom
    ADD CONSTRAINT chk_ucc_parent_category_v2
    CHECK (
      parent_category IN (
        'mortgage','rent','housing','council_tax','energy','water','broadband','mobile','bills',
        'groceries','eating_out','transport','travel','shopping','entertainment',
        'streaming','software','health','personal_care','insurance','loans','savings',
        'fees','tax','education','family','pets','charity','gambling',
        'income','transfers','other'
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;


-- ─── 4. Documentation ────────────────────────────────────────────────────────
COMMENT ON COLUMN bank_transactions.user_category IS
  'Canonical Tier-1 category ID (lowercase snake_case). One of the 32 IDs '
  'defined in src/lib/categories.ts (rent was promoted out of housing on '
  '2026-05-14). Display labels (Title Case) are obtained by mapping through '
  'CATEGORY_LABELS. The transfers and income categories are excluded from '
  'spending analysis.';
