-- Fix mismatched council_tax legal reference (id prefix: e12dcf74)
-- The summary previously described a mismatch between the stored reference text and the source URL.
-- This migration corrects the summary to accurately describe Council Tax Reduction Schemes
-- and splits the entry so the disabled band reduction is a separate, clearly-labelled reference.

-- Step 1: Fix the existing mismatched reference to describe Council Tax Reduction Schemes accurately
UPDATE legal_references
SET
  law_name    = 'Council Tax Reduction Schemes',
  section     = 'Local Government Finance Act 1992, s.13A (as amended)',
  summary     = 'Local authorities must operate a Council Tax Reduction Scheme for residents on low income. You may be entitled to a reduction — contact your local council to apply. Eligibility and discount levels vary by council.',
  applies_to  = '["council_tax"]',
  updated_at  = NOW()
WHERE id::text LIKE 'e12dcf74%'
  AND category = 'council_tax';

-- Step 2: Add a separate reference for Disabled Band Reduction (distinct entitlement, often confused with CTR)
INSERT INTO legal_references (
  category,
  law_name,
  section,
  summary,
  source_url,
  escalation_body,
  strength,
  verification_status,
  confidence_score,
  applies_to,
  created_at,
  updated_at
)
SELECT
  'council_tax',
  'Council Tax Disabled Band Reduction',
  'Council Tax (Additional Provisions for Discount Disregards) Regulations 1992',
  'If your property has been adapted for a disabled resident (e.g. extra bathroom, wheelchair space), you may qualify for a one-band reduction in your council tax bill. Apply to your local council.',
  'https://www.gov.uk/apply-disabled-band-reduction',
  'Local Government Ombudsman',
  'strong',
  'current',
  90,
  '["council_tax"]',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Council Tax Disabled Band Reduction'
    AND category = 'council_tax'
);
