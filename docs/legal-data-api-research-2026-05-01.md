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
