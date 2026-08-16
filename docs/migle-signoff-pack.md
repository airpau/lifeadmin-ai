# Yapily Build Review — Independent Verification & Live Demo Pack

---

## Consent 403 diagnosis (16 Aug)

**Short version:** there are **two separate faults**, and the earlier write-up conflated them.
The `status = 'token_expired'` mystery is **100% our bug** — found, root-caused, fixed, and
verified. The **403 on `/transactions` is not our bug** and is the one thing only Migle can
resolve. Paul's own read is correct: the initial sync genuinely worked and genuinely pulled
data. What is broken is everything *after* the first ~4 minutes.

### E1 — Evidence timeline (connection `f1776dbb-125f-4915-9261-39289068a622`, HSBC Business, user `aireypaul@googlemail.com`, tier `pro`)

All times UTC. Sources: `bank_sync_log`, `bank_transactions`, `yapily_pending_consent_requests`,
`bank_connections`, Supabase `function_edge_logs`, `cron.job`.

| When | What happened | Evidence |
|---|---|---|
| 16 May 21:35 | **First 403.** Consent from the 14 May connect dies. The row then fails **459 consecutive times** over three months. | `bank_sync_log` grouped by error signature: `failed` × 459, first `2026-05-16 21:35:06`, last `2026-08-16 17:02:14` |
| 18 May 13:08 | Last genuinely successful transaction pull before August — a **manual** sync, 437 transactions. | `bank_sync_log` `trigger_type='manual'`, `transactions_synced=437` |
| 15 Aug 17:01 | Pre-reconnect cron. 403 on the single stale account `PNae6W0h3CyGMZimjdXrvw`: *"Consent must has been revoked"*. | tracingId `6a809b5593220f36053ea728c1ce8523` |
| **15 Aug 18:44:33** | Paul starts a fresh Hosted Pages consent. | `yapily_pending_consent_requests` `81d6a006-41d0-4f56-a11c-cbfa19285936`, status `completed` |
| **15 Aug 18:45:08** | Consent AUTHORIZED (35 s round trip). Row updated in place: new `consent_token`, new `yapily_consent_id` `fd949d3c-a633-49ee-9775-819ab58886dd`, `consent_expires_at` = **13 Nov 2026** (90 days), `status='active'`, 4 accounts. | `connection-store.ts:172-205`; `bank_connections.connected_at` |
| **15 Aug 18:45–18:48** | **The initial sync fully worked.** Two `initial` runs, 9 API calls each, **zero per-account errors** — meaning *both* passes succeeded on *all four* accounts, including the 91–365-day historical pass. **567 transactions inserted.** | `bank_sync_log status='success'`; `bank_transactions` created 15 Aug: `PNae…` 523, `lnZJ…` 39, `hYUi…` 3, `YXYw…` 2 |
| **15 Aug 20:00:59** | **First post-reconnect cron — 403 on all four accounts.** 71 minutes after the last success. | tracingIds `6a80c54a29b481257b85c7bbab170222`, `6a80c5589f1bf48a6ddcec46453d9796`, `6a80c55f0eb29508c71d1a83640fa80a`, `6a80c5672efc903…` |
| **16 Aug 03:00:06.609** | Legacy TrueLayer **Supabase Edge Function** fires. Row `updated_at` becomes `03:00:06.578` and `status` becomes `token_expired`. **No log row written.** | `function_edge_logs`: `POST │ 200 │ /functions/v1/bank-sync?trigger=auto` @ `2026-08-16T03:00:06.609Z` — a **31 ms** match to `updated_at` |
| 16 Aug 03:01 / 09:03 / 13:03 / 17:02 | Vercel cron continues; same four 403s each run. | latest tracingIds `6a81ece6f7bf279875d881114ab9c0b1`, `6a81ecf4a31d8a75fc51f4566a7c1e06`, `6a81ed001508247d8a6d633d0eac58f2`, `6a81ed0c9cb92d3…` |
| **16 Aug 17:42:59** | **Fixed** — legacy pg_cron jobs unscheduled, row reset to `active`. | migration `20260816180000_retire_legacy_truelayer_bank_sync_cron` |

**The error split is stable and reproducible across every run:**

- `PNae6W0h3CyGMZimjdXrvw` → *"You are not authorised to access this resource. We didn't managed
  to fix this unauthorized by refreshing the authorization credential. **Consent must has been
  revoked.**"* (403)
- the other three accounts → *"The institution rejected the call due to insufficient rights. The
  consent does not have the right privileges for that action."* (403)

`PNae…` is the one account carried over from the **May** consent; the other three first appeared
at 18:45 on 15 Aug.

### E2 — Verdict on cause

**Fault A — `status='token_expired'`: OUR BUG. Confidence: certain.** *(fixed)*

The previous analysis was right that nothing in `src/` writes `token_expired`. It came from
**outside the Next.js app**: a legacy **TrueLayer-era Supabase Edge Function** (slug `bank-sync`,
version 2, still `ACTIVE`) driven by **pg_cron jobs 2 and 3** at `0 3,9,15,21 * * *` and
`0 1 1 * *`. Mechanism:

1. It reads the `bank_connections_due_sync` view, which does **not** filter by provider — so it
   picks up Yapily rows.
2. `const tokenExpired = new Date(connection.token_expires_at) < new Date()`. Yapily rows have
   `token_expires_at = NULL`, and `new Date(null)` is **epoch 1970** → always `true`.
3. `connection.refresh_token` is NULL for Yapily → it takes the branch that writes
   `status: "token_expired"`.
4. Its audit call `record_bank_sync(p_status => 'token_expired')` violates
   `bank_sync_log_status_check` (`success|failed|skipped`). supabase-js **returns** that error
   rather than throwing, the function ignores it, and the status write proceeds — **so the flip
   left no trace anywhere.** That is exactly why it looked like it came from nowhere.

Timing proof: the row was `active` after the 18:45 reconnect; it only became due for that view
once `last_synced_at` (18:48:58) aged past the 6 h Pro interval, i.e. at the **03:00** slot, not
the 21:00 one — and that is precisely when it flipped. The hash-backfill branch in the Vercel
cron (`bank-sync/route.ts:295-333`) is the only other writer of `updated_at` on a failing
connection and it could not have run (`account_identifications_hashes` already had 4 entries for
4 accounts).

**Fault B — the 403s themselves: NOT our bug. Confidence: high.**

The strongest possible control test already ran in production, by accident:

- `/api/yapily/initial-sync` (`route.ts:98-102`) and `/api/cron/bank-sync`
  (`route.ts:340-363`) call the **same function** `getAllTransactions(accountId, consentToken,
  { from: <90d ago>, before: <tomorrow> })` with **byte-identical parameters**.
- The callback (`callback/route.ts:229-237` and `:298-309`) hands the **same in-memory
  `consentToken` string** both to `upsertYapilyConnection` (which stores `encrypt(...)`) and to
  `initial-sync`. So the cron reads back exactly the credential that worked.
- That identical call **succeeded on all four accounts at 18:47** and **403'd on all four at
  20:00**. Nothing on our side changed in between — no code ran, no status changed, the consent
  does not expire until 13 Nov.

