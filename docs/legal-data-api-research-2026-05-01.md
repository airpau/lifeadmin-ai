# UK legal data API research — replacing Perplexity for `legal_references`

Date: 2026-05-01
Author: research agent (Paybacker compliance centre)

## 1. Bottom-line recommendation

**Integrate legislation.gov.uk's public Atom + XML API as the primary canonical source for every statute-backed `legal_references` row, and use Find Case Law (TNA) as a secondary feed for case-law citations under a free transactional licence.** Keep Perplexity only as a tertiary fallback for regulator codes (FCA / Ofcom / Ofgem) where no structured government feed exists. legislation.gov.uk is authoritative, free, Open Government Licence v3.0, and exposes a per-document Atom "effects" feed that surfaces amendments at the section level — exactly the supersession signal we currently approximate via Perplexity inference.

## 2. legislation.gov.uk integration plan

### Why it fits

- Every statute we currently cite (CRA 2015, CCA 1974, Limitation Act 1980, Equality Act 2010, GDPR/DPA 2018, Housing Act 1988, Consumer Protection from Unfair Trading Regs 2008, etc.) is hosted there.
- Our `source_url` column is already in the `https://www.legislation.gov.uk/{type}/{year}/{number}/section/{n}` shape, so re-grounding is a URL-rewrite plus a HEAD check, not a migration.
- Content negotiation is trivial: append `/data.xml` to any content URI for canonical XML, or `/data.feed` to any list URI for Atom.[1][2]
- The site exposes an "effects" feed per Act listing every amendment, commencement, and repeal, plus a global publication log of new instruments.[3][4]

### Pipeline

1. **Backfill confirm**: nightly job iterates `legal_references`, HEAD-checks `source_url`, verifies `200` and that the `<ukm:DocumentMainType>` matches the stored `law_name`. Anything failing → `legal_ref_corrections` queue.
2. **Daily amendments cron** (08:00 UK): pull `https://www.legislation.gov.uk/new/data.feed` (new instruments, last 24h, confirmed live as of 2026-05-01) and the per-Act effects feed for each distinct Act we cite, e.g. `https://www.legislation.gov.uk/ukpga/2015/15/data.feed`. For any entry whose `<ukm:AffectedURI>` matches a section URL stored in `legal_references`, enqueue a correction with `last_changed` = entry `<published>` timestamp.
3. **Section-level diff**: when an effect lands, fetch `/data.xml` for that section, hash the `<Text>` body, compare with last hash. On change, set `verification_status='superseded'` until a human (or a Perplexity rewrite gated on the new XML) refreshes the `summary`.

### Effort estimate

**Small-to-medium** (3–5 dev-days). One ingestion module, one cron, one new column (`source_xml_hash TEXT`). No vendor cost, no auth, no rate-limit ceiling published — the National Archives ask only for OGL v3.0 attribution and reasonable throttling.[5]

## 3. Per-source findings

