-- Fix two gym/fitness legal refs that were incorrectly labelled as 'general'.
-- These were being included in broadband, energy, and other non-gym dispute letters.

UPDATE legal_references
SET category = 'gym'
WHERE id IN (
  '8198fe95-0000-0000-0000-000000000000',
  'c71b4eac-0000-0000-0000-000000000000'
)
AND (
  law_name ILIKE '%gym%'
  OR summary ILIKE '%gym%'
  OR summary ILIKE '%membership%'
  OR (applies_to::text ILIKE '%gym%' OR applies_to::text ILIKE '%fitness%')
);

-- Broader safety net: any 'general' legal ref whose applies_to contains only
-- sector-specific terms (gym, fitness, membership) should be re-categorised.
UPDATE legal_references
SET category = 'gym'
WHERE category = 'general'
  AND applies_to IS NOT NULL
  AND applies_to::text ~* '(gym|fitness|membership)'
  AND NOT (applies_to::text ~* '(energy|broadband|mobile|insurance|travel|parking|debt|finance|hmrc|council|dvla|nhs)');