Corroborating: Yapily's message says *"The **institution** rejected the call"*. For HSBC to be the
rejector, Yapily must have resolved our consent successfully — which independently proves our
stored token decrypts correctly and is still valid. And for `PNae…`, Yapily states it **attempted
a credential refresh with HSBC and HSBC refused it**. Both are bank-side outcomes.

Also note `triageConsentFailure` (`yapily.ts:1058-1098`) returned **non-fatal** on every one of
these 403s (`consent_failure_count` is still `0`). It only returns non-fatal when
`GET /consents/{id}` comes back **non-terminal** — i.e. **Yapily's own consent record says this
consent is alive** while the data call says "revoked". *(Caveat: it also returns non-fatal if the
`GET /consents/{id}` lookup itself failed — see F3 — so this is corroborating, not conclusive.)*

**What we cannot determine from our side:** *why* HSBC revoked access ~71 minutes after granting
it, and why one account reports "revoked" while three report "insufficient rights". That
distinction lives entirely in Yapily's logs. **Do not guess at it on the call — ask Q1 below.**

### E3 — What WE need to fix

| # | Severity | Issue | Location | Status |
|---|---|---|---|---|
| **F1** | **Critical** | Legacy TrueLayer edge function silently rewrites every Yapily connection to `status='token_expired'`, hiding it from `/api/bank/sync-now`, `/api/cron/consent-renewal` and the money-hub active card. | Supabase Edge Function `bank-sync` (`index.ts`, `syncConnection` token-expiry branch) driven by `cron.job` ids 2 & 3 | **DONE 16 Aug 17:42** — `supabase/migrations/20260816180000_retire_legacy_truelayer_bank_sync_cron.sql`. Jobs unscheduled (`cron.job` now holds only ids 1, 4, 5); row reset to `active`. Verified: all 3 `provider='truelayer'` rows are `revoked` + soft-deleted, and the view requires `status='active'`, so the function could never sync anything — it could only corrupt. |
| **F2** | High | The 90-day consent-renewal flow **would never have fired** for this connection. `/api/cron/consent-renewal/route.ts:43-51` filters `.eq('status','active')` and `:59-66` filters `.in('status',['active','expiring_soon'])`. A `token_expired` row is invisible to both — so F1 silently disabled re-consent prompting too. | `src/app/api/cron/consent-renewal/route.ts:43-66` | **Resolved by F1** for this row. Consider widening the filter to include `token_expired` as belt-and-braces. Not required before the call. |
| **F3** | Medium | `isYapilyConsentExpiryError` (`src/lib/yapily.ts:901-922`) does **not** match Yapily's actual live wording **"Consent must has been revoked."** The list checks `'consent has been revoked'`; the live string has `must` in the middle, so it never matches. This only bites on the fallback path (when `GET /consents/{id}` itself fails), but on that path a genuinely revoked consent is classed non-fatal **forever** and the user is never prompted to reconnect. | `src/lib/yapily.ts:914-916` | **NOT fixed — deliberate.** Adding the substring changes disconnect behaviour, and a wrong flip to `expired` the day before the review is worse than the current conservative miss. Fix after the call: add `'must has been revoked'` and `'been revoked'` to the list at `:914-916`. |
| **F4** | Low | `/api/yapily/initial-sync/route.ts:200-206` writes its `bank_sync_log` row **without** `transactions_synced` / `transactions_new`. The 15 Aug initial sync therefore logged `0 / 0` while actually inserting **567** transactions — which is exactly why the sync looked like it had failed when it had not. | `src/app/api/yapily/initial-sync/route.ts:200-206` | **NOT fixed.** One-line addition of `transactions_synced: totalInserted + totalDuplicateSkipped, transactions_new: totalInserted`. Cosmetic but it caused this whole misdiagnosis — worth doing after the call. |

**Nothing else on our side is implicated.** Consent storage, token round-trip, request shape,
date window, account-id handling and the 403-triage path all check out against production
evidence.

### E4 — The question to put to Migle

Word it so she can answer straight from her request logs. Give her the tracingIds.

> **Q1 (the one that matters).** Consent `fd949d3c-a633-49ee-9775-819ab58886dd`
> (consentRequestId `81d6a006-41d0-4f56-a11c-cbfa19285936`, institution `hsbcbusiness_uk`,
> authorised 15 Aug 2026 18:45:08 UTC, `consent_expires_at` 13 Nov 2026).
>
> `GET /accounts/{id}/transactions?from=<-90d>&before=<+1d>` succeeded on **all four** accounts
> at 18:45–18:47 on 15 Aug — including the 91-to-365-day historical window.
>
> The **identical** call, same consent token, same four account IDs, same date window, returned
> **403 on all four** at 20:00:59 the same evening, and on every run since.
> Latest set (16 Aug 17:02 UTC):
> `6a81ece6f7bf279875d881114ab9c0b1`, `6a81ecf4a31d8a75fc51f4566a7c1e06`,
> `6a81ed001508247d8a6d633d0eac58f2`, `6a81ed0c9cb92d3…`
> First set (15 Aug 20:00 UTC): `6a80c54a29b481257b85c7bbab170222`,
> `6a80c5589f1bf48a6ddcec46453d9796`, `6a80c55f0eb29508c71d1a83640fa80a`, `6a80c5672efc903…`
>
> **In your logs, what did HSBC actually return between 18:48 and 20:00 that killed this
> consent, and what is the correct client behaviour to keep it alive?**
>
> Specifically:
> 1. **Is there a time-boxed window** after consent grant during which HSBC Business allows
>    unattended data access, after which SCA / re-authorisation is required? If so, how long, and
>    is a scheduled 4×-daily sync outside it by design?
> 2. **Why do three accounts report `insufficient_rights` while `PNae6W0h3CyGMZimjdXrvw` reports
>    `Consent must has been revoked`** under the same consent token? Is `PNae…` still bound to the
>    older consent `371ff887-987b-4224-9cfe-2476446dfc05` / the 14 May consent on Yapily's side?
> 3. **What does `GET /consents/fd949d3c-a633-49ee-9775-819ab58886dd` report right now?** Our
>    triage treats it as non-terminal, which is why we correctly did **not** disconnect the bank.
>    If Yapily says AUTHORIZED while HSBC 403s, **what is the intended recovery path?**
>    `POST /consents/{id}/extend` only fires for us on `AWAITING_RE_AUTHORIZATION` — should we
>    call it on `insufficient_rights` too?
> 4. **Does `hsbcbusiness_uk` require per-account re-selection?** All six requested scopes are
>    advertised for this institution and all four accounts returned transactions at 18:47, so a
>    static scope gap does not fit the evidence.
> 5. **Is `before=<tomorrow>` (a future upper bound) acceptable to HSBC on unattended calls?** It
>    was accepted at 18:47 under the same consent, but confirm it is not a contributing factor.

### E5 — Will a clean reconnect hold for the demo?

**Honest answer: it will work, then degrade — probably within about an hour. Confidence: moderate
(this is a single observation, twice).**

- **It will pull data.** Both reconnects (14 May, 15 Aug) produced a fully successful multi-pass
  initial sync within minutes. 15 Aug inserted 567 transactions across all four accounts with
  zero errors. Reconnecting on the day will demonstrate points 1, 2, 5, 9 and 11 live.
- **It will not hold.** Both times, scheduled access died shortly after: 16 May (two days after
  the 14 May connect) and 15 Aug at 20:00 (**71 minutes** after the 18:48 connect). The
  degradation is not caused by anything we do in between — the 15 Aug case had a brand-new
  consent, `status='active'`, a clean failure counter, and no intervening code path.
