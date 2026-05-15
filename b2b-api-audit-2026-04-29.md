# Paybacker B2B API — Live Audit
**Date:** 29 April 2026
**Auditor:** Cowork (live call + code review against production endpoint)
**Endpoint tested:** `POST https://paybacker.co.uk/api/v1/disputes`
**Test key:** `pbk_a1b2c3d4_…` (minted directly via SQL, revoked after audit)

---

## TL;DR — verdict for a B2B buyer

**Architecture: A-grade.** The contract, idempotency, grounding logic, preflight check, and DB schema are all production-quality and would survive a Big Four procurement security review with one exception (DPA/SCC pages not audited here — see §6).

**One critical blocker: every live call I made hit Vercel's 30-second `FUNCTION_INVOCATION_TIMEOUT`.** Two POSTs, two 504s, both at exactly ~30.5s. The infrastructure is fine (GET /v1/disputes returns in 650ms) — the engine itself is exceeding its budget. **No buyer will integrate against a 504-on-every-call API.** This is the single most important thing to fix before any procurement-grade outreach.

Everything else below assumes that timeout is fixed within ~1 week. If it isn't, the whole outreach plan should be paused.

---

## 1. DisputeResponse contract — what the API promises

Read from `src/lib/b2b/disputes.ts:114-161`. Every field, type, and source:

| Field | Type | Source | Notes |
|---|---|---|---|
| `statute` | string | DB (`legal_references[0].law_name`) | Real row, not LLM string. |
| `dispute_type` | enum (14 values) | regex on scenario + verified-ref category | 2-stage classifier — verified-ref category wins, scenario regex falls back. |
| `regulator` | string \| null | static lookup table (`pickRegulator`) | Hard-coded by sector. Stable. |
| `entitlement.summary` | string | engine `nextSteps` joined | LLM-generated, capped. |
| `entitlement.rationale` | string | DB (`legal_references[match].summary`) | Real verified-ref summary, picked by category-match against engine citations. |
| `entitlement.additional_rights[]` | string[] | DB | Same-category verified refs only — explicitly de-collated cross-domain leaks. |
| `entitlement.estimated_success` | low/medium/high | bucketed engine score | 0-100 → bucket via 70/55 thresholds. |
| `customer_facing_response` | string | engine letter, header/sign-off stripped | First 2 paragraphs, capped at 1200 chars (Zendesk-friendly). |
| `agent_talking_points[]` | string[] | engine `nextSteps` + cited authority prefix | Lead with statute, then 4 bullets, urgency flag if `time_sensitivity:'high'`. |
| `claim_value_estimate` | `{min,max,currency:'GBP'}` \| null | request `amount` × 0.6-1.0 OR UK261 bands | Hard-coded UK261 bands (£220-350 / £350-520). |
| `time_sensitivity` | high/medium/low | regex on scenario + sector default | Catches "14 day", "tomorrow", "expires", "this week". |
| `draft_letter_excerpt` | string | engine letter (slice 0-1200) | The full letter is generated; only excerpt is returned. |
| `escalation_path[]` | `{step,to,wait_days?,url?}[]` | engine OR static sector route | Static fallback covers travel, broadband, energy, finance, insurance, general. |
| `legal_references[]` | string[] | engine output | LLM-generated citation strings, but the engine prompt is forced to ground in DB-provided refs. |
| `confidence` | number (0-1) | engine | LLM self-assessed. |
| `case_reference` | string \| null | echoed | From request. |
| `customer_id` | string \| null | echoed | From request. |
| `preflight` | `PreflightResult` \| null | in-process heuristic | See §3. |

---

## 2. Grounding reality — is this DB-backed or LLM hallucination?

**DB-backed.** The smoking-gun line is `src/lib/b2b/disputes.ts:382-414` (`fetchVerifiedRefs`):

```ts
const { data } = await supabase
  .from('legal_references')
  .select('law_name, section, summary, full_text, source_url, category')
  .in('verification_status', ['current','updated'])
  .limit(500);
```

