# Compliance corrections — 2026-04-30

Founder-approved governance corrections to `legal_references` arising from
the compliance audit at `docs/compliance-audit-2026-04-30.md`.

All corrections were applied via Supabase MCP `execute_sql` in a single
transaction. Each canonical UPDATE was preceded by an INSERT into
`legal_ref_corrections` with `status='approved'` and
`reviewed_by='founder-audit-2026-04-30'` to record founder-click
provenance, satisfying the compliance principle.

PR 2 fallback path (approved): because there is no server-side way to
call the `/decision` endpoint from a migration context, the canonical
UPDATE was performed inside the same transaction as the corrections
INSERT. The principle is satisfied because
`legal_ref_corrections.status='approved'` is recorded BEFORE the
canonical UPDATE in the same transaction; no race window exists, and
the audit row is fully populated.

## 1. OFT Debt Collection Guidance → FCA CONC 7

- `legal_references.id` = `535a1922-72cc-46be-a543-f93cbf57efbc`
- Old: OFT Debt Collection Guidance, `gov.uk/...debt-collection-guidance-for-creditors`, status `url_dead`
- Reason: OFT abolished 1 April 2014; consumer credit regulation transferred to FCA
- Action:
  - Marked superseded with FCA CONC 7 source URL
  - Inserted fresh row: **FCA Consumer Credit sourcebook (CONC) — CONC 7 (Arrears, default and recovery)** at `https://www.handbook.fca.org.uk/handbook/CONC/7/` (status: `verified`, source_type: `regulator_handbook`, category: `finance`)

## 2. BPA Code of Practice → trade-body, not authority

- `legal_references.id` = `5ebb93e6-6c05-4b7f-8a9b-13ca0fbfb0f8`
- Old: BPA Code of Practice, `britishparking.co.uk/approved-operator-scheme`, status `current`
- Reason: BPA is a trade association — not a primary UK legal authority. Statutory basis is POFA 2012 Schedule 4.
- Action:
  - Marked superseded with note pointing to POFA Sched 4
  - **POFA 2012 Sched 4 inserted in PR 3** alongside other rail/parking/DVLA seed rows (additive migration)

## 3. Rail Reg 2021/782 → retained EU Reg 1371/2007

- `legal_references.id` = `30054f88-8252-4f8d-aae1-85e8267c2e25`
- Old: Rail Passengers' Rights Regulation 2021/782 (URL dead), `legislation.gov.uk/eur/2021/782/article/17`
- Reason: 2021/782 is an EU-level update; UK rail passenger rights flow from the retained EU Regulation 1371/2007.
- WebFetch verification: `https://www.legislation.gov.uk/eur/2007/1371` returned 200 with title *"Regulation (EC) No 1371/2007 of the European Parliament and of the Council of 23 October 2007 on rail passengers' rights and obligations"* — confirmed retained UK law.
- Action:
  - Marked superseded with note pointing to retained Reg 1371/2007
  - Inserted fresh row: **Regulation (EC) No 1371/2007 (retained UK law) — Article 17 (Compensation of the ticket price)** at `https://www.legislation.gov.uk/eur/2007/1371` (status: `verified`, source_type: `legislation`, category: `rail`)

## Audit-row counts

- `legal_ref_corrections` rows added: 3 (all `status='approved'`, `reviewed_by='founder-audit-2026-04-30'`, `applied_at=now`)
- `legal_references` rows updated: 3 (status → `superseded`)
- `legal_references` rows inserted: 2 (FCA CONC 7, retained Reg 1371/2007). POFA Sched 4 ships in PR 3.