- **F1 is now fixed**, so at least the connection will no longer *also* get silently marked
  `token_expired` on top of the 403s. That was masking the real signal.

**Demo recommendation:** do the fresh HSBC connect **immediately before** the call, not the night
before. Everything works inside the first window. Then use the 403s themselves as the live
evidence for point 6 (403 → `GET /consents/{id}` → prompt re-consent) — the triage path handles
them exactly as Yapily's build review requires, and the tracingIds above prove it fires in
production. Turning the fault into the demo for point 6 is the strongest available play, and it
is honest.

---

**Repo state audited:** `master` @ `d5498f1c` · **Audit date:** 2026-08-16
**Reviewer:** Migle (Yapily) · **Format:** app demo only, she reads Yapily's request logs her side
**Supersedes the claims in:** `docs/migle-build-review-runbook.html` (audited @ `0fcdf5ed`, line numbers there are stale and two of its demo steps no longer work — see GAPS)

---

## 0. Headline

**The code for all 11 points is genuinely implemented.** I verified each point against the
current source, not against the previous runbook. The unit suite runs clean:
`node --experimental-strip-types --test src/lib/yapily.test.ts` → **44 pass / 0 fail**.

**But the production account is not currently in a demoable state.** There is one live
Yapily connection and it cannot read transactions — every scheduled sync since
15 Aug 20:00 UTC has returned 403 on all four accounts. Its `status` was also stuck in a
value no code in `src/` writes (`token_expired`), which silently disabled the "Sync now",
"Renew", and "active connection" paths the demo depends on.

> **Updated 16 Aug 17:42 — see "Consent 403 diagnosis (16 Aug)" at the top of this file.**
> The `token_expired` mystery is solved and **fixed**: a legacy TrueLayer Supabase Edge
> Function on pg_cron was rewriting every Yapily connection's status. The 403s are a
> **separate, bank-side** fault and are **not** our bug — the identical request with the
> identical token succeeded 71 minutes earlier. Read that section instead of §0/§4 where
> they disagree.

Three of the eleven points (5, 9, 11) cannot be demonstrated live until that is fixed.
Points 1, 2, 3, 4, 6, 7, 8, 10 are demoable today.

**Do the two fixes in §4 before the call.** They take about ten minutes.

---

## 1. Verification table

Legend — **Confidence: High** = read the code and confirmed matching production DB/log
evidence. **Medium** = code confirmed, evidence indirect. **Low** = code confirmed only.

| # | Requirement | Implemented? | Evidence (file:line) | What fires in Migle's logs | Confidence |
|---|---|---|---|---|---|
| **1** | `POST /hosted/consent-requests` → 201 | **Yes** | `src/lib/yapily.ts:712-754` (body 715-737, request 739-745, guards 747-752) · called `src/app/api/auth/yapily/route.ts:157-165` behind `isHostedPagesEnabled()` at `:142` (flag read at `yapily.ts:777-779`) | `POST /hosted/consent-requests` → 201 with `institutionIdentifiers{GB, institutionId}`, `applicationUserId`, `userSettings{EN,GB}`, `accountRequest.featureScope[6]` | **High** — real hosted requests in prod on 15 Aug 18:44 and 16 Aug 15:30 |
| **2** | Redirect handled, consent stored | **Yes** | `src/app/api/yapily/callback/route.ts:148-184` (re-fetches hosted consent server-side, gates on status, refuses to persist without `consentId`) → `:226-245` → `src/lib/yapily/connection-store.ts:127-260` | `GET /hosted/consent-requests/{id}` → AUTHORIZED, then `GET /accounts` | **High** — `yapily_pending_consent_requests` row `81d6a006…` created 15 Aug 18:44:33, resolved `completed` 18:45:08 (35 s round trip) |
| **3** | Failed redirect: error params captured, logged, user notified | **Yes** | Capture: `callback/route.ts:48,59-61` (whole query string, not just `error`); persist to `yapily_pending_consent_requests.error_detail` jsonb `:63-84`; redirect `:86-88`. Notify: `src/app/dashboard/money-hub/page.tsx:423-455` maps 15 codes + upstream `reason` passthrough → `role="alert"` banner at `:914-930` with **Try connecting again** and `history.replaceState` param strip | `POST /hosted/consent-requests`, then the consent terminating `cancelled_by_user` | **High** — fired in production **today**: request `97f0076a-c0d4-4553-80e2-5fac0d2260fd`, 16 Aug 15:30:27 UTC, `error_source: USER`, `error_description: "Process cancelled by user"`, full payload persisted |
| **4** | Fallback polling after 3 min; stop on terminal; exponential backoff | **Yes — strongest point** | `src/app/api/cron/yapily-consent-abandonment/route.ts` — 3-min floor `:67`+`:136`, terminal set `:81-88` (her exact five, plus the `AUTHORISED` British variant), backoff `5000×2^n` capped 180 s `:98-100`, AUTHORIZED→full recovery via the same `upsertYapilyConnection` `:175-238`, abandon at 15 min `:274-294`. Scheduled `vercel.json:73` → `* * * * *` | `GET /hosted/consent-requests/{id}` repeating on the backoff curve until terminal or abandoned | **High** — request `c690ff1e…` (natwest), created 29 Jul 22:10:08, **7 poll attempts**, last poll 22:23:02, abandoned 22:26. Also `5325de29…` stopped on terminal `REJECTED`, `82a03fae…` on terminal `AUTHORIZED` |
| **5** | `GET /accounts` → 200, list returned, accountId stored | **Code yes / not currently demoable** | `yapily.ts:309-322` (consent token in `consent` header) · callback `:192-219` · stored `connection-store.ts:189,252` (`account_ids`, `account_display_names`, `account_identifications_hashes`) | `GET /accounts` → 200 | **High for code, but see GAP G1** — last successful `/accounts` was 15 Aug 18:45; it returned 4 accounts, all stored. Transactions behind them 403 |
| **6** | Expired/invalid consent: 403 → verify via `GET /consents/{id}` → prompt re-consent | **Yes** | 403 triage `yapily.ts:1058-1098` → `resolveConsentState:979-1000` → `getConsent:622-629` = `GET /consents/{id}`. Terminal/extendable sets `:959-971`. Callers: `api/cron/bank-sync/route.ts:406`, `api/bank/sync-now/route.ts:~415`. Re-consent surface: `/api/connections/health/route.ts:64,85-92` → `ConnectionHealthBanner.tsx:162-176` "Reconnect", plus money-hub expired card `page.tsx:1163` | `GET /accounts/{id}/transactions` → **403**, immediately followed by `GET /consents/{id}` | **High** — abundant real evidence. Today 16 Aug 13:03:34 UTC, 4 × 403 with tracingIds `6a81b4f6d354db4275dbaf534c81db33`, `6a81b505dd3676a875f506df60b93d26`, `6a81b5125ceff93de158da293951b723`, `6a81b51db74a8ace883c9392f60c306f`. Same pattern at 09:03 and 03:01 today, and continuously since 15 Aug 20:00 |
| **7** | One simulated example per error class; all HTTP codes covered | **Yes** | `classifyYapilyError` `yapily.ts:68-79` (400/422→bad_request, 401→auth, 403→consent, 404→not_found, 409→conflict, 429→rate_limit, 5xx→server) · retry gate `:83-85` · retry loop honouring `Retry-After` `:137-150` (RFC 7231 seconds *and* HTTP-date, `parseRetryAfter:105-116`) · tracingId from body **and** header `:152-185`. Tests: class matrix `yapily.test.ts:441-474`, behaviour per class `:476-600` (401, 403, 409, 429-recovers, 429-exhausts, 500-recovers, 400-never-retried, header-only tracingId) | Historical 403s (above) are the live example. 429/5xx behaviour is pinned by test, not by live traffic | **High** — 44/44 tests pass, verified by running the suite |
| **8** | Consent deletion available to the user at any time | **Yes** | UI trash icon, no state gating: active connections `money-hub/page.tsx:1218`, expired connections `:1164` → `DisconnectBankModal` → `api/bank/disconnect/route.ts:122+` → `revokeYapilyConsentIfPossible:70-120` → `deleteConsent` `yapily.ts:792-824` = `DELETE /consents/{id}`, 404 treated as success `:804`. Failed revokes queue (`pending_yapily_revoke`) and drain via the consent-renewal cron | `DELETE /consents/{id}` → 204 (or 404, which we treat as already-gone) | **Medium** — code is unambiguous; no delete has run recently in prod to point at. Caveat: rows with null `yapily_consent_id` skip the upstream revoke (`disconnect/route.ts:74`) — that is 3 of the 4 legacy rows |
| **9** | 90-day reconfirmation: user prompted, consent extended, UI confirmation | **Code yes / blocked by G2** | Stamp at connect `callback/route.ts:224` (+90 d) and on recovery `abandonment:202-204`. Cron `api/cron/consent-renewal/route.ts:43-51` flips `active`→`expiring_soon` inside 7 days, `:59-66` → `expired`, then WhatsApp `:74-133` + email `:135-194`. Banner `ConsentRenewalBanner.tsx` ← `ConnectionHealthBanner.tsx:20,90,108` ← mounted app-wide in `dashboard/layout.tsx`. Button → `api/bank/renew-consent/route.ts:102` → `reconfirmConsent` = `POST /consents/{id}/extend` (`yapily.ts:596-607`) | `POST /consents/{id}/extend` | **Medium** — every hop verified in code, but the current connection can't reach the `expiring_soon` state that gates it (G2). Never exercised in prod |
| **10** | Capture institutionId, call `GET /institutions`, only invoke supported endpoints | **Yes** | `getInstitutions` `yapily.ts:206-222` (GB filter, 1 h cache) · `getInstitutionFeatures:235-245` · **scope intersection at consent time** `api/auth/yapily/route.ts:106-139` (requests only what the institution advertises, fails open) · **pre-call gating at sync time** `api/cron/sync-upcoming/route.ts:155,183,217` with an `endpointsSkippedUnsupported` counter · user-facing capability line `BankPickerModal.tsx:38-44,191-193` ("Supports transactions · balances · direct debits") | `GET /institutions` → 200 | **High** — verified live: `https://paybacker.co.uk/api/yapily/institutions` → 200. `hsbcbusiness_uk` advertises `ACCOUNT_TRANSACTIONS`, `ACCOUNT_BALANCES`, `ACCOUNT_DIRECT_DEBITS`, `ACCOUNT_SCHEDULED_PAYMENTS`, `ACCOUNT_PERIODIC_PAYMENTS`, `ACCOUNT_TRANSACTIONS_WITH_MERCHANT`. See GAP G3 |
| **11** | Transaction pagination using `from` / `before` | **Yes** | `getTransactionsPage` `yapily.ts:393-432` sets `from`, `before`, `limit` (legacy `to` mirrored onto `before` at `:404`), logs the returned `meta.pagination` at `:423-430`. Walk `getAllTransactions:450-581`: trusts server-applied `meta.pagination.self.limit` over the requested limit `:489`, uses `meta.pagination.next` as the authoritative more-data signal `:490`, dedupes on `(id, date)` `:503`, numeric `from` compare `:470`, same-timestamp offset continuation `:517-539`, offset-mode guards `:543-552`, 50-page cap. Call site `api/cron/bank-sync/route.ts:360-363` | `GET /accounts/{id}/transactions?from=…&before=…&limit=1000` (and `&offset=` on a shared-timestamp page) | **Medium for code (10 unit tests, all pass) / not demoable live** — 0 transactions have been fetched since 15 Aug because of G1. Every recent transactions call in her logs is a 403, not a paginated 200 |

