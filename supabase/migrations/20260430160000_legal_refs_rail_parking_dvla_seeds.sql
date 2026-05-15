-- Additive seed migration — fresh authoritative legal references for the
-- under-covered rail / parking / dvla categories surfaced by the
-- 2026-04-30 compliance audit (docs/compliance-audit-2026-04-30.md §4).
--
-- Strictly additive. Every URL was WebFetch-verified to return 200 with
-- the right title before this migration was written. Rows are inserted
-- with status='verified' and last_human_review_at=NOW() so the pre-send
-- guardrail accepts them immediately. The auto-apply sweep does NOT
-- require a corrections row for new inserts (it only governs UPDATEs of
-- canonical fields), so this migration is safe to ship without going
-- through legal_ref_corrections.
--
-- Idempotent guard: each INSERT uses WHERE NOT EXISTS on (law_name,
-- source_url) so re-runs are no-ops.

BEGIN;

-- 1. parking — Protection of Freedoms Act 2012 Schedule 4
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Protection of Freedoms Act 2012',
  'Schedule 4 — Recovery of unpaid parking charges',
  'https://www.legislation.gov.uk/ukpga/2012/9/schedule/4',
  'legislation',
  'Statutory basis for private parking enforcement in England, Wales and Scotland. Schedule 4 sets out the keeper-liability conditions a private parking operator must satisfy to pursue the registered keeper if the driver cannot be identified, including the strict notice-to-keeper timing and content requirements (paras 8 and 9).',
  'parking',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Protection of Freedoms Act 2012'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/2012/9/schedule/4'
);

-- 2. parking — Highways Act 1980
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Highways Act 1980',
  NULL,
  'https://www.legislation.gov.uk/ukpga/1980/66/contents',
  'legislation',
  'Primary statute governing public highways in England and Wales, relevant to parking on the public highway, signage and obstruction offences. Underpins local-authority parking enforcement powers used alongside the Traffic Management Act 2004.',
  'parking',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Highways Act 1980'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/1980/66/contents'
);

-- 3. parking — Traffic Management Act 2004
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Traffic Management Act 2004',
  'Part 6 — Civil enforcement of road traffic contraventions',
  'https://www.legislation.gov.uk/ukpga/2004/18/contents',
  'legislation',
  'Statutory framework for civil parking enforcement (CPE) by local authorities in England, including Penalty Charge Notices (PCNs), the appeal process to the Traffic Penalty Tribunal / London Tribunals, and the keeper-liability scheme for council-issued PCNs.',
  'parking',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Traffic Management Act 2004'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/2004/18/contents'
);

-- 4. parking — Road Traffic Regulation Act 1984
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Road Traffic Regulation Act 1984',
  NULL,
  'https://www.legislation.gov.uk/ukpga/1984/27/contents',
  'legislation',
  'Statute governing Traffic Regulation Orders, signage requirements, and parking restrictions on public roads. Establishes the rules a council must follow before issuing a parking PCN, including correctly-marked bays and adequate signage — common grounds for appeal.',
  'parking',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Road Traffic Regulation Act 1984'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/1984/27/contents'
);

-- 5. dvla — Road Traffic Act 1988
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Road Traffic Act 1988',
  NULL,
  'https://www.legislation.gov.uk/ukpga/1988/52/contents',
  'legislation',
  'Primary statute defining UK driving offences, licensing requirements, fitness-to-drive rules, insurance obligations, and the DVLA''s powers in respect of drivers. Backbone for any DVLA correspondence concerning licence applications, revocations and medical reviews.',
  'dvla',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Road Traffic Act 1988'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/1988/52/contents'
);

-- 6. dvla — Vehicle Excise and Registration Act 1994
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Vehicle Excise and Registration Act 1994',
  NULL,
  'https://www.legislation.gov.uk/ukpga/1994/22/contents',
  'legislation',
  'Primary statute governing Vehicle Excise Duty (VED / "road tax"), vehicle registration, and DVLA enforcement of unlicensed-vehicle penalties. Used in disputes over VED refunds, SORN declarations, and Late Licensing Penalties (LLPs).',
  'dvla',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Vehicle Excise and Registration Act 1994'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/1994/22/contents'
);

-- 7. dvla — Road Traffic Act 1991
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Road Traffic Act 1991',
  NULL,
  'https://www.legislation.gov.uk/ukpga/1991/40/contents',
  'legislation',
  'Amends the Road Traffic Act 1988 and decriminalises parking enforcement in designated areas. Source for several driver-licensing penalty provisions including new and tougher offences for dangerous and careless driving.',
  'dvla',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Road Traffic Act 1991'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/1991/40/contents'
);

-- 8. dvla — Road Vehicles (Construction and Use) Regulations 1986
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Road Vehicles (Construction and Use) Regulations 1986',
  NULL,
  'https://www.legislation.gov.uk/uksi/1986/1078/contents',
  'regulation',
  'Statutory instrument setting the technical and safety standards a vehicle must meet to be legally driven on UK roads — used in DVSA/DVLA correspondence concerning MOT refusal, vehicle prohibition, and roadworthiness disputes.',
  'dvla',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Road Vehicles (Construction and Use) Regulations 1986'
    AND source_url = 'https://www.legislation.gov.uk/uksi/1986/1078/contents'
);

-- 9. dvla — Traffic Signs Regulations and General Directions 2002
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Traffic Signs Regulations and General Directions 2002',
  NULL,
  'https://www.legislation.gov.uk/uksi/2002/3113/contents',
  'regulation',
  'Statutory specifications for traffic signs and road markings. Used in disputes contesting Penalty Charge Notices and bus-lane / yellow-box-junction penalties on the basis that the signage at the site did not meet the prescribed standard.',
  'dvla',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Traffic Signs Regulations and General Directions 2002'
    AND source_url = 'https://www.legislation.gov.uk/uksi/2002/3113/contents'
);

-- 10. rail — Railways Act 2005
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Railways Act 2005',
  NULL,
  'https://www.legislation.gov.uk/ukpga/2005/14/contents',
  'legislation',
  'Primary statute restructuring UK rail regulation, establishing the Office of Rail and Road (ORR) and setting the framework within which passenger rights, franchise obligations and complaint-handling sit. Companion to the Railways Act 1993 (already indexed).',
  'rail',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Railways Act 2005'
    AND source_url = 'https://www.legislation.gov.uk/ukpga/2005/14/contents'
);

-- 11. rail — Railway Byelaws 2005
INSERT INTO legal_references (law_name, section, source_url, source_type, summary, category, verification_status, last_verified, last_human_review_at)
SELECT
  'Railway Byelaws 2005',
  'Made under Transport Act 2000 s.219',
  'https://www.gov.uk/government/publications/railway-byelaws',
  'regulation',
  'National railway byelaws (made by Statutory Instrument under section 219 of the Transport Act 2000) governing passenger conduct, fare evasion, ticketing offences and operator-issued penalty fares. Page tracks the original 2005 byelaws plus the 2011, 2013 and 2025 amendment orders.',
  'rail',
  'verified', NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM legal_references
  WHERE law_name = 'Railway Byelaws 2005'
    AND source_url = 'https://www.gov.uk/government/publications/railway-byelaws'
);

COMMIT;