| Source | Has API? | Format | Coverage | Freshness | Rate limit | Cost | Recommended use |
|---|---|---|---|---|---|---|---|
| **legislation.gov.uk** | Yes (REST + Atom + RDF) | XML, Atom, RDF/XML, HTML — **no JSON**[2] | All UK primary + secondary; devolved (Scotland/Wales/NI); SIs; retained EU law | Same-day for new SIs; effects feed updates per revision | None published; OGL v3.0 attribution | Free | **Primary** for every statute ref |
| **Find Case Law (TNA)** | Yes (public Atom + XML; privileged Swagger API) | Atom feed at `/atom.xml`, judgments as Akoma Ntoso XML[6][7] | Supreme Court, Court of Appeal, High Court, UT, EAT (post-2003 mostly) | Within hours of hand-down | Bulk/programmatic requires free transactional licence (5-yr term)[8] | Free | **Secondary** for case-law refs (rare) |
| **FCA Handbook** | Partial — handbook is HTML; instruments PDF; My FCA portal exists but not an open API[9][10] | HTML / PDF only for the handbook itself | All handbook modules (CONC, DISP, BCOBS, ICOBS, MCOBS) | Monthly instrument cycle | n/a | Free read; no machine-readable feed | Keep Perplexity-with-cite, or scrape stable handbook URLs |
| **FCA Financial Services Register** | Yes (REST API, individual lookups) | JSON | Firms / individuals only — **not handbook rules** | Daily | Per-key throttling[11] | Free with key | Not useful for `legal_references` |
| **Ofcom** | Yes for broadband/coverage open data; **no** structured API for General Conditions[12] | n/a for GCs | Coverage data only | n/a | n/a | Free | Not useful — scrape GC pages or Perplexity |
| **Ofgem** | No public licence-conditions API | HTML/PDF | Standard Licence Conditions on epr.ofgem.gov.uk | Manual | n/a | Free | Perplexity fallback |
| **CMA cases** | Yes via GOV.UK Content API (`document_type=cma_case`) | JSON via `https://www.gov.uk/api/content/cma-cases/{slug}` | All CMA / OIM / SAU cases (2.5k+ pages indexed)[13] | Same-day | Standard GOV.UK rate limit (rare to hit) | Free | Optional: enforcement-precedent feed |
| **ICO enforcement** | No first-party API (page is OGL); third-party Apify scraper exists[14] | HTML + listed CSV downloads | All UK GDPR/PECR/DPA enforcement | ~Weekly | n/a / Apify paid | Free direct, paid via Apify | Skip until needed; build a thin scraper if so |
| **CAA UK261** | No API; HTML guidance only | n/a | Passenger rights guidance | Manual | n/a | Free | Perplexity fallback |
| **Financial Ombudsman** | No API; site has anti-scraper protection (legally upheld 2020)[15] | HTML | 13-yr decision archive | Daily | Adversarial | Free read, no bulk | **Do not scrape**; cite individual decisions only |
| **Energy / Comms / Housing Ombudsmen** | No APIs | HTML/PDF | Decisions published periodically | Slow | n/a | Free | Skip |
| **BAILII** | No API; HTML; explicit anti-scrape stance | HTML | Wide UK + commonwealth | Manual | n/a | Free | Skip — Find Case Law is the modern equivalent |
| **Westlaw / LexisNexis / vLex / Practical Law** | Enterprise APIs (Protégé / Westlaw) | JSON | Comprehensive incl. annotations | Real-time | Per-contract | £15k–£100k+/yr typical enterprise[16] | Skip until £20k+ MRR |

## 4. Implementation notes

### 4.1 legislation.gov.uk — concrete endpoints

- New legislation feed (last 24h-ish): `https://www.legislation.gov.uk/new/data.feed` — confirmed live, ~20 entries per pull, includes `<ukm:DocumentMainType>`, `<ukm:Year>`, `<ukm:Number>`, `<published>`.
- Per-Act effects: `https://www.legislation.gov.uk/{type}/{year}/{number}/data.feed?feed-type=changes` — Atom of every amendment, with affected section URI in `<leg:AffectedProvisions>`.
- Per-section canonical XML: `https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml`.
- Search endpoint: `https://www.legislation.gov.uk/{type}?title={x}&data.feed`.

Sample query for our existing CRA 2015 s.9 ("satisfactory quality") row:

```
GET https://www.legislation.gov.uk/ukpga/2015/15/section/9/data.xml
```

Returns Akoma-Ntoso–like XML with `<Section>`, `<Text>`, version metadata (`<ukm:UnappliedEffects>` flags pending changes not yet incorporated — important: surface these in the UI).

### 4.2 Pipeline placement

```
[daily cron]
  -> pull /new/data.feed                      (catches new SIs that may amend)
  -> for each distinct Act in legal_references: pull effects feed
  -> match <leg:AffectedProvisions> URI -> legal_references.source_url
  -> on match: insert legal_ref_corrections (status='pending_review')
                set legal_references.verification_status='under_review'
  -> Perplexity is invoked ONLY to draft a new `summary` from the new XML body
     (no longer doing inference about whether the law changed — XML is canonical)
```

Net effect: Perplexity moves from "decide if law changed + summarise" to just "summarise authoritative text". Hallucination surface shrinks dramatically.

### 4.3 Find Case Law — secondary

- Apply for transactional licence (free, ~10 working days; email caselawlicence@nationalarchives.gov.uk).[8]
- Public Atom: `https://caselaw.nationalarchives.gov.uk/atom.xml` (recently updated judgments).[6]
- Use only if/when we add case-law-backed `legal_references` rows (currently rare).

## 5. What's NOT recommended