---

## 2. GAPS

### G1 — CRITICAL: the live consent cannot read transactions

Paul reconnected HSBC UK Business on **15 Aug 18:45** (consent granted, expires 13 Nov,
4 accounts stored). The two initial syncs at 18:47 and 18:48 logged `success` but returned
**0 transactions**. From **15 Aug 20:00** onward, every scheduled `bank-sync` run has failed:

| Account | Yapily 403 message |
|---|---|
| `PNae6W0h3CyGMZimjdXrvw` | *"We didn't managed to fix this unauthorized by refreshing the authorization credential. Consent must has been revoked."* |
| `hYUicT83Q1KsBiyvGIgewA` | *"The institution rejected the call due to insufficient rights. The consent does not have the right privileges for that action."* |
| `lnZJYieYpRr_aX02VTtTC0B3h0YWBiLfRem` | same |
| `YXYwe9cbCq1xAXb2f4Rv94qrwkbiWEhKozp` | same |

Latest occurrence: **16 Aug 13:03:34 UTC**. Zero transactions are stored for this connection.

Note the shape: `/accounts` returned 200 and gave us four accounts, but
`/accounts/{id}/transactions` returns `insufficient rights` on three of them and
`consent revoked` on the fourth. `PNae6W0h…` is the account ID carried over from the
previous (dead) consent — so we are asking the new consent for an account it may not
cover, and the three genuinely-new accounts are being refused transaction scope.

**Impact:** points **5** and **11** have no working artefact behind them; point **9**
would extend a consent that can't read data anyway.

**What to do:** disconnect and reconnect HSBC UK Business cleanly (the disconnect is
itself the point-8 demo), then confirm with the debug endpoint that a page of
transactions actually comes back. If the reconnect reproduces `insufficient rights`,
that is a question for Migle on the call rather than a bug to hide — ask her which
`featureScope` values HSBC UK Business requires for AIS transaction reads, and whether
the account set needs to be re-selected at the bank. It is a legitimate, well-evidenced
question and asking it will read better than a demo that silently returns nothing.

**Severity: Critical — blocks 3 of 11 points.**

### G2 — HIGH: `status = 'token_expired'` silently disables three demo paths

The only live connection (`f1776dbb-125f-4915-9261-39289068a622`, Paul's account,
Pro tier) currently has `status = 'token_expired'`.

**No code in `src/` writes that value.** It is permitted by the CHECK constraint in
`supabase/migrations/20260402050000_yapily_migration.sql:10` and read in several places,
but the only writer paths set `active` / `expired` / `expiring_soon` / `revoked` /
`revoked_duplicate`. `upsertYapilyConnection` explicitly sets `status: 'active'` on both
the reuse path (`connection-store.ts:194`) and the insert path (`:255`). So this value
was set out-of-band, after the 15 Aug reconnect.