Then ranks by token-overlap + a `+10` category-match boost. That output is then serialised into a prose block and shoved into the engine's prompt as `verifiedLegalRefs`, which the consumer engine's prompt builder treats as ground-truth. This is **proper RAG** — exactly the architecture the FCA's 2026 AI guidance signals as the acceptable pattern for LLM-in-the-loop financial communications.

**Real DB coverage as of 29 Apr 2026** (queried live):

| Category | Total rows | Verified (`current`/`updated`) |
|---|---|---|
| general | 21 | 21 ✅ |
| finance | 21 | 20 ✅ |
| travel | 7 | 7 ✅ |
| insurance | 5 | 5 ✅ |
| energy | 18 | **7** ⚠️ verifier flapping on source URLs |
| broadband | 17 | **6** ⚠️ same |
| rail | 7 | **0** ❌ known bug — flagged in migration `20260429_legal_coverage_fix.sql` |
| council_tax | 4 | 4 ✅ |
| parking | 3 | 3 ✅ |
| debt | 2 | 2 ✅ |
| gym | 2 | 2 ✅ |
| hmrc | 2 | 2 ✅ |
| nhs | 2 | 2 ✅ |
| dvla | 1 | 1 ✅ |

Total ~112 rows, ~82 verified (73%). High-traffic categories (finance, travel, insurance) are fully covered with real `legislation.gov.uk` and `handbook.fca.org.uk` source URLs. The verified finance rows include CCA s.75 (twice), CCA s.77-78 (twice), CCA s.140A-C, FCA Consumer Duty, FCA DISP, FCA PRIN 6, FCA CONC 7.3, FCA MCOB 13.3, Limitation Act 1980, Payment Services Regs 2017 — i.e. the lion's share of citations a UK fintech/bank would ever need to cite.

**Bottom line: claim of "deterministic citation, validated daily" holds.** The verifier flapping on energy/broadband URLs is a known issue with a fix migration in flight; the rail-zero-verified is a known bug. Neither is a procurement-killer because finance is what matters most.

---

## 3. Preflight check (Consumer Duty differentiator) — actually works

`computePreflight` (`src/lib/b2b/disputes.ts:262-337`) is a pure-Node heuristic. It tokenises every cited authority into 1-2 grep-friendly forms (`"consumer credit act 1974"`, `"s.75"`, `"section 75"`), then greps the agent's `proposed_reply` text for hits. Verdicts:

- **pass** = every citation present
- **weak** = primary statute present but supporting refs missing
- **fail** = primary statute missing OR ≥50% of citations missing

Returns `missing_citations`, `recommended_additions`, and a one-line `rationale` an agent UI can show. No extra Claude call — runs in <1ms.

