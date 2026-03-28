-- Phase 2 Legal Intelligence: bug fixes for disputes table
-- 1. Backfill provider_type for NULL rows based on provider_name
-- 2. Normalise inconsistent provider name casing
-- 3. Add DELETE RLS policy on disputes table

-- ============================================================
-- 1. Backfill NULL provider_type from provider_name patterns
-- ============================================================

UPDATE disputes
SET provider_type = CASE
  WHEN provider_name ILIKE '%british gas%' OR provider_name ILIKE '%eon%' OR provider_name ILIKE '%e.on%'
    OR provider_name ILIKE '%octopus%' OR provider_name ILIKE '%ovo%' OR provider_name ILIKE '%edf%'
    OR provider_name ILIKE '%scottish power%' OR provider_name ILIKE '%sse%' OR provider_name ILIKE '%shell energy%'
    OR provider_name ILIKE '%bulb%' THEN 'energy'
  WHEN provider_name ILIKE '%sky%' OR provider_name ILIKE '%virgin media%' OR provider_name ILIKE '%onestream%'
    OR provider_name ILIKE '%talktalk%' OR provider_name ILIKE '%plusnet%' OR provider_name ILIKE '%vodafone%'
    OR provider_name ILIKE '%ee%' OR provider_name ILIKE '%three%' OR provider_name ILIKE '%o2%'
    OR provider_name ILIKE '%bt%' OR provider_name ILIKE '%now tv%' THEN 'broadband'
  WHEN provider_name ILIKE '%lendinvest%' OR provider_name ILIKE '%lowell%' OR provider_name ILIKE '%cabot%'
    OR provider_name ILIKE '%barclays%' OR provider_name ILIKE '%lloyds%' OR provider_name ILIKE '%natwest%'
    OR provider_name ILIKE '%hsbc%' OR provider_name ILIKE '%santander%' OR provider_name ILIKE '%halifax%'
    OR provider_name ILIKE '%nationwide%' THEN 'finance'
  WHEN provider_name ILIKE '%hmrc%' OR provider_name ILIKE '%dvla%' OR provider_name ILIKE '%council%'
    OR provider_name ILIKE '%nhs%' THEN 'government'
  ELSE 'general'
END
WHERE provider_type IS NULL;

-- ============================================================
-- 2. Normalise known provider name casing
-- ============================================================

UPDATE disputes
SET provider_name = CASE
  WHEN LOWER(provider_name) = 'eon'              THEN 'E.ON'
  WHEN LOWER(provider_name) = 'e.on'             THEN 'E.ON'
  WHEN LOWER(provider_name) = 'british gas'      THEN 'British Gas'
  WHEN LOWER(provider_name) = 'virgin media'     THEN 'Virgin Media'
  WHEN LOWER(provider_name) = 'onestream'        THEN 'OneStream'
  WHEN LOWER(provider_name) = 'lendinvest'       THEN 'LendInvest'
  WHEN LOWER(provider_name) = 'sky'              THEN 'Sky'
  WHEN LOWER(provider_name) = 'bt'               THEN 'BT'
  WHEN LOWER(provider_name) = 'vodafone'         THEN 'Vodafone'
  WHEN LOWER(provider_name) = 'talktalk'         THEN 'TalkTalk'
  WHEN LOWER(provider_name) = 'plusnet'          THEN 'Plusnet'
  WHEN LOWER(provider_name) = 'octopus energy'   THEN 'Octopus Energy'
  WHEN LOWER(provider_name) = 'ovo energy'       THEN 'OVO Energy'
  WHEN LOWER(provider_name) = 'ovo'              THEN 'OVO Energy'
  WHEN LOWER(provider_name) = 'edf energy'       THEN 'EDF Energy'
  WHEN LOWER(provider_name) = 'edf'              THEN 'EDF Energy'
  WHEN LOWER(provider_name) = 'scottish power'   THEN 'Scottish Power'
  WHEN LOWER(provider_name) = 'hmrc'             THEN 'HMRC'
  WHEN LOWER(provider_name) = 'dvla'             THEN 'DVLA'
  WHEN LOWER(provider_name) = 'nhs'              THEN 'NHS'
  ELSE provider_name
END
WHERE LOWER(provider_name) IN (
  'eon', 'e.on', 'british gas', 'virgin media', 'onestream', 'lendinvest',
  'sky', 'bt', 'vodafone', 'talktalk', 'plusnet', 'octopus energy',
  'ovo energy', 'ovo', 'edf energy', 'edf', 'scottish power', 'hmrc', 'dvla', 'nhs'
);

-- ============================================================
-- 3. Add missing DELETE RLS policy on disputes table
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'disputes'
    AND policyname = 'Users can delete own disputes'
  ) THEN
    CREATE POLICY "Users can delete own disputes"
      ON disputes FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