Four consequences, all of which break the previous runbook's demo order:

1. **"Sync now" fires nothing.** `api/bank/sync-now/route.ts:140` filters
   `.eq('status', 'active')`. A `token_expired` connection is never selected, so the
   button produces **zero Yapily API calls**. The old runbook's step 3 — "click Sync now
   on the dead connection to produce the 403" — does not work. The 403s in her logs come
   from the `bank-sync` cron, which does include `token_expired`
   (`api/cron/bank-sync/route.ts:121`).
2. **"Renew" 400s.** `api/bank/renew-consent/route.ts:74` allows only
   `expiring_soon` / `expired`.
3. **The 90-day banner can never appear for this row.** The consent-renewal cron promotes
   only `status='active'` to `expiring_soon` (`api/cron/consent-renewal/route.ts:47`).
   Winding `consent_expires_at` forward alone is not enough.
4. **There is no "Active bank connections" card on Money Hub.** `money-hub/page.tsx:494`
   buckets `token_expired` into `expiredConnections`. Point 8's "delete is available at
   any time on an active connection" has nothing to point at.

**Severity: High — silently invalidates the demo script rather than failing loudly.**
Fixed by the clean reconnect in §4, which sets `status='active'`.

### G3 — MEDIUM: the bank picker shows sandbox institutions

`GET https://paybacker.co.uk/api/yapily/institutions` returns **four** institutions:

```
hsbcbusiness_uk   HSBC UK Business
natwest           National Westminster Bank
mock-sandbox      mock-sandbox
natwest-sandbox   Natwest Bank Sandbox
```

Two of the four are sandbox entries and will render in the picker Migle sees, one of them
labelled literally `mock-sandbox`. This does not break any checklist point — the
capability line under each bank is genuine and drives real scope intersection — but a
reviewer opening a bank picker on a production build and seeing "mock-sandbox" will
draw a conclusion. Either accept it and say plainly *"our production institution access
is still limited to these while we complete this review"*, or filter `-sandbox` /
`mock-` ids from the picker before the call.

**Severity: Medium — credibility, not compliance.**

### G4 — MEDIUM: the onboarding bank CTA returns raw 400 JSON

`src/app/onboarding/page.tsx:427` and `:582` link directly to `/api/auth/yapily` with no
`institutionId`. That route requires the param (`api/auth/yapily/route.ts:38-43`) and
returns `{"error":"institutionId query parameter is required"}` with HTTP 400 — raw JSON
in the browser. Not a checklist item, but it is exactly the kind of thing a reviewer
clicks first. **Demo only from `/dashboard/money-hub`.**

**Severity: Medium — first-impression risk.**

### G5 — LOW: the previous runbook's env-check command is wrong

`/api/admin/env-check` returns `vars` as an **object keyed by name**
(`route.ts:76-79`), not an array with a `.name` field. The old
`jq '.vars[] | select(.name|test("YAPILY"))'` returns nothing and looks like a missing
variable. Correct form is in §4.

### G6 — LOW: `withConsentRetry` is dead code

`yapily.ts:1002-1028` implements extend-then-retry-once. Confirmed by grep across `src/`:
**zero call sites.** The live path extends inside `triageConsentFailure` and picks the
work up on the next cron run, costing at most one sync cycle. Honest answer if she asks;
don't volunteer it. Either wire it in or delete it after the review.

### G7 — LOW: an abandoned consent notifies nobody

The poller marks the row `abandoned` at 15 minutes (`abandonment/route.ts:274-294`) and
stops. No email or push to the user. The machinery exists in
`api/cron/consent-renewal/route.ts:74-194` and would be reused. Not a checklist
requirement; a fair "what would you improve" answer.

### G8 — LOW: stale doc comment

`api/bank/renew-consent/route.ts:84` still describes the legacy
`PUT /account-auth-requests/{consentId}`. The code correctly calls
`POST /consents/{id}/extend` (`yapily.ts:596-607`). Comment only.

---

## 3. What already exists in Migle's logs vs what must be generated live

She said she will review her side's logs. This is what she will already find, without
you touching anything — lead with it, because historical evidence is stronger than a
demo she watches you perform.

| Point | Already in her logs | Date/time (UTC) | Reference |
|---|---|---|---|
| 1, 2, 5 | Hosted consent created → AUTHORIZED → `/accounts` 200 → 4 accounts | 15 Aug 18:44:33 → 18:45:08 | consentRequestId `81d6a006-41d0-4f56-a11c-cbfa19285936` |
| 3 | Consent cancelled at the bank, error redirect captured in full | **16 Aug 15:30:27** | consentRequestId `97f0076a-c0d4-4553-80e2-5fac0d2260fd`, `error_code=cancelled_by_user`, `error_source=USER` |
| 4 | Abandoned consent polled 7 times on the backoff curve, then abandoned | 29 Jul 22:10:08 → 22:23:02 → 22:26 | consentRequestId `c690ff1e-b0a9-4ce0-9dfb-a6a3dc6ccf78` (natwest) |
| 4 | Polling stopped on terminal `REJECTED` | 18 May 12:43:52 → 12:50:29 | consentRequestId `5325de29-fd51-42b9-babe-c1b54305088c` |
| 4 | Polling stopped on terminal `AUTHORIZED` | 18 May 12:19:46 | consentRequestId `82a03fae-b987-4447-85c8-d0ade52eafef` |
| 6, 7 | 403 on transactions → `GET /consents/{id}` verification, 4× per run, 5 runs/day, continuous | 15 Aug 20:00 → **16 Aug 13:03** | tracingIds incl. `6a81b4f6d354db4275dbaf534c81db33` |
| 10 | `GET /institutions` | continuously (1 h cache refresh) | — |

**Must be generated live on the call:** point 1/2/5 as a *fresh* success (the reconnect),
point 8 (`DELETE /consents/{id}`), point 9 (`POST /consents/{id}/extend`), point 11
(a paginated `200` on `/transactions` with `from`/`before`).

---

## 4. Pre-call checklist

Do these in order. Allow 20 minutes. **The old runbook told you *not* to reconnect —
that advice is now wrong** (G1/G2); a clean reconnect is required, and the dead-connection
evidence for point 6 is already permanently in her logs from 28 Jul → 16 Aug, so you
lose nothing by fixing it.

- [ ] **1. Confirm the Hosted Pages flag.** It is already proven on by behaviour — a
      `yapily_pending_consent_requests` row is only ever inserted on the hosted branch
      (`api/auth/yapily/route.ts:176`), and one was written today. Belt and braces:
      ```bash
      curl -s -H "Authorization: Bearer $CRON_SECRET" \
        https://paybacker.co.uk/api/admin/env-check \
        | jq '.vars | with_entries(select(.key|test("YAPILY")))'
      ```
      Expect `YAPILY_HOSTED_PAGES_ENABLED` → `present: true`, `length: 4`, `prefix: "true…"`,
      plus `YAPILY_APPLICATION_UUID` and `YAPILY_APPLICATION_SECRET` present.
      *(Do not paste the output into chat — it shows value prefixes.)*
- [ ] **2. Disconnect the broken HSBC connection from Money Hub** (trash icon → confirm).
      This fires a real `DELETE /consents/{id}` and clears the stuck `token_expired` row.