- **Westlaw / LexisNexis / vLex APIs** — enterprise pricing (£15k–£100k/yr) is wildly disproportionate to a compliance centre we use ~10–50× a day pre-Series A.[16]
- **Scraping FOS decisions** — site actively defended a scraper-blocking measure in court (2020), and a programmatic harvest would be both legally dicey and operationally fragile.[15]
- **BAILII scraping** — explicitly disallowed; superseded by Find Case Law for the cases we'd cite.
- **Building a global FCA Handbook ingester** — handbook is HTML-only with no semantic markup; would be a 4-week project for marginal gain. Better to keep targeted Perplexity calls per ref and verify the cited handbook URL with a HEAD check.
- **Apify-based ICO scrape** — fine if/when we need ICO precedent, but it's a paid third-party scraper, not an authoritative source. Defer.

## 6. Caveats

- legislation.gov.uk's `<ukm:UnappliedEffects>` flag means the visible XML is sometimes the *pre-amendment* text with a known pending effect; we must surface this state, not paper over it.
- Devolved primary legislation (asp/anaw/nia) is in scope but our current refs lean Westminster — verify the URL pattern per type when generalising.
- No rate limit is published; if we run a daily cron polling ~50 effects feeds we are well within polite use, but a backfill burst should be throttled (≤4 req/s).
- Find Case Law's transactional licence is required *before* programmatic bulk access, even though the data is OGL — the licence governs computational re-use, not copyright. Approval is routine but not instant.[8]
- FCA / Ofcom / Ofgem regulator-rule rows will continue to depend on a Perplexity-with-citation pattern; this is a real gap and worth a follow-up RFC if a regulator publishes a structured handbook in the next 12 months. The FCA's "intelligent handbook" is internally machine-readable (Corlytics) but not exposed as an open API.[9]
- "Uncertain — needs follow-up": whether legislation.gov.uk's effects feed is genuinely real-time (within hours) or batched weekly. Empirical observation over a 30-day window once the cron is live will settle it.

---

### Sources

1. legislation.gov.uk Developer Zone — https://www.legislation.gov.uk/developer
2. Formats — https://www.legislation.gov.uk/developer/formats (XML / Atom / RDF / HTML; no JSON)
3. Atom Feeds reference — https://www.legislation.gov.uk/developer/formats/atom
4. Data-reuse documentation, Atom format — https://legislation.github.io/data-documentation/formats/atom.html
5. National Archives "Putting APIs first" — https://gds.blog.gov.uk/2012/03/30/putting-apis-first-legislation-gov-uk/
6. Find Case Law re-use page — https://caselaw.nationalarchives.gov.uk/re-use-find-case-law-records
7. Find Case Law public API docs — https://nationalarchives.github.io/ds-find-caselaw-docs/public
8. Find Case Law licence application — https://caselaw.nationalarchives.gov.uk/licence-application-process
9. Corlytics FCA handbook digitisation case study — https://www.corlytics.com/case_studies/how-can-we-ensure-that-our-handbook-is-digitised-machine-readable-searchable-for-our-users/
10. FCA Handbook — https://handbook.fca.org.uk/
11. FCA Register data extract — https://www.fca.org.uk/firms/financial-services-register/data-extract
12. Ofcom open data — https://www.ofcom.org.uk/about-ofcom/our-research/opendata ; API portal https://api.ofcom.org.uk/
13. GOV.UK cma_case document type — https://docs.publishing.service.gov.uk/document-types/cma_case.html
14. ICO enforcement (page OGL; third-party Apify scraper) — https://ico.org.uk/action-weve-taken/enforcement/
15. Reed Smith — FOS v scraper bot (2020) — https://www.reedsmith.com/en/perspectives/2020/12/financial-ombudsman-service-vanquished-in-battle-of-the-scalper-robots
16. LexisNexis enterprise pricing overview — https://www.vendr.com/marketplace/lexisnexis ; Thomson Reuters dev portal — https://www.lawnext.com/2024/04/thomson-reuters-launches-developer-portal-giving-access-to-over-100-apis-for-legal-tax-risk-and-fraud.html

---

## Phase 1 — Implemented 2026-05-01

**Branch:** `feat/legislation-gov-uk-integration`

### Shipped

- **`src/lib/legal-data/legislation-gov-uk.ts`** — typed, dependency-free client for legislation.gov.uk:
  - `fetchStatuteByUri(uri)` — content-negotiates to `/data.xml`, parses Akoma-Ntoso, returns `{ title, fullCitation, sectionText, sectionNumber, inForceOn, lastAmended, sourceUrl, hasUnappliedEffects, raw }`.
  - `searchByTitle(query, { types, limit })` — Atom search via `/all/data.feed?title=…&type=ukpga&type=uksi`.
  - `isLegislationGovUkUrl(url)` and `toXmlUri(url)` helpers.
  - `<ukm:UnappliedEffects>` is surfaced (not papered over) per caveat in §6.
