# Compliance pipeline audit — 2026-04-30

Read-only investigation of the legal-citation compliance pipeline at `master @ d1212c01` (post PR α/β/γ/δ/ε/ζ/η + #386 authority allowlist + #390 email fix).

Scope: code-side gate verification + data-side audit of all 112 `legal_references` rows + live URL spot-check of 30 sampled URLs.

---

## 1. Headline verdict

**The pipeline is structurally sound but has one P0 governance gap: `/api/admin/legal-refs/verify` directly mutates `legal_references.verification_status` (and writes `verified_url`) without routing through `legal_ref_corrections` + founder approval.** That contradicts the "Compliance citation principle" in `CLAUDE.md` (`verification_status` is explicitly listed as a field that must not be mutated to a non-pending value without HITL approval). Everything else — pre-flight freshness, post-flight regex sanitiser, tiered fallback chain, authority allowlist gating in discovery + verify, reverse-lookup audit, `CITATION_ELIGIBLE_STATUSES` alignment across readers — is wired correctly. Data side is clean: 84/112 refs are active (current/updated/verified), 0 broken/superseded, 28 `url_dead` (all real, not false positives — Ofcom and Ofgem appear to have restructured their consumer-facing URLs in late April 2026 and the rows are pointing at pages that genuinely 404/403 now).

The biggest risk (after the P0 above) is a partial coverage hole: **rail / parking / dvla each have zero tier-1 (≤14d) refs**, and the `mobile` category has zero refs at all (B2B `REQUIRED_CATEGORIES` lists `broadband` not `mobile`, but the fallback chains in `legal-refs-guardrail.ts` reference `mobile` — minor inconsistency).

---

## 2. Code-side gate verification

| Gate | Status | Evidence |
|------|--------|----------|
| **1. Authority allowlist — discovery cron** | ✅ wired | `src/app/api/cron/discover-legal-refs/route.ts:330-344` calls `checkUkLegalAuthority(item.source_url)`; `rejected`/`unrecognised` → `skipped++; continue` (genuine drop, not silently queued). `secondary` → forced `confidence='low'` + warning prefix in summary. Counters surfaced in run notes. |
| **1. Authority allowlist — verifier** | ⚠️ partial | `src/app/api/admin/legal-refs/verify/route.ts:217-220` only sets `verified_url` when `authority.reason==='authority'`. `secondary`/`rejected`/`unrecognised` are silently dropped from `verified_url` but the row's `verification_status` is still updated from the Perplexity verdict — including potentially based on a non-authority source the verdict came from. The system-prompt instructs Perplexity to refuse non-authority sources, which is good defence in depth, but there is no hard post-call gate here. |
| **1. Authority allowlist — audit-authority endpoint** | ✅ wired | `src/app/api/admin/legal-refs/audit-authority/route.ts:87,161` runs `checkUkLegalAuthority` on every row, classifies into authority/secondary/rejected/unrecognised buckets. Read-only; no mutation. |
| **2. Pre-send freshness — B2C** | ✅ wired | `src/app/api/complaints/generate/route.ts:353` calls `checkRefFreshness` BEFORE the LLM. Stale rows attempt `refreshSingleRef` → `findTieredSubstitute` → `findChainSubstitute`, only stripping if the entire cascade fails. `freshnessTier` (`legal-refs-guardrail.ts:350-375`) applies the 90-day hard ceiling FIRST (line 365) BEFORE tier classification — verifies PR #385 P2 fix. `LEGAL_REF_MAX_AGE_DAYS` is clamped to ≤30 at line 370 (`Math.min(tier1MaxDays(), 30)`). |
| **2. Pre-send freshness — B2B** | ✅ wired | `src/lib/b2b/disputes.ts:543` calls `checkRefFreshness`. Same cascade as B2C but unsalvageable refs return a structured `STALE_CITATION` 503 rather than stripping (lines 605-613). |
| **3. Post-flight LLM citation validation — B2C** | ✅ wired | `src/app/api/complaints/generate/route.ts:551` calls `postFlightSanitise`. Rogue citations → substitute closest-token-match law_name OR strip + footer warning. Logs to `business_log` with `action='guardrail_postflight_sanitised'`. |
| **3. Post-flight LLM citation validation — B2B** | ✅ wired | `src/lib/b2b/disputes.ts:736,767-786` calls `extractCitations`+`validateCitations`. Differs from B2C: rogue structured statute returns 503 (`INVALID_STATUTE`) rather than substituting silently. Behaves per spec ("B2B 503, B2C strip+warn"). |
| **3. CITATION_PATTERNS regex** | ✅ adequate | `legal-refs-guardrail.ts:475-501` covers CRA, CCA, Sale of Goods, SGSA, UCTA, Consumer Contracts Regs, Communications Act, Gas Act, Electricity Act, DPA, Equality Act, Limitation Act, LGFA, Protection of Freedoms Act, FSMA, Payment Services Regs, Misrepresentation Act, Road Traffic Act, UK261/EU261/Reg 261/2004, Ofcom General Conditions, Ofgem SoC, Ofwat, FCA Handbook (CONC/DISP/BCOBS/ICOBS/Consumer Duty), ICO. Covers the ~25 marketed UK statutes. |
| **4. HITL review queue — corrections** | ❌ **broken (P0)** | `src/app/api/admin/legal-refs/verify/route.ts:211-220` writes DIRECTLY to `legal_references.verification_status`, `last_verified`, `verified_url`, `verification_notes`. It does NOT route through `legal_ref_corrections`. Per `CLAUDE.md` "Compliance citation principle": **"No code path may directly mutate a citation's law_name, source_url, source_type or verification_status to a non-pending value without passing through legal_ref_corrections and a founder approval click."** `verification_status` is in the prohibited list. The endpoint IS founder-gated (admin email check at line 273), so a founder click is involved, but the click goes straight to the canonical row, not through the proposed→approved corrections workflow. Same issue applies to the cron-driven `/api/cron/legal-refs-daily-reverify` and `/api/cron/reverify-all-legal-refs` (both call `legal_references.update` directly). The `legal_ref_corrections` decision endpoint at `src/app/api/admin/legal-ref-corrections/[id]/decision/route.ts` IS correct (only applies on click, only after status='pending' → 'approved'), so the HITL pathway exists; it just isn't the only one. |
| **5. Discovery never auto-merges** | ✅ wired | `discover-legal-refs/route.ts:346-356` only inserts into `legal_ref_candidates` with `status:'pending'`. Approval at `src/app/api/admin/legal-ref-candidates/[id]/decision/route.ts:85` requires explicit POST decision before promoting to `legal_references`. No auto-promote path found. |
| **6. Auto-apply low-risk only** | ✅ wired | `src/lib/legal-refs-auto-apply.ts:138-279` — `evaluateCorrection` has all three gates: gate 1 = `risk_score==='low'` (lines 155-162), gate 2 = source-text corroboration (proposed name + slug both in extracted_text) OR redirect/canonical proof for URL-only (lines 164-217), gate 3 = no domain/year/section change (lines 219-271). Any failed gate keeps `status='pending'`. `applyCorrection` (lines 310-380) only fires when `decision.shouldAutoApply===true`. |
| **7. Reverse-lookup audit** | ✅ wired | B2C: `complaints/generate/route.ts:692` `from('legal_ref_usages').insert(usageRows)`. B2B: `b2b/disputes.ts:854`. Both happen post-generation, fire-and-forget. |
| **7. Refs filtered by verification_status** | ✅ wired | B2C reads with `CITATION_PERMISSIVE_STATUSES` (line 299, includes `needs_review`); B2B reads with `CITATION_ELIGIBLE_STATUSES` (line 438, strict — excludes `needs_review`). Coverage page uses `CITATION_ELIGIBLE_STATUSES`. Citation-canary cron uses `CITATION_PERMISSIVE_STATUSES`. Coverage-alert cron uses `CITATION_ELIGIBLE_STATUSES`. All four readers point at the constants in `src/lib/legal-refs-statuses.ts` — no hardcoded arrays found. |
| **8. Reader allowlist alignment** | ✅ wired | `grep` of every `from('legal_references')` reader with a `verification_status` filter shows them all routed through `CITATION_ELIGIBLE_STATUSES` or `CITATION_PERMISSIVE_STATUSES`. The lone leftover hardcoded `['current','updated','verified']` arrays are inside `legal-refs-guardrail.ts` itself (lines 271, 414) which is the canonical definition and matches `ACTIVE_REF_STATUSES` exactly — could be DRYed but not a correctness bug. |

### Active bugs found

- **P0 — verify endpoint bypasses HITL gate.** `src/app/api/admin/legal-refs/verify/route.ts:211-227` writes `verification_status` (and `verified_url`, `last_verified`, `verification_notes`) straight onto `legal_references` after a Perplexity call. Per founder rule this must pass through `legal_ref_corrections` first. Recommended fix: change `verifyOne` to insert a row into `legal_ref_corrections` with `status='pending'`, `proposed_status=<derived>`, `proposed_source_url=<verdict.current_url if authority>`, and let the existing `/decision` endpoint apply on founder click. The same pattern applies to `legal-refs-daily-reverify` and `reverify-all-legal-refs` crons. (Did **not** ship a fix — risk of breaking the existing approved-by-design "Verify with AI" admin button flow without product input. Flagging for founder decision.)
- **Minor — semantic_change failed-gate not deduped on first add (line 226).** Pushes `'semantic_change'` then later checks `!failed.includes('semantic_change')` to emit gate-3-passed. The dedupe at line 278 cleans up the array but the boolean already-passed reason can co-exist with a fail reason. Cosmetic, not a correctness bug.

---

## 3. Data-side findings

Snapshot pulled 2026-04-30 from project `kcxxlesishltdmfctlmo`.

### 3.1 Status counts

| Status | Count |
|---|---|
| current | 58 |
| verified | 22 |
| updated | 4 |
| **active total** | **84** |
| url_dead | 28 |
| broken / superseded / needs_review / stale / outdated / error / NULL | 0 |
| **grand total** | **112** |

### 3.2 Authority distribution

All 112 source URLs are on the authority allowlist:

| Host | Count | Notes |
|---|---|---|
| legislation.gov.uk | 61 | Primary statute — green |
| ofcom.org.uk | 13 | 13/13 dead (403 from cron, 404 from real UA) |
| ofgem.gov.uk | 12 | 12 active rows include some still-live, but 14 url_dead are Ofgem |
| handbook.fca.org.uk | 9 | All 200 OK |
| gov.uk | 5 | Mix of HMRC + CMA + breathing-space + debt-collection |
| nationalrail.co.uk | 3 | 1 dead (NRCT 2024) |
| financial-ombudsman.org.uk | 2 | Both 200 |
| fca.org.uk | 2 | Both 200 |
| railombudsman.org / nhs.uk / supremecourt.uk / valuationtribunal.gov.uk / britishparking.co.uk | 1 each | All 200 in spot-check |

`britishparking.co.uk` is on the authority allowlist? — Checked: it is NOT in `UK_LEGAL_AUTHORITY_DOMAINS` and not in `SECONDARY_SOURCE_DOMAINS`. The row was inserted before #386 landed. `checkUkLegalAuthority('https://www.britishparking.co.uk/...')` would return `unrecognised` today. The row is `verification_status='current'` so it currently surfaces to citers. **Add to allowlist (BPA Code is the recognised AOS reference per Protection of Freedoms Act 2012 Sch 4 Para 8) or downgrade the row.**

### 3.3 Freshness

Computed from `last_verified` against 2026-04-30:

| Bucket | Active rows | % of 84 |
|---|---|---|
| <14d (tier 1) | 51 | 61% |
| 14-30d (tier 2) | 0 | 0% |
| 30-60d (tier 3) | 33 | 39% |
| 60-90d (tier 4) | 0 | 0% |
| >90d unusable | 0 | 0% |

Distribution is bimodal (mostly very fresh from 30 Apr or 30 Mar bulk-reverify). No active row is older than 60 days — healthy.

### 3.4 Refs needing immediate attention

| ID | Category | Law name | Source URL | Reason |
|---|---|---|---|---|
| 11293d2f-… | broadband | Ofcom Alternative Dispute Resolution | `https://www.ofcom.org.uk/phones-and-broadband/making-changes/complain` | url_dead 403 — page restructured |
| d7dd8da7-… | broadband | Ofcom Broadband Speed Codes | `…/broadband-speeds` | url_dead 403 |
| e6886789-… | broadband | Ofcom End-of-Contract Notifications | `…/end-of-contract-notifications` | url_dead 403 |
| 50f07a40-… | broadband | Ofcom Fairness Framework | `…/fairness-framework` | url_dead 403 |
| b35d95ad-… | broadband | Ofcom General Condition C1 | `…/review-general-conditions` | url_dead 403 |
| c048c7b2-… | broadband | Ofcom General Condition C4 | `…/review-general-conditions` | url_dead 403 (duplicate URL of above) |
| db430ebd-… | broadband | Ofcom GC of Entitlement (mid-contract) | `…/mid-contract-price-rises` | url_dead 403 |
| dc4fd92f-… | broadband | Ofcom GC of Entitlement | `…/general-conditions-of-entitlement` | url_dead 403 |
| 189e47f4-… | broadband | Ofcom Mid-Contract Price Rise | `…/what-to-do-if-prices-go-up` | url_dead 403 |
| 3355b5e8- + 8604bfae- | broadband | Ofcom One Touch Switch (×2 dup) | `…/switching-provider` | url_dead 403; duplicate rows |
| 3ce42111-… | broadband | Ofcom Switching Rules STAC/PAC | `…/switching` | url_dead 403 |
| 27604a19-… | broadband | Ofcom Voluntary Auto Compensation | `…/automatic-compensation-need-know` | url_dead 403 |
| da3b5c6f- + ec5b28cc- | energy | Ofgem Back-Billing Rule (×2 dup) | back-billing pages | url_dead 404 |
| db0a3c4f-… | energy | Ofgem SLC 21B (back-billing principle) | `…/back-billing` | url_dead 404 — **THIS is the named statute the founder markets** |
| e5d97127-… | energy | Ofgem Debt Code of Practice | `…/energy-debt-and-prepayment-meters` | url_dead 404 |
| 03e30717-… | energy | Ofgem Guaranteed Standards | `…/guaranteed-standards-performance` | url_dead 404 |
| 0ec35465- + a3135d9f- | energy | Ofgem Standards of Conduct (×2 dup) | various | url_dead 404 |
| 257f37a1- + c0f9721e- | energy | Ofgem Supply Licence Condition 23 / 27 | `/publications/supply-licence-conditions` | url_dead 404 |
| 4c602e21- + fca2e227- | energy | Ofgem Switching Guarantee / Switching Rules | `…/switching-energy-supplier` | url_dead 404 |
| 124ac34c-… | energy | Ofgem Vulnerability Obligations | `…/getting-extra-help-energy-supplier` | url_dead 404 |
| 535a1922-… | finance | OFT Debt Collection Guidance | `gov.uk/government/publications/debt-collection-guidance-for-creditors` | url_dead 404 — OFT is defunct, replaced by FCA CONC 7 (already indexed) |
| 3dbcf63e-… | rail | National Rail Conditions of Travel 2024 | `nationalrail.co.uk/tickets-railcards-and-offers/tickets/national-rail-conditions-of-travel/` | url_dead 404 |
| 30054f88-… | rail | UK Rail Passengers' Rights Reg 2021/782 | `legislation.gov.uk/eur/2021/782/article/17` | url_dead 404 — **legislation.gov.uk redirected this to a CELEX URL that 404s, suggesting the SI was never published as retained EU law and this row is misclassified** |

**Other concerns**:

- **Duplicate rows**: 5 pairs (`Ofgem Back-Billing Rule`/`Rules`, `Ofgem Standards of Conduct` ×2, `Ofcom GC of Entitlement` ×2, `Ofcom One Touch Switch`/`Switching` ×2, `Consumer Credit Act 1974 s.75` ×2 across `general` and `finance`/`travel`, `Local Government Finance Act 1992` ×2). Not a correctness bug but bloats the freshness substitute search.
- **`britishparking.co.uk`** (id `5ebb93e6-…`): not on authority allowlist; needs adding or downgrading to verification_status='needs_review'.
- **`Ofgem SLC 21B back-billing` (id `db0a3c4f-…`)** is the only ref backing the marketed "12-month back-billing" rule. With its URL dead, the engine would fall through to `Ofgem Back-Billing Rules` (also dead) → category fallback → CRA 2015. The rule itself is in `SLC 21BA`, which lives at `https://epr.ofgem.gov.uk/Content/Documents/Domestic%20Standard%20Licence%20Conditions%20Consolidated%20-%20Current%20Version.pdf` — needs founder action to re-source.
- **`UK Rail Passengers' Rights Regulation 2021/782`**: legislation.gov.uk is redirecting this URL to a missing CELEX page. Either the row is misclassified (the regulation may not have been retained in UK law) or the URL needs updating to `https://www.legislation.gov.uk/eur/2021/782/contents` (which may also 404). Investigate before relying on it.
- **`OFT Debt Collection Guidance` (id `535a1922-…`)**: OFT was abolished 2014. FCA CONC 7 is the live equivalent (already indexed at `9510f695-…`/`646c92b8-…`). Row should be `superseded` not `url_dead`.

### 3.5 The 28 url_dead rows — false-positive analysis

The cron canary is recording HTTP 403 from Ofcom and HTTP 404 from Ofgem. With a real `Mozilla/5.0` User-Agent, Ofcom URLs return 404 (page actually gone) — i.e. the cron gets 403 because Ofcom blocks unknown user agents, but the underlying page is also gone. **The 28 rows are real broken URLs, not false positives.** Ofcom and Ofgem appear to have restructured their consumer-rights microsites in late April 2026.

---

## 4. B2B category coverage

Per `legal-coverage-alert/route.ts:59`, `REQUIRED_CATEGORIES` = energy / broadband / finance / travel / rail / insurance / council_tax / parking / hmrc / dvla / nhs / gym / debt / general (14 categories). Note: the founder-supplied list in this audit task includes `mobile`, but the production REQUIRED list uses `broadband` (mobile falls through `CATEGORY_FALLBACK_CHAINS.mobile = ['telecoms','general']` and `telecoms` has 0 rows).

| Category | Total rows | Active | Tier-1 (≤14d) fresh | Within 90d active | Status |
|---|---|---|---|---|---|
| general | 21 | 21 | 17 | 21 | ✅ healthy |
| finance | 21 | 20 | 17 | 20 | ✅ healthy |
| energy | 18 | 6 | 2 | 6 | ⚠️ 12 dead — relies on substitutes |
| broadband | 17 | 4 | 3 | 4 | ⚠️ 13 dead — relies on substitutes |
| rail | 7 | 5 | 0 | 5 | ⚠️ no tier-1 (oldest verify 2026-04-09 = 21d) |
| travel | 7 | 7 | 1 | 7 | ✅ |
| insurance | 5 | 5 | 3 | 5 | ✅ |
| council_tax | 4 | 4 | 2 | 4 | ✅ |
| parking | 3 | 3 | 0 | 3 | ⚠️ no tier-1 (BPA + ParkingEye + PoFA all >30d) |
| debt | 2 | 2 | 2 | 2 | ✅ thin but fresh |
| gym | 2 | 2 | 1 | 2 | ✅ thin |
| hmrc | 2 | 2 | 2 | 2 | ✅ thin but fresh |
| nhs | 2 | 2 | 1 | 2 | ✅ thin |
| dvla | 1 | 1 | 0 | 1 | ⚠️ single ref, last verified 2026-03-29 (32d, tier 3) |

**Categories with <2 fresh authoritative refs**: rail (0 tier-1), parking (0 tier-1), dvla (0 tier-1, only 1 row total). With the tiered fallback chain these still cite (tier 3 warning), so B2B 503 risk is low — but founder should run "Verify with AI" on these to bring them back to tier 1.

---

## 5. Live URL spot-check (30 sampled)

| # | URL | HTTP | Final | Verdict |
|---|---|---|---|---|
| 1 | legislation.gov.uk/ukpga/2015/15/section/9 | 200 | same | ✅ |
| 2 | legislation.gov.uk/ukpga/2015/15/section/49 | 200 | same | ✅ |
| 3 | legislation.gov.uk/ukpga/1974/39/section/75 | 200 | same | ✅ |
| 4 | legislation.gov.uk/ukpga/1974/39/section/77 | 200 | same | ✅ |
| 5 | legislation.gov.uk/ukpga/1974/39/section/87 | 200 | same | ✅ |
| 6 | legislation.gov.uk/ukpga/1974/39/section/140A | 200 | same | ✅ |
| 7 | legislation.gov.uk/ukpga/1980/58/section/5 | 200 | same | ✅ |
| 8 | legislation.gov.uk/uksi/2017/752/regulation/76 | 200 | same | ✅ |
| 9 | legislation.gov.uk/uksi/2013/3134/regulation/29 | 200 | same | ✅ |
| 10 | legislation.gov.uk/uksi/2008/1277/regulation/5 | 200 | same | ✅ |
| 11 | legislation.gov.uk/ukpga/1992/14 | 200 | same | ✅ |
| 12 | legislation.gov.uk/ukpga/1989/29 | 200 | same | ✅ |
| 13 | legislation.gov.uk/ukpga/1986/44 | 200 | same | ✅ |
| 14 | legislation.gov.uk/ukpga/2003/21 | 200 | same | ✅ |
| 15 | legislation.gov.uk/ukpga/2024/13 (DMCC Act) | 200 | same | ✅ |
| 16 | legislation.gov.uk/uksi/2019/278/contents (UK261) | 200 | same | ✅ |
| 17 | legislation.gov.uk/eur/2004/261 (EC261 retained) | 200 | same | ✅ |
| 18 | legislation.gov.uk/uksi/2018/634 (Package Travel) | 200 | same | ✅ |
| 19 | **legislation.gov.uk/eur/2021/782/article/17** | **404** | redirect to eur-lex CELEX endpoint then 404 | ❌ Rail Passengers' Rights — confirms data-side flag |
| 20 | legislation.gov.uk/ukpga/2015/4 (Insurance Act) | 200 | same | ✅ |
| 21 | legislation.gov.uk/ukpga/2010/15/contents (Equality Act) | 200 | same | ✅ |
| 22 | legislation.gov.uk/ukpga/2019/4/contents (Tenant Fees) | 200 | same | ✅ |
| 23 | fca.org.uk/firms/consumer-duty | 200 | same | ✅ |
| 24 | handbook.fca.org.uk/handbook/CONC/7/ | 200 | same | ✅ |
| 25 | handbook.fca.org.uk/handbook/DISP/ | 200 | same | ✅ |
| 26 | handbook.fca.org.uk/handbook/PRIN/2/1.html | 200 | same | ✅ |
| 27 | financial-ombudsman.org.uk/consumers/.../disputed-transactions | 200 | same | ✅ |
| 28 | **ofcom.org.uk/phones-and-broadband/making-changes/complain** | **404** | same | ❌ Ofcom restructure |
| 29 | **ofgem.gov.uk/check-if-energy-price-is-fair/.../back-billing** | **404** | same | ❌ Ofgem restructure |
| 30 | supremecourt.uk/cases/uksc-2013-0280.html | 200 | same | ✅ ParkingEye v Beavis |

27/30 pass (90%). The 3 fails are exactly the ones the cron already flagged as `url_dead` — the canary is detecting them correctly.

---

## 6. Recommended actions

### P0 — critical, blocks the "100% correct" claim

1. **(agent) Route `/api/admin/legal-refs/verify` and the daily/full reverify crons through `legal_ref_corrections`** rather than overwriting `verification_status` directly. Concrete fix: in `verifyOne`, replace the direct `legal_references.update(...)` with an insert into `legal_ref_corrections` (`status='pending'`, `proposed_status=<derived>`, `proposed_source_url=<verdict.current_url if authority>`, `before_*=<current values>`). Founder approves via existing `/decision` endpoint. **Open question for founder**: do you want the AI verifier to STILL be allowed to mark a ref `verified` directly when it returns `confidence==='high'` and `valid===true` (i.e. only when there's no semantic change)? If yes, this is the same shape as `evaluateCorrection` and could go through the auto-apply path with `risk_score='low'`. Recommend: yes — that's why PR η exists. Implementation time: ~3h + tests + PR.
2. **(founder) Replace 28 `url_dead` rows.** The biggest miss is `Ofgem SLC 21BA back-billing` — that's the marketed 12-month rule. New canonical source: the consolidated SLC PDF on `epr.ofgem.gov.uk` or the Ofgem "Standards of Conduct and back-billing" landing page (verify currency). Same for the 11 broken Ofcom GC pages — Ofcom's General Conditions are now consolidated at `https://www.ofcom.org.uk/siteassets/resources/documents/phones-internet-and-on-demand/information-for-industry/telecoms-competition-regulation/general-conditions/general-conditions-of-entitlement.pdf` (or wherever they live this month). Run "Verify with AI" once gate-1 fix above is shipped, then approve the corrections.

### P1 — next

3. **(agent) Fix `british parking.co.uk` allowlist gap.** Add `britishparking.co.uk` to either `UK_LEGAL_AUTHORITY_DOMAINS` (recognised AOS per PoFA 2012) OR `SECONDARY_SOURCE_DOMAINS` (for warning-only treatment). Currently the BPA Code row is `unrecognised` per `checkUkLegalAuthority`; future verify runs may auto-strip its `verified_url`.
4. **(agent) Mark `OFT Debt Collection Guidance` as `superseded`.** OFT was abolished in 2014; FCA CONC 7 is the live equivalent and is already indexed.
5. **(agent) Investigate `Rail Passengers' Rights Reg 2021/782`.** legislation.gov.uk is 404'ing this URL via a CELEX redirect — likely the regulation wasn't retained in UK law. Either correct the source (UK domestic equivalent: National Rail Conditions of Travel + ORR `Passenger Rights Regulation 2014` if applicable) or delete the row.
6. **(founder) Run "Verify with AI" on `rail`, `parking`, `dvla`** to refresh the 5+3+1 active refs into tier-1.
7. **(agent) DRY hardcoded `['current','updated','verified']` arrays inside `legal-refs-guardrail.ts:271,414`** to use `ACTIVE_REF_STATUSES` from `legal-refs-statuses.ts`. Self-import; not a correctness bug.

### P2 — nice to have

8. **(agent) Dedupe the 5 duplicate-row pairs.** Cosmetic; doesn't affect output but bloats substitute search.
9. **(agent) Add a `mobile`-category row** or remove `mobile` from `CATEGORY_FALLBACK_CHAINS` since 0 refs are tagged mobile (mobile disputes currently fall through telecoms→general which is correct but the fallback-chain comment is misleading).
10. **(agent) Tighten the verifier system prompt** to also require Perplexity to validate the `current_url` is on the allowlist before returning `valid=true`. Defense-in-depth in case gate-1 is bypassed.

---

## 7. What this audit does NOT cover

- **Case-law refs**: only one in the index (ParkingEye v Beavis at supremecourt.uk). BAILII as a whole is allowlisted but there are zero BAILII refs. If the engine needs to cite case law (e.g. *Plevin v Paragon* for unfair-relationship credit claims), the index has no row to ground it — post-flight regex won't catch a hallucinated case name either.
- **Regulator handbook deep-links**: the FCA Handbook URLs are pinned to specific pages (e.g. `CONC/7/`); the handbook re-numbers occasionally. None failed in this audit but a long-tail risk.
- **Retained EU law edge cases**: most retained EU regs are at `legislation.gov.uk/eur/...` but some (like `2021/782` here) appear to have been mis-recorded. Need a sweep of all `/eur/...` URLs.
- **Per-row semantic check between law_name and URL**: this audit confirmed all hosts are authority-allowlisted and live, but did NOT cross-check that `law_name='Consumer Rights Act 2015'` actually points to a CRA 2015 URL on every row. Spot checks of named statutes all matched, but a full pass would need a per-row LLM check.
- **Anti-hallucination coverage**: the regex set in `CITATION_PATTERNS` covers ~25 statutes. Long-tail UK legislation (e.g. *Misrepresentation Act 1967*, *Damages Act 1996*, *Bills of Exchange Act 1882*) wouldn't be detected as rogue if the LLM invented one.
- **B2B portal-token / auth**: out of scope.
- **Live `/v1/disputes` request testing**: read-only audit per task, no POSTs.

---

*Audit run 2026-04-30 by automated agent. Master HEAD: `d1212c01`. Read-only — no code changed in this PR.*