- [ ] **3. Reconnect HSBC UK Business** from `/dashboard/money-hub` → Connect bank.
      Complete authorisation properly. At the bank screen, **select every account you
      want** — the `insufficient rights` errors in G1 suggest the previous consent's
      account/scope selection was incomplete.
- [ ] **4. Prove transactions actually come back** — this is the single most important
      pre-flight check:
      ```bash
      curl -s -H "Authorization: Bearer $CRON_SECRET" \
        "https://paybacker.co.uk/api/yapily/debug-tx-test?connectionId=$CONN_ID&raw=1" | jq
      ```
      You need a non-zero page count and a visible `meta.pagination`. **If this still
      403s, stop and email Migle before the call** asking about HSBC UK Business AIS
      transaction scope — do not walk into the demo hoping it resolves.
- [ ] **5. Set up the point-9 banner** (only after step 4 passes). Both fields are
      required — `consent_expires_at` alone will not do it (G2):
      ```sql
      update bank_connections
         set status = 'expiring_soon',
             consent_expires_at = now() + interval '5 days'
       where id = '<new connection id>';
      ```
      Then load any `/dashboard/*` page and confirm the renewal banner renders with
      "expires in 5 days".
- [ ] **6. Decide on the sandbox institutions** (G3) — filter them from the picker, or
      prepare the one-line explanation.
- [ ] **7. Have `CRON_SECRET` in a terminal**, and `$CONN_ID` exported.
- [ ] **8. Do NOT click the onboarding bank CTA** (G4). Demo only from
      `/dashboard/money-hub`.
- [ ] **9. Leave `d8605469-1f25-4450-95a5-23304628fc7e` alone** — the second
      HSBC row, `status='expired'`, consent expired 5 Aug. Harmless, and it is a
      legitimate second example of the expired state if she wants one.

---

## 5. Live demo script

Screen-share Money Hub with **DevTools → Network open**. Work her list in her order —
don't reorder to lead with strengths, a reviewer working her own sequence gets a
cleaner picture and reordering reads as steering.

**Open in 60 seconds, then stop talking:**

> "I've been through all eleven against the build. I'll walk them in your order. Two
> things I want to flag up front rather than have you find them: I had a consent that
> was returning `insufficient rights` on transactions, which I've rebuilt this
> morning — I may have a question for you about HSBC Business scope. And a couple of
> the institutions in our picker are still sandbox entries. Stop me wherever you want."

That does three jobs: says you did the work, volunteers the weak spots before she finds
them, and hands her control.

---

### Step 0 — Start the abandonment trail FIRST *(covers point 4)*

**Do this before you say anything else about the checklist.** Click **Connect bank** →
pick **National Westminster Bank** → when the Yapily hosted page loads, **close the tab**
without authorising. Then carry on with the rest of the demo.

**Say:** *"I've just started a consent and walked away from it. We'll come back to it at
point four — by then your logs will show the poller chasing it."*

**Her side:** `POST /hosted/consent-requests` → 201. From T+3 min, repeating
`GET /hosted/consent-requests/{id}` at 5 s → 10 s → 20 s → 40 s → 80 s → 160 s → 180 s.

*Why first:* the polling floor is three minutes (`abandonment/route.ts:67`). Start it at
minute zero and the curve is fully formed by the time you reach point 4.

---

### Step 1 — Point 1: create hosted consent request

Click **Connect bank**. In the Network panel show
`/api/auth/yapily?institutionId=hsbcbusiness_uk` returning `{hostedUrl, consentRequestId}`.
**Don't proceed past the bank screen yet.**

**Say:** *"We build the consent request server-side — the application secret never reaches
the browser. Country code GB, language EN, location GB, and the feature scope goes under
`accountRequest` per the OpenAPI spec, not at the top level."*

**Her side:** `POST /hosted/consent-requests` → **201**.

*If she asks whether you pin to 201:* be straight — the client accepts any 2xx
(`yapily.ts:152`), so a Yapily-side change from 201 to 200 wouldn't break you. The body
shape, the optional-institution case and the featureScope nesting are pinned by unit
tests at `yapily.test.ts:118-298`.

---

### Step 2 — Point 3: failed redirect *(take 3 before 2 — you're already at the bank screen)*

**Cancel at the bank's screen.** You land back on Money Hub and the red banner renders:
*"Connection didn't complete — You cancelled the authorisation at your bank. Nothing was
shared…"* with a **Try connecting again** link. Refresh the page to show the params were
stripped and the banner doesn't re-raise.

**Say:** *"We capture the entire query string, not just `error` — the useful detail is in
`error_description` and `error_source`, and reading only `error` throws that away. It's
persisted as JSON against the consent request, so we can reconstruct any user's failure
after the fact. And it's rendered: fifteen distinct failure modes get distinct copy, so
someone who cancelled at their bank gets 'you cancelled, try again whenever' rather than
a generic error."*

**Her side:** `POST /hosted/consent-requests` → 201, then the consent terminating
`cancelled_by_user`.

**Offer the historical proof:** *"You'll also see this exact path from a real user at
15:30 UTC today — consent request `97f0076a-c0d4-4553-80e2-5fac0d2260fd`."*

---

### Step 3 — Points 1, 2, 5: complete a real connection

Click **Try connecting again** from the banner, pick HSBC UK Business, and **complete
authorisation properly**. You land on `?connected=true` and the **Active bank connection**
card renders with the account names.

**Say:** *"The callback doesn't trust the redirect query string. It re-fetches the hosted
consent server-side, checks the status is AUTHORIZED, and refuses to persist at all if
Yapily hasn't returned a `consentId` — because that's the identifier extend and delete
need, and storing the wrong thing there would break both silently later. The consent
token is encrypted at rest; it never appears in a log or a client payload."*

**Her side:** `POST /hosted/consent-requests` → 201 · `GET /hosted/consent-requests/{id}`
→ AUTHORIZED · `GET /accounts` → **200**.

---

### Step 4 — Point 4: the fallback poller *(come back to Step 0's abandoned consent)*

By now it is 6-10 minutes old. Run:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://paybacker.co.uk/api/cron/yapily-consent-abandonment | jq
```

Then show the curve in the data:

```sql
select consent_request_id, yapily_status, poll_attempts, next_poll_at,
       next_poll_at - now() as due_in
from yapily_pending_consent_requests
where status = 'pending' order by next_poll_at;
```

**Say:** *"The poller runs every minute but won't touch a request until it's three
minutes old, so a normal redirect always wins the race. Intermediate states back off
exponentially — five seconds doubling to a three-minute ceiling. Your five terminal
states stop it permanently, and we also handle the AUTHORISED spelling you sometimes
return. At fifteen minutes it's marked abandoned. The important bit is what happens on
AUTHORIZED: we don't just log it, we complete the connection through the same code path
the callback uses. Detecting an authorisation and then doing nothing with it satisfies
nobody."*

**Her side:** the backoff-spaced `GET /hosted/consent-requests/{id}` sequence from Step 0.

**Historical:** *"There's a completed example from 29 July — request `c690ff1e…`, seven
polls between 22:10 and 22:23, then abandoned at 22:26."*

**If she probes:** volunteer that an abandoned row currently sends the user no
notification (G7), and that the email/WhatsApp machinery to do it already exists.

---

### Step 5 — Point 6: expired/invalid consent

You have better evidence here than any live simulation: continuous production 403s.

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://paybacker.co.uk/api/cron/bank-sync | jq
```