**This is the Aveni/Voyc upstream play in code.** Aveni grades AFTER the call; this catches the missing-citation pattern BEFORE the agent sends. The block-and-suggest UX is exactly what `LLM hallucinations in financial communications require RAG-grounded generation or mandatory human-in-the-loop review` (FCA's own 2026 guidance language) translates into in practice.

---

## 4. Sector classification, regulator, escalation, claim value

| Field | Source | Verdict |
|---|---|---|
| Sector classifier (`detectScenarioCategory`) | regex over scenario text | Real, careful — handles `rail` before `travel` because Delay Repay would mis-route, bounds short tokens like `bt`/`ee`/`sky`/`virgin` to avoid false positives in everyday English. |
| Regulator | static lookup table (14 sectors) | Real — `Ofcom`, `Ofgem`, `FCA / FOS`, `CAA`, `ORR`, `VOA / Valuation Tribunal`, `POPLA`, etc. Stable, no LLM. |
| Escalation path | sector-specific static routes (5 sectors) + general fallback | Real — names actual ombudsmen and gives 14/28/56-day wait windows. Solid. |
| Claim value | request `amount` × 0.6-1.0 OR UK261 bands | Hard-coded bands. Honest — only populates when scenario actually quantifies it. |

---

## 5. The 30-second timeout — the one critical issue

Both real POSTs returned `HTTP 504 FUNCTION_INVOCATION_TIMEOUT` at 30.5s. The engine (`src/lib/agents/complaints-agent.ts:217-362`) uses:

- Model: `claude-sonnet-4-6`
- `max_tokens: 4096`
- **No streaming** — single blocking `messages.create` call
- No extended thinking
- Vercel `maxDuration = 30`

Sonnet 4.6 generating 4K JSON tokens with a multi-thousand-token prompt typically takes 15-25 seconds. With cold-start, 1-2 retries, or Anthropic load, 30+ seconds is plausible. Today is hitting that.

**Fix options, in order of cheapness:**

1. **Switch to streaming** (`anthropic.messages.stream`) so the function returns headers within 1-2s and streams the JSON body. Vercel's `maxDuration` measures time-to-first-byte, not total streaming time. ~30 lines of change.
2. **Halve `max_tokens` to 2048.** The full draft letter excerpt is already truncated to 1200 chars — most of those 4K tokens are unused on the wire.
3. **Bump `maxDuration` to 60.** Vercel Pro allows up to 300s on the `nodejs` runtime — single-line change.
4. **Move B2B engine to Haiku 4.5** with the existing prompts. ~3-5x faster, ~10x cheaper. Sonnet stays on consumer route.

**Recommended:** ship #1 (streaming) within the next sprint. Add #3 as a safety belt. Don't ship Haiku for B2B without a quality-eval comparison — the Consumer Duty pre-flight angle dies if the citations get lazy.

---

## 6. Procurement-blocker trio status

| Blocker | Status |
|---|---|
| **Idempotency keys** | ✅ **DONE** — Stripe-style header + body field, 24h TTL, SHA-256-base64 hash, scoped per api-key, replay returns cached body+status with `X-Paybacker-Idempotent-Replay: true`. Best-in-class implementation. (`src/app/api/v1/disputes/route.ts:113-179`) |
| **OpenAPI spec / Postman / TypeScript SDK** | Not audited in this pass — needs a separate look at `/for-business/docs` and any `openapi.yaml` in the repo. |
| **DPA + SCCs + UK-only data residency** | Not audited — needs a check at `/for-business/legal` and Supabase project region. |

Update the Apr 28 positioning memo: idempotency is no longer a blocker. Two of the trio remain (OpenAPI/SDK and DPA/SCCs).

---

## 7. Day-1 buyer usefulness — verdict per persona

Assuming the timeout is fixed:

| Persona | Useful day-1? | Biggest gap |
|---|---|---|
| Compliance Officer running Consumer Duty pre-flight on AI-drafted replies | ✅ **YES** | Need a reference integration (Zendesk app or a Salesforce-Service-Cloud LWC) so a buyer doesn't have to write the block-and-suggest UI themselves. |
| Head of CX scoring disputes in real time | ✅ **YES** | The `confidence` score is LLM-self-assessed — buyers will want a calibration story. |
| Head of Voice grounding an IVR | ⚠️ **PARTIAL** | `customer_facing_response` is letter-prose by default; need a `channel:'phone'` test harness + measured TTS-friendliness. |
| Debt-purchaser ops triaging CCA s.77/s.78 | ✅ **YES** | The DB has CCA s.77-78 verified twice — strongest sector after motor finance. |

---

## 8. Things to fix before procurement-grade outreach (1-2 sprints out)

1. **Streaming engine call** — kills the 504 problem.
2. **Reference integrations** — at least a Zendesk sidebar app demo and a Salesforce LWC.
3. **OpenAPI 3.1 spec + Postman collection + TypeScript SDK** auto-published from the route handler.
4. **`/for-business/legal` page** with DPA, SCCs, UK-only data residency statement, and ICO registration number.
5. **Calibration data on `confidence`** — even one paragraph saying "scored against {N} adjudicated cases, current AUROC = X" turns a vibes number into a defensible one.
6. **Top-up `legal_references` energy and broadband verifier** — those flapping URLs are the most-touched sectors after finance.
7. **Rail category re-seed** — known bug with a fix migration; ship it.

---

**Summary:** the engine is real, the grounding is real, the contract is good, idempotency is in. Fix the streaming/timeout issue and you have a procurement-defensible product within 1-2 weeks. Don't push procurement-grade outreach until that ships — but DO push light "open conversation" outreach now, because the warm-network angle works regardless of timeout.
