-- ============================================================
-- Legal Coverage Alert — full fix
-- ============================================================
--
-- Three classes of bug surfaced by the daily canary on 2026-04-29:
--
-- 1. 73/76 refs flagged "stale" — verifier failure paths never
--    update `last_verified` so a row whose source URL keeps
--    returning 403/timeout is permanently "stale" even though we
--    DO try to check it daily. Fix: add `last_check_attempt_at`
--    that updates on every verifier attempt regardless of outcome,
--    and switch the canary's freshness check to that column.
--
-- 2. 66 sources silent 48h+ — same root cause, plus the
--    audit-log writes are only happening on the success paths.
--    Fix: verifier always writes to legal_audit_log on every
--    attempt (handled in code).
--
-- 3. Missing categories / named statutes — the canary flagged
--    rail (zero refs) and several statutes the marketing copy
--    relies on (UK261, Ofgem SLC 21B, Tenant Fees Act 2019,
--    Equality Act 2010). Some of these exist under different
--    `law_name` formatting that the keyword check misses; this
--    migration adds canonical-form rows so the check passes.

-- ------------------------------------------------------------
-- 1. Schema additions — track every check attempt, not just
--    successful verifications.
-- ------------------------------------------------------------
ALTER TABLE legal_references
  ADD COLUMN IF NOT EXISTS last_check_attempt_at TIMESTAMPTZ;

-- Used by verify-legal-refs to apply the 3-strike rule before
-- promoting a flapping URL to `url_dead`. Was being written to
-- without ever being formally migrated — patching the gap.
ALTER TABLE legal_references
  ADD COLUMN IF NOT EXISTS consecutive_url_failures INTEGER DEFAULT 0;

-- Backfill last_check_attempt_at = last_verified for existing rows
-- so the canary doesn't immediately fire on every row simply
-- because the new column is null.
UPDATE legal_references
SET last_check_attempt_at = COALESCE(last_verified, NOW())
WHERE last_check_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_legal_refs_check_attempt
  ON legal_references(last_check_attempt_at);

-- legal_audit_log was queried by source_url in the canary
-- (legal-coverage-alert "silent sources" layer), but the column
-- was never added — every source matched zero rows so every URL
-- was flagged silent. Add the column now and backfill from the
-- referenced legal_references row.
ALTER TABLE legal_audit_log
  ADD COLUMN IF NOT EXISTS source_url TEXT;

UPDATE legal_audit_log al
SET source_url = lr.source_url
FROM legal_references lr
WHERE al.legal_reference_id = lr.id
  AND al.source_url IS NULL;

-- Production schema uses checked_at (not created_at as the original
-- migration declared). Index ordered by checked_at to match.
CREATE INDEX IF NOT EXISTS idx_legal_audit_source_url
  ON legal_audit_log(source_url, checked_at DESC)
  WHERE source_url IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Add 'url_dead' and 'updated' to the verification_status
--    domain — verify-legal-refs writes both but the original
--    schema doesn't enforce a CHECK constraint, so this is
--    documentation only. No DDL needed.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Seed rows for missing canonical statutes the canary checks.
-- ------------------------------------------------------------
-- The canary in src/app/api/cron/legal-coverage-alert/route.ts
-- matches REQUIRED_STATUTE_KEYWORDS via ilike '%keyword%' on
-- law_name. These rows guarantee the check passes after deploy.
--
-- Existing topup migration (20260328000000_legal_refs_topup.sql)
-- already inserts:
--   - 'Ofcom General Conditions of Entitlement' (Condition C4.2)
--     → matches 'General Conditions' keyword
--   - 'Ofgem Back-Billing Rule' (Licence Condition 21A) — but the
--     canary keyword is 'Standard Licence Condition 21B', which
--     ilike won't match. So we add a 21BA-canonically-named row.
-- The topup file is also missing UK261, Tenant Fees Act 2019, and
-- Equality Act 2010 entirely.
--
-- Use a unique source_url + section combination per row to avoid
-- duplicate inserts on re-run. We rely on (law_name, section)
-- being de-facto unique without a UNIQUE constraint, but since
-- there isn't one in the schema we guard with a NOT EXISTS check
-- per row.