- **Pipeline integration** — `src/app/api/admin/legal-refs/verify/route.ts` now tries the legislation.gov.uk fetcher FIRST whenever a row's `source_url` is on `legislation.gov.uk`. Perplexity stays as the fallback for everything else (and for the legislation.gov.uk case if the canonical fetch fails).
- **Three-gate behaviour preserved** — the legislation.gov.uk fetcher produces a `legal_ref_corrections` row tagged `proposer='legislation-gov-uk'` (cost £0). It flows through the existing `evaluateCorrection` auto-apply gates and the same-host fast-path; no canonical fields are written without founder review unless all three gates pass. AI proposes; human confirms.
- **Cost tracking** — Perplexity calls are skipped (and `cost_gbp` set to 0) on the audit row whenever the canonical fetch served the verdict.
- **Tests** — `src/lib/legal-data/__tests__/legislation-gov-uk.test.ts` covers parsing, URL normalisation, Atom feed parsing, mocked fetch flow, host gating, and per-call cache dedup. One `describe.skip` integration test hits the real CRA 2015 s.9 endpoint when un-skipped locally. Run with `node --experimental-strip-types --test src/lib/legal-data/__tests__/legislation-gov-uk.test.ts` (matches the existing `legal-refs-authority.test.ts` pattern).

### Pending (follow-up PRs)

- **Find Case Law (TNA)** — needs founder to apply for the free transactional licence (~10 working days). Until then, Perplexity remains the case-law fallback.
- **GOV.UK Content API** for `cma_case` regulator decisions.
- **Daily amendments cron** consuming `https://www.legislation.gov.uk/new/data.feed` plus per-Act effects feeds. Hooks into a new `source_xml_hash` column to detect section-level diffs and queue corrections automatically.
- **Background re-validation** that re-fetches every legislation.gov.uk-sourced ref weekly (cheap — no per-call cost).
- **Surfacing `<ukm:UnappliedEffects>`** in the founder dashboard so pending-but-not-yet-incorporated changes are flagged on the row, not just in `verification_notes`.

### Source attribution

All content surfaced via this client is © Crown copyright, available under the Open Government Licence v3.0. The `sourceUrl` field is preserved end-to-end so any downstream UI can render the OGL attribution.

---

## Phase 2 + 3 — Implemented 2026-05-01