Then show the expired banner and **Reconnect** button in the app.

**Say:** *"A 403 isn't treated as a generic failure and it isn't guessed at from the error
string. We call `GET /consents/{id}` and ask you directly what state the consent is in.
Terminal — expired, revoked, rejected, failed, invalid — means we stop and prompt a fresh
consent. `AWAITING_RE_AUTHORIZATION` means we extend it in place and it self-heals on the
next run. Anything else, including AUTHORIZED, means the 403 was a scope problem, not
expiry, and we deliberately do **not** disconnect the user's bank for that. Every error
carries your tracingId through to our logs — here's one from 13:03 today,
`6a81b4f6d354db4275dbaf534c81db33`."*

**Her side:** transactions → **403**, immediately followed by `GET /consents/{id}`.

**If she asks about retry-in-band:** be straight — `withConsentRetry` (`yapily.ts:1002`)
implements extend-then-retry-once but has no call sites (G6). The live path extends and
picks it up on the next cron run, costing at most one sync cycle.

---

### Step 6 — Point 7: error handling per class

She asked for "at least one simulated example per error class." You have a passing test
for every class. Run it on screen:

```bash
node --experimental-strip-types --test src/lib/yapily.test.ts
```

**44 pass, 0 fail.**

**Say:** *"Rather than simulate these ad hoc we pinned them as tests, so the behaviour
can't regress silently. The mapping is 400 and 422 to bad-request, 401 auth, 403 consent,
404 not-found, 409 conflict, 429 rate-limit, 5xx server. Retryable and non-retryable are
separated deliberately — only 429 and 5xx retry, and 429 honours your `Retry-After`
whether you send it as seconds or as an HTTP-date, clamped so a hostile value can't park
our function. Retrying a 403 just burns rate limit and delays the user's reconnect
prompt. The 403s you're seeing in your logs right now are the live example of the class."*

**Honest coverage answer if she asks:** *"`triageConsentFailure` / `resolveConsentState`,
the institution feature gating, and the poller's backoff logic aren't unit-tested — they're
covered by production behaviour instead."* Naming the gaps specifically buys more
credibility than quoting a percentage.

---

### Step 7 — Point 8: consent deletion

Show the trash icon on the **active** connection — no state gating, no "are you sure you
want to wait 30 days", available immediately. Open the modal and walk the options.
**Only actually delete if you're willing to redo Step 3** — you need the live connection
for points 9 and 11.

If you already deleted in pre-flight (checklist step 2), say so: *"You'll have seen a
`DELETE /consents/{id}` from me about an hour ago — that was this button."*

**Say:** *"Disconnect revokes upstream at Yapily, not just locally — the consent genuinely
dies at the bank. A 404 back from you is treated as success, because already-gone is the
end state we wanted. And because a network failure at that exact moment would otherwise
leave a live consent with no local record, failed revokes go into a retry queue that
drains daily and escalates to support after seven attempts."*

**Her side:** `DELETE /consents/{id}`.

**Caveat to volunteer:** legacy rows with a null `yapily_consent_id` skip the upstream
revoke (`disconnect/route.ts:74`) — pre-Yapily TrueLayer-era rows only.

---

### Step 8 — Point 9: 90-day reconfirmation

The banner should already be showing from pre-flight step 5. Point at it, click
**Renew Now**, show it clear and the connection return to active.

**Be open about the setup:** *"I've wound the expiry forward in our database so you can
see the prompt — I'm not going to pretend a consent aged ninety days between us starting
this call and now. The extend call itself is real."*

**Say:** *"We stamp the ninety-day expiry at connect. A daily cron flags anything inside
seven days and the user gets an in-app banner plus an email — WhatsApp too on our Pro
tier. Approving extends the existing consent rather than minting a new one, so the user
keeps their transaction history and their connection ID doesn't change."*

**Her side:** `POST /consents/{id}/extend`.

**Volunteer:** renewal is gated to `expiring_soon` / `expired`
(`renew-consent/route.ts:74`), so a user can't proactively extend a healthy consent.
That's deliberate, but say it — she may prefer it open.

---

### Step 9 — Point 10: endpoint capability verification

Open the bank picker and point at the capability line under each bank
("Supports transactions · balances · direct debits"). Then open
`https://paybacker.co.uk/api/yapily/institutions` in a tab — it's public, no auth.

If you didn't filter the sandboxes (G3), get ahead of it: *"Two of those are sandbox
entries — our production institution access is still limited while we complete this
review."*

Then:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://paybacker.co.uk/api/cron/sync-upcoming | jq '.endpointsSkippedUnsupported'
```

**Say:** *"We capture the institution ID at consent time and intersect our requested
feature scope with what that institution actually advertises, so we never ask a bank for
a scope it will reject — it widens the consent screen for no benefit and guarantees
downstream 4xx traffic against you. Then at sync time we check the features again before
calling scheduled payments, periodic payments or direct debits. That counter is how many
endpoint calls we skipped rather than fired blind and caught a 403. The lookup fails open
— if we can't read your institution list we request the full scope set rather than
silently narrowing the consent."*

**Her side:** `GET /institutions` → 200.

---

### Step 10 — Point 11: transaction pagination

Show the window parameters first — that's her literal ask — then the walk:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://paybacker.co.uk/api/yapily/debug-tx-test?connectionId=$CONN_ID&raw=1" | jq
```

It returns one page *with* its `meta.pagination` alongside the full paginated count, so
the delta between "first page" and "full window" is visible in one artefact.

**Say:** *"We window with `from` and `before` and walk the pages. Two subtleties worth
naming. First, we trust your `meta.pagination.self.limit` over the limit we asked for —
an institution that clamps the page size would otherwise defeat our stop condition.
Second, `before` is exclusive, so if a whole page comes back sharing one timestamp —
which happens on UK banks that only give date precision — there's nowhere to advance the
cursor to. We used to stop there rather than risk skipping rows. We now fall back to your
`next.offset` in exactly that case and pick up the rows behind it. We'd rather stop loudly
than truncate silently, but we no longer have to stop at all."*

**Her side:** `GET /accounts/{id}/transactions?from=…&before=…&limit=1000`, repeated
across pages, plus `&offset=` if a shared-timestamp page occurs.

**Context if she asks why it was built that way:** *"We had a zero-transactions incident
on 15 May — a high-volume account crossed the page size inside the ninety-day window and
the most recent transactions fell off the first page. The guard exists because we'd been
bitten."*

---

### Close

> *"Is there anything on that list you'd want to see differently before you'd sign it off?"*

Better to hear it now than in a written follow-up.

---

## 6. Solo vs phone-required

| Step | Point(s) | Needs phone / bank app? |
|---|---|---|
| 0 — abandon a consent | 4 | **No** — you close the tab before authorising |
| 1 — create consent | 1 | No |
| 2 — cancel at bank | 3 | **Yes, briefly** — you must reach the bank's screen to cancel there |
| 3 — complete connection | 1, 2, 5 | **Yes** — full HSBC authorisation, likely device approval |
| 4 — poller | 4 | No (curl + SQL) |
| 5 — 403 triage | 6, 7 | No (curl + app) |
| 6 — test suite | 7 | No |
| 7 — delete consent | 8 | No |
| 8 — renew | 9 | No |
| 9 — institutions | 10 | No |
| 10 — pagination | 11 | No |