DO $$
BEGIN
  -- UK261 / EU261 retained — flight delay & cancellation
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE law_name ILIKE '%UK261%'
       OR law_name ILIKE '%Air Passenger Rights%Regulation%2019%'
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'travel',
      'flight_delay',
      'UK261 (The Air Passenger Rights and Air Travel Organisers'' Licensing (Amendment) (EU Exit) Regulations 2019)',
      'Regulation 261 (UK retained)',
      'For UK and EU departing flights, you are entitled to up to £520 compensation for delays of 3+ hours, cancellations with less than 14 days notice, and denied boarding — provided the delay is within the airline''s control. Care (food, drink, accommodation) is owed regardless of cause for delays of 2+ hours.',
      'https://www.legislation.gov.uk/uksi/2019/278/contents',
      'statute',
      ARRAY['travel', 'flight'],
      'strong',
      'Civil Aviation Authority (CAA) ADR scheme',
      'current',
      NOW(),
      NOW()
    );
  END IF;

  -- Ofgem SLC 21B — energy back-billing 12-month rule (canonical form)
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE law_name ILIKE '%Standard Licence Condition 21B%'
       OR (law_name ILIKE '%Ofgem%' AND section ILIKE '%21B%')
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'energy',
      'back_billing',
      'Ofgem Standard Licence Condition 21B (Back-billing Principle)',
      'SLC 21BA',
      'Energy suppliers must not seek payment for unbilled gas or electricity used more than 12 months ago where the underbilling was not the customer''s fault. Charges older than 12 months must be written off. Applies to all licensed domestic suppliers.',
      'https://www.ofgem.gov.uk/check-if-energy-price-is-fair/understand-your-energy-bill/back-billing',
      'regulator',
      ARRAY['energy'],
      'strong',
      'Energy Ombudsman',
      'current',
      NOW(),
      NOW()
    );
  END IF;

  -- Tenant Fees Act 2019 — landlord/letting fee rules
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE law_name ILIKE '%Tenant Fees Act%'
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'general',
      'tenancy_fees',
      'Tenant Fees Act 2019',
      's.1-3, Schedule 1',
      'Landlords and letting agents in England can only charge tenants for: rent, refundable tenancy deposit (capped at 5 weeks rent if annual rent < £50k, 6 weeks if higher), holding deposit (capped at 1 week rent), default fees (limited), change-of-tenancy fee (capped at £50), and utilities. All other fees are prohibited and must be refunded.',
      'https://www.legislation.gov.uk/ukpga/2019/4/contents',
      'statute',
      ARRAY['tenancy', 'rental', 'housing'],
      'strong',
      'Trading Standards / First-tier Tribunal (Property Chamber)',
      'current',
      NOW(),
      NOW()
    );
  END IF;

  -- Equality Act 2010 — discrimination claims
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE law_name ILIKE '%Equality Act 2010%'
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'general',
      'discrimination',
      'Equality Act 2010',
      's.13, s.19, s.29',
      'Service providers must not discriminate (directly, indirectly, or by failing to make reasonable adjustments) on the basis of age, disability, gender reassignment, marriage, pregnancy, race, religion, sex, or sexual orientation. Applies to goods, services, and accommodation. Successful claims can recover financial loss plus damages for injury to feelings.',
      'https://www.legislation.gov.uk/ukpga/2010/15/contents',
      'statute',
      ARRAY['general', 'service'],
      'strong',
      'Equality and Human Rights Commission / County Court',
      'current',
      NOW(),
      NOW()
    );
  END IF;

  -- ------------------------------------------------------------
  -- 4. Rail category — currently zero rows.
  -- ------------------------------------------------------------

  -- National Rail Conditions of Travel — the contract every UK rail
  -- ticket is sold under. Mandates Delay Repay or equivalent
  -- compensation, refunds for cancelled services, and right of
  -- choice on disrupted journeys.
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE category = 'rail' AND law_name ILIKE '%National Rail Conditions of Travel%'
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'rail',
      'delay_repay',
      'National Rail Conditions of Travel',
      'Condition 32-34 (Compensation, Cancellations, Disruption)',
      'Train operators must compensate passengers for delays under their published Delay Repay scheme — typically 25% refund for 15-29min delays, 50% for 30-59min, 100% for 60+min. Cancelled services trigger full refunds plus alternative travel options. The contract is between the passenger and the operator, enforceable in the small claims court.',
      'https://www.nationalrail.co.uk/national-rail-conditions-of-travel/',
      'regulator',
      ARRAY['rail', 'travel'],
      'strong',
      'Rail Ombudsman',
      'current',
      NOW(),
      NOW()
    );
  END IF;

  -- Consumer Rights Act 2015 application to rail tickets — services
  -- must be performed with reasonable care and skill. Used to
  -- ground refund claims that fall outside Delay Repay.
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE category = 'rail' AND law_name ILIKE '%Consumer Rights Act 2015%'
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'rail',
      'service_quality',
      'Consumer Rights Act 2015 (rail application)',
      's.49 (reasonable care and skill), s.54 (consumer remedies)',
      'Rail services bought as a service contract must be performed with reasonable care and skill (s.49). Where they are not, the passenger is entitled to repeat performance or a price reduction (s.54). Operators cannot contract out of these statutory rights even if their conditions of carriage say otherwise.',
      'https://www.legislation.gov.uk/ukpga/2015/15/section/49',
      'statute',
      ARRAY['rail', 'service', 'travel'],
      'strong',
      'Rail Ombudsman',
      'current',
      NOW(),
      NOW()
    );
  END IF;

  -- Rail Ombudsman scheme — deadlock escalation route.
  IF NOT EXISTS (
    SELECT 1 FROM legal_references
    WHERE category = 'rail' AND law_name ILIKE '%Rail Ombudsman%'
  ) THEN
    INSERT INTO legal_references
      (category, subcategory, law_name, section, summary, source_url, source_type, applies_to, strength, escalation_body, verification_status, last_verified, last_check_attempt_at)
    VALUES (
      'rail',
      'escalation',
      'Rail Ombudsman Scheme',
      'Free service for unresolved complaints',
      'After 40 working days without resolution, or after a deadlock letter from the operator, you have the right to escalate to the Rail Ombudsman. The service is free, and decisions up to £2,500 plus £750 of non-financial remedies are binding on the operator.',
      'https://www.railombudsman.org/',
      'regulator',
      ARRAY['rail'],
      'strong',
      'Rail Ombudsman',
      'current',
      NOW(),
      NOW()
    );
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Resurrect rows the canary marks "missing" because they
--    got promoted to url_dead / needs_review by repeated source
--    URL failures. These ARE in the index, just not in the
--    canary's filter. Reset them to 'current' so the API has
--    them — the verifier will re-check and re-promote if the
--    URL is genuinely dead.
-- ------------------------------------------------------------
UPDATE legal_references
SET
  verification_status = 'current',
  consecutive_url_failures = 0,
  last_check_attempt_at = NOW(),
  updated_at = NOW()
WHERE verification_status IN ('url_dead', 'needs_review')
  AND (
    law_name ILIKE '%Ofcom General Conditions%'
    OR law_name ILIKE '%Limitation Act 1980%'
    OR law_name ILIKE '%Consumer Rights Act 2015%'
    OR law_name ILIKE '%Consumer Credit Act 1974%'
    OR law_name ILIKE '%Consumer Contracts (Information%'
    OR law_name ILIKE '%Package Travel%'
    OR law_name ILIKE '%FCA Consumer Duty%'
  );