**Branch:** `feat/legal-data-freshness-pipeline` (extends Phase 1 PR #415).

### Shipped

- **`source_xml_hash` column** on `legal_references` + `legal_ref_corrections`, plus `last_freshness_check_at`, `is_stale`, `unapplied_effects`, `superseded_by`. Migration `supabase/migrations/20260502000000_legal_ref_freshness.sql`. Strictly additive.
- **Daily amendments cron** `src/app/api/cron/legal-refs-amendments-sweep/route.ts`. Schedule `15 3 * * *` (avoids the existing `compliance-sync` slot at `0 3 * * *`). Caps 100 refs/run, 5 parallel fetches. Drift detected via SHA-256 hash of normalised section body. Drift inserts a PROPOSED `legal_ref_corrections` row (`proposer='legislation-gov-uk-amendments-sweep'`, `cost_gbp=0`, `source_xml_hash` set, `status='pending'`) and flips `is_stale=true` on canonical row. `<ukm:UnappliedEffects>` flips `unapplied_effects=true`. Canonical citation fields are NEVER mutated by this cron.
- **Weekly re-validation cron** `src/app/api/cron/legal-refs-reverify/route.ts`. Schedule `0 4 * * 0`. Caps 200 refs/run, 4 parallel. Per-ref dedup: skip if `last_freshness_check_at < 6 days ago`. Prioritises non-legislation.gov.uk hosts (those have no daily cron and depend on Perplexity). Calls the existing `/api/admin/legal-refs/verify` endpoint so all three corroboration gates + the same-host fast-path are reused — no behaviour fork.
- **GOV.UK Content client** `src/lib/legal-data/gov-uk-content.ts` — typed wrapper over `https://www.gov.uk/api/content/{path}` and `https://www.gov.uk/api/search.json`. Surfaces `cma_case` regulator decisions for the discovery pipeline. 6 unit tests with mocked fixtures.
- **Find Case Law (TNA) scaffold** `src/lib/legal-data/find-case-law.ts` — Atom feed parser for `https://caselaw.nationalarchives.gov.uk/atom.xml?query=…`. **Dormant in production** behind `FIND_CASE_LAW_LICENCE_ACCEPTED=true`. Founder still needs to apply for the free transactional licence (~10 working days; email `caselawlicence@nationalarchives.gov.uk`). Tests cover the licence gate, parser, and dedup; flipping the env var enables production wiring with no code change.
- **Admin UI** `/dashboard/admin/legal-refs`:
  - New **Freshness** column with colour-coded badge (green `<7d`, amber `7-30d`, red `>30d` or null).
  - `❗ Unapplied effects` badge when `unapplied_effects=true`.
  - `⚠️ STALE — pending correction` badge when `is_stale=true`.
  - New filter checkboxes: "Show stale only" + "Unapplied effects only".
  - Pending corrections panel highlights `🔁 amendments sweep` proposals to distinguish XML-hash drift signals (high trust) from Perplexity verdicts.
- **B2B contract** `DisputeResponse.legal_basis_freshness` — additive optional field. One entry per cited ref: `{ ref_id, last_verified_at, source: 'legislation.gov.uk' | 'perplexity' | 'find-case-law' | 'cma-case', is_stale }`. Backward-compatible per the public-contract rule.

### Behind the licence env-var

- `searchAtom()` in `src/lib/legal-data/find-case-law.ts` short-circuits to `[]` and logs once until `FIND_CASE_LAW_LICENCE_ACCEPTED=true`. The client surface, parsers, and tests are all live; only production wiring is gated. To enable post-approval: set the env var on Vercel; no code change required.

### Confidence by source type

| Source | Pipeline | Cost / call | Drift signal | Trust ceiling | Notes |
|---|---|---|---|---|---|
| **legislation.gov.uk** (primary) | Daily amendments-sweep + verify route | £0 | SHA-256 hash of normalised section body | **HIGH** — deterministic, canonical Crown copyright XML | Hash diff ⇒ proposal queued. `<ukm:UnappliedEffects>` flagged on UI. Republish-only metadata churn filtered out via `normaliseXmlForHash`. |
| **GOV.UK Content (cma_case)** (secondary) | Discovery cron leg + manual `discoverCmaCases()` | £0 | `public_updated_at` timestamp | **MEDIUM** — content body is HTML with inconsistent shape across cases | Always lands in `legal_ref_candidates` (founder approves before any canonical write). |
| **Find Case Law / TNA** (secondary, **dormant**) | Atom search via env-gated `searchAtom()` | £0 | `<published>` timestamp on entries | **MEDIUM** — judgment text is authoritative, but selection of which cases to cite is editorial | Dormant until licence accepted. Public Atom is OGL v3.0; programmatic re-use needs the transactional licence. |
| **Perplexity sonar-pro** (fallback) | Verify route + weekly reverify | £0.005 | Probabilistic verdict + cited URL | **LOW-MEDIUM** — output is a re-statement, not the authority | Authority allowlist + 3-gate corroboration before any canonical write. Stays as the only freshness signal for FCA / Ofcom / Ofgem refs. |

The tiering is deliberate: the higher the trust ceiling, the closer to canonical the auto-apply gates allow. legislation.gov.uk is the only source that can flip the `is_stale` flag on a canonical row without founder review (because the flag is observational, not a citation field). Every actual citation change still passes through `legal_ref_corrections` and a founder click — no fork in the dispute path.

### Risks + caveats

- **legislation.gov.uk amendments sweep load**: ~hundreds of refs × daily fetch. Concurrency capped at 5; per-fetch timeout 8 s. Expected nightly bandwidth ≈ 100 fetches × ~50 KB = ~5 MB, well within polite-use limits. No published rate-limit ceiling on the source; we identify ourselves via a User-Agent.
- **Hash false-positives from XML whitespace / republish drift**: addressed by `normaliseXmlForHash` (strips XML comments, `<ukm:DocumentVersion>`, `<ukm:Modified>`, collapses whitespace). Verified by the `freshness.test.ts` suite.
- **Find Case Law licence delay**: ~10 working days. The scaffold ships dormant so we can flip the env var the moment the licence email arrives; no PR required at that point.