**Only steps 2 and 3 need the bank app.** Do them back to back so you pick your phone up
once. Everything else is you, a browser and a terminal.

**Ordering constraints that actually matter:**

1. **Step 0 must be first.** Three-minute polling floor — start it at minute zero and the
   backoff curve is fully formed by the time you reach point 4.
2. **Step 2 before Step 3.** Cancelling at the bank puts you one click from the retry
   button, so the failure banner and the successful connection are one continuous story
   instead of two separate setups.
3. **Step 7 (delete) after Steps 8 and 10** if you only have one connection — deleting
   removes the consent that renewal and pagination need. Alternatively delete in
   pre-flight and refer back to it.
4. **Do not use the onboarding page** at any point (G4).

---

## 7. Paste-to-Migle summary

> Hi Migle,
>
> Ahead of the call — a quick note on where we are against the eleven points, so you can
> steer the session rather than us walking you through things you're happy with.
>
> All eleven are implemented. Several already have a trail in your logs you can check
> before we speak:
>
> - **Hosted consent create → authorise → accounts** — consent request
>   `81d6a006-41d0-4f56-a11c-cbfa19285936`, 15 Aug 18:44 UTC.
> - **Failed redirect capture** — consent request
>   `97f0076a-c0d4-4553-80e2-5fac0d2260fd`, 16 Aug 15:30 UTC, a real user cancelling at
>   HSBC. We persist the whole error payload, not just the `error` param, and surface a
>   specific message to the user with a one-click retry.
> - **Fallback polling** — consent request `c690ff1e-b0a9-4ce0-9dfb-a6a3dc6ccf78`,
>   29 Jul 22:10 UTC: seven polls on a 5 s → 180 s exponential curve, then marked
>   abandoned at fifteen minutes. Terminal-state stops are also visible on
>   `5325de29-…` (REJECTED) and `82a03fae-…` (AUTHORIZED).
> - **403 handling** — continuous since 15 Aug. Every 403 on `/transactions` is followed
>   by `GET /consents/{id}` to establish the actual consent state rather than inferring
>   it from the error text. Recent tracingId: `6a81b4f6d354db4275dbaf534c81db33`
>   (16 Aug 13:03 UTC).
>
> One thing I'd like your view on. Since reconnecting HSBC UK Business on 15 August,
> `GET /accounts` returns 200 with four accounts, but
> `GET /accounts/{id}/transactions` returns 403 — *"the institution rejected the call due
> to insufficient rights. The consent does not have the right privileges for that
> action."* We request `ACCOUNT_TRANSACTIONS`, `ACCOUNT_BALANCES`,
> `ACCOUNT_TRANSACTIONS_WITH_MERCHANT`, `ACCOUNT_DIRECT_DEBITS`,
> `ACCOUNT_SCHEDULED_PAYMENTS` and `ACCOUNT_PERIODIC_PAYMENTS` via
> `accountRequest.featureScope`, intersected against what `/institutions` advertises for
> `hsbcbusiness_uk` — all six are advertised. I'll have rebuilt the consent before we
> speak, but if this is a known HSBC Business behaviour I'd rather ask than guess.
>
> Also worth flagging: our institution list is currently four entries, two of which are
> sandbox. Happy to talk about what's needed to widen that.
>
> Thanks,
> Paul

---

## 8. Line-number index (current `master` @ `d5498f1c`)

The previous runbook's line numbers are from `0fcdf5ed` and no longer match. Use these.

| What | Where |
|---|---|
| Error class mapping | `src/lib/yapily.ts:68-79` |
| Retryability gate | `src/lib/yapily.ts:83-85` |
| `Retry-After` parsing | `src/lib/yapily.ts:105-116` |
| Retry loop | `src/lib/yapily.ts:137-150` |
| tracingId capture (body + header) | `src/lib/yapily.ts:152-185` |
| `getInstitutions` (GB filter, 1 h cache) | `src/lib/yapily.ts:206-222` |
| `getInstitutionFeatures` / `supportsFeature` | `src/lib/yapily.ts:235-259` |
| `getAccounts` | `src/lib/yapily.ts:309-322` |
| `getTransactionsPage` (from/before/limit/offset) | `src/lib/yapily.ts:393-432` |
| `getAllTransactions` (walk + offset continuation) | `src/lib/yapily.ts:450-581` |
| `reconfirmConsent` = `POST /consents/{id}/extend` | `src/lib/yapily.ts:596-607` |
| `getConsent` = `GET /consents/{id}` | `src/lib/yapily.ts:622-629` |
| `createHostedConsentRequest` | `src/lib/yapily.ts:712-754` |
| `getHostedConsentRequest` | `src/lib/yapily.ts:762-769` |
| `isHostedPagesEnabled` | `src/lib/yapily.ts:777-779` |
| `deleteConsent` = `DELETE /consents/{id}` | `src/lib/yapily.ts:792-824` |
| Terminal / extendable consent statuses | `src/lib/yapily.ts:959-971` |
| `resolveConsentState` | `src/lib/yapily.ts:979-1000` |
| `withConsentRetry` (dead code) | `src/lib/yapily.ts:1002-1028` |
| `triageConsentFailure` | `src/lib/yapily.ts:1058-1098` |
| Hosted-pages branch + pending row insert | `src/app/api/auth/yapily/route.ts:142-186` |
| Scope intersection | `src/app/api/auth/yapily/route.ts:106-139` |
| Error-redirect capture + persist | `src/app/api/yapily/callback/route.ts:48-89` |
| Hosted consent resolve + status gate | `src/app/api/yapily/callback/route.ts:148-184` |
| 90-day stamp | `src/app/api/yapily/callback/route.ts:224` |
| Poller floor / terminal / backoff / recovery | `src/app/api/cron/yapily-consent-abandonment/route.ts:67,81-96,98-100,175-238,274-294` |
| Poller schedule (`* * * * *`) | `vercel.json:73` |
| Error banner map + `role="alert"` | `src/app/dashboard/money-hub/page.tsx:423-455`, `914-930` |
| Trash icon (active / expired) | `src/app/dashboard/money-hub/page.tsx:1218` / `1164` |
| Upstream revoke + retry queue | `src/app/api/bank/disconnect/route.ts:70-120` |
| Renewal gate + extend call | `src/app/api/bank/renew-consent/route.ts:74-81`, `102` |
| `expiring_soon` / `expired` promotion | `src/app/api/cron/consent-renewal/route.ts:43-66` |
| Health payload buckets | `src/app/api/connections/health/route.ts:64,85-110` |
| Reconnect banner | `src/components/ConnectionHealthBanner.tsx:162-176` |
| Capability line in picker | `src/components/BankPickerModal.tsx:38-44,191-193` |
| Pre-call feature gating counter | `src/app/api/cron/sync-upcoming/route.ts:155,183,217` |
| 403 triage call site (cron) | `src/app/api/cron/bank-sync/route.ts:406` |
| Paginated transaction fetch call site | `src/app/api/cron/bank-sync/route.ts:360-363` |
| `upsertYapilyConnection` (sets `status='active'`) | `src/lib/yapily/connection-store.ts:127-260` |
| Unit tests (44 passing) | `src/lib/yapily.test.ts` |
