-- Bug fix: contract_extractions + council_tax legal reference corrections
-- Covers three issues:
--   1. contract_extractions missing RLS INSERT/SELECT policies (blocks all inserts)
--   2. contract_extractions CHECK constraint prevents standalone uploads
--   3. council_tax legal reference with mismatched summary/URL

-- ============================================================
-- 1. contract_extractions RLS policies
-- The table was created via Supabase MCP without RLS policies,
-- silently blocking all authenticated user inserts.
-- ============================================================

ALTER TABLE contract_extractions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_extractions' AND policyname = 'Users can insert own contract extractions'
  ) THEN
    CREATE POLICY "Users can insert own contract extractions"
      ON contract_extractions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_extractions' AND policyname = 'Users can view own contract extractions'
  ) THEN
    CREATE POLICY "Users can view own contract extractions"
      ON contract_extractions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_extractions' AND policyname = 'Users can update own contract extractions'
  ) THEN
    CREATE POLICY "Users can update own contract extractions"
      ON contract_extractions FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contract_extractions' AND policyname = 'Users can delete own contract extractions'
  ) THEN
    CREATE POLICY "Users can delete own contract extractions"
      ON contract_extractions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 2. Drop the CHECK constraint that requires dispute_id OR subscription_id.
-- Users should be able to upload documents to the Contract Vault
-- independently, without linking to a dispute or subscription.
-- ============================================================

ALTER TABLE contract_extractions DROP CONSTRAINT IF EXISTS contract_extractions_link_check;

-- ============================================================
-- 3. Fix mismatched council tax legal reference (id prefix: e12dcf74).
-- The stored summary described Council Tax Reduction Schemes but the
-- source_url pointed to the Disabled Band Reduction scheme — two distinct rights.
-- Fix: update the existing record to correctly describe Disabled Band Reduction,
-- then add a separate record for Council Tax Reduction Schemes.
-- ============================================================

UPDATE legal_references
SET
  summary = 'If a disabled person lives in your property, you may qualify for a council tax band reduction (banded as if the property were one band lower, or the lowest band D rate if already in band A). Apply to your local council. This reduces the annual bill regardless of income.',
  verification_notes = 'Corrected: previously misdescribed as Reduction Schemes. This ref covers Disabled Band Reduction only. See separate entry for Council Tax Reduction Schemes.'
WHERE id::text LIKE 'e12dcf74%'
  AND category = 'council_tax';

-- Add the missing Council Tax Reduction Schemes reference
INSERT INTO legal_references (
  category, subcategory, law_name, section, summary,
  source_url, source_type, applies_to, strength, escalation_body,
  verification_status
)
SELECT
  'council_tax',
  'reduction_schemes',
  'Council Tax Reduction Schemes (England) Regulations 2012',
  'Reg 2 + Local Authority Schemes',
  'Low-income households can apply for a Council Tax Reduction (formerly Council Tax Benefit) from their local council. The amount depends on your income, savings, and household composition. Some councils offer up to 100% reduction. This is a statutory entitlement — apply directly to your local council.',
  'https://www.legislation.gov.uk/uksi/2012/2885',
  'statute',
  ARRAY['council_tax'],
  'strong',
  'Local Authority / Valuation Tribunal',
  'current'
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Council Tax Reduction Schemes (England) Regulations 2012'
);
