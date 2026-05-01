# Yapily Build Review — Code Changes & Test Plan

Generated 2026-04-30. Source: Migle Ivanauskaite test sheet (Build Review Testing Steps.pdf, attached to her 30 Apr email) plus the Vitally onboarding checklist points Paul flagged in his 29 Apr reply.

Goal: walk into Monday's call with all 11 tests green and a hosted-pages flow that matches Yapily's tutorial.

---

## Gap analysis (current code vs Migle's 11 tests)

| # | Test | Current state | Gap | Severity |
|---|---|---|---|---|
| 1 | POST `/hosted/consent-requests` → 201 | We use `POST /account-auth-requests` (direct flow). No `/hosted/` references in src/ | Switch to hosted-pages flow | P0 |
| 2 | Successful redirect with consent details | `/api/yapily/callback` works for direct flow | Verify hosted-flow callback params (`consent`, `application-user-id`, etc.) | P0 |
| 3 | Failed redirect — error params logged | callback `console.error`s only | Also write to `business_log` (audit) and surface to user | P1 |
| 4 | 3-minute fallback polling with exponential backoff | NOT IMPLEMENTED — no poller in codebase | New polling mechanism | P0 |
| 5 | `GET /accounts` → 200, store accountId | `getAccounts` exists, callback persists | OK | ✓ |
| 6 | 403 from `/accounts` → re-consent flow | `reconfirmConsent` + `ConsentRenewalBanner` exist, but only triggered by `connection.status` field. No 403 auto-detection. | `yapilyRequest` must surface 403 → mark connection expired → banner | P0 |
| 7 | Error class coverage (400/401/403/404/429/5xx) | `yapilyRequest` throws generic `Error` with message | Structured `YapilyError` with `.status` + class-specific handlers | P0 |
| 8 | DELETE consent | `/api/bank/disconnect` exists, calls `yapilyRequest` to revoke | Verify endpoint is `DELETE /account-auth-requests/{id}` (Migle's expected contract) | P1 |
| 9 | 90-day reconfirmation | `ConsentRenewalBanner` + `/api/bank/renew-consent` + `reconfirmConsent` | OK | ✓ |
| 10 | Per-institution capability check before scheduled-/periodic-/direct-debits | `/api/cron/sync-upcoming` calls all three unconditionally | Check `institution.features` before each call | P0 |
| 11 | Pagination via `from` and `before` | `getTransactions` supports `from`+`to`. No `before`. | Add `before` param + 5-minute window guard | P0 |

Six P0 code changes. Four P1/verification items.

---

## Code changes — concrete plan

### 1. Hosted Pages flow (T1, T2)

**Files:**
- `src/lib/yapily.ts` — add `createHostedConsentRequest(institutionId, callbackUrl, userUuid, featureScope)`. Calls `POST /hosted/consent-requests`. Returns the hosted-page redirect URL + `hostedConsentId`.
- `src/app/api/auth/yapily/route.ts` — switch from `createAccountAuthorisation` to `createHostedConsentRequest`. Persist `hostedConsentId` on `bank_connections` (additive column).
- `src/app/api/yapily/callback/route.ts` — accept the hosted-flow's redirect query params (`consent`, `application-user-id`, `consent-token`, `error`, `error_description`).

**Migration:** `supabase/migrations/20260501080000_yapily_hosted_consent_id.sql` — `ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS hosted_consent_id TEXT;` (additive, per CLAUDE.md no-drops rule).

**Reference:** https://docs.yapily.com/tools-and-services/hosted-pages/payment-tutorial-hosted-data

### 2. Fallback polling (T4)

**Approach:** server-side cron-driven, not client-side. Client-side polling means a tab close kills it.

**Files:**
- `src/app/api/cron/yapily-consent-poll/route.ts` (new) — every 60 seconds, find `bank_connections.consent_status = 'pending'` rows older than 3 min and not yet polled in the last 60s. For each, call `GET /hosted/consent-requests/{hostedConsentId}`. Update status. Stop on AUTHORIZED, REJECTED, REVOKED, FAILED, EXPIRED.
- Exponential backoff is implemented as `last_polled_at` + a `poll_attempts` column; next-run interval = `min(60s * 2^attempts, 600s)`.
- `vercel.json` — add `{ "path": "/api/cron/yapily-consent-poll", "schedule": "* * * * *" }` (every minute).

**Migration:** add columns `consent_status`, `pending_started_at`, `last_polled_at`, `poll_attempts` to `bank_connections` (additive).

### 3. Structured errors + 403 re-consent (T6, T7)

**Files:**
- `src/lib/yapily.ts` — define `class YapilyError extends Error { status: number; code?: string; raw?: unknown }`. Update `yapilyRequest` to throw `YapilyError` with `.status` set.
- `src/app/api/money-hub/route.ts`, `src/app/api/bank/sync-now/route.ts`, `src/app/api/cron/bank-sync/route.ts` — wrap `getAccounts` calls. On `YapilyError` with `status === 403`:
  1. `await supabase.from('bank_connections').update({ status: 'expired' }).eq('id', connection.id)`
  2. Optionally call `getConsent(consentId)` to confirm REVOKED/EXPIRED.
  3. Return a status the UI can render via `ConsentRenewalBanner`.
- All other status classes get a single shared handler (`handleYapilyError`) that logs to `business_log` and returns the right user-facing message.

### 4. Per-institution capability gating (T10)

**Files:**
- `src/lib/yapily/upcoming.ts` — before each call (`getScheduledPayments`, `getPeriodicPayments`, `getDirectDebits`), check `institution.features` includes the corresponding key (`SCHEDULED_PAYMENTS`, `PERIODIC_PAYMENTS`, `DIRECT_DEBITS` per Yapily's enum).
- `src/app/api/cron/sync-upcoming/route.ts` — fetch the institution row once per accountId and gate the loop on features. Skip + log when unsupported.
- `src/lib/yapily/connection-store.ts` — when upserting the connection, persist the institution's feature list as `bank_connections.institution_features` (text[]) for fast lookup without re-fetching `/institutions`.

**Migration:** `ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS institution_features TEXT[];`

Single-use semantics: those three endpoints are once-per-consent. Track invocations in `b2c_endpoint_invocations` (new table) or simpler — add `direct_debits_consumed_at`, `scheduled_payments_consumed_at`, `periodic_payments_consumed_at` to `bank_connections`. Refuse re-invocation if `*_consumed_at IS NOT NULL`.

### 5. Pagination + 5-min window (T11)

**Files:**
- `src/lib/yapily.ts` — `getTransactions(accountId, consentToken, opts: { from?, before?, to? })`. Add `before` param (Yapily uses `before` for the upper-bound cursor). Replace positional args.
- All callers (`/api/cron/bank-sync/route.ts`, `/api/money-hub/transactions/route.ts`, `/api/bank/sync-now/route.ts`) — update to pass `{ from, before }`. For incremental syncs, set `from = max(last_synced_at - 5min, account_opened_at)`. The 5-minute back-window ensures we tolerate Yapily's documented 5-min historical-data window without missing late-arriving rows.
- Loop until response page is empty or transaction count < page size.

### 6. Disconnect endpoint verification (T8)

**File:** `src/app/api/bank/disconnect/route.ts`

Read the existing code path top-to-bottom. The contract Yapily expects on Monday is `DELETE /account-auth-requests/{id}` (per Paul's 29 Apr reply: "the disconnect modal that fires DELETE /account-auth-requests/{consentId} on confirm"). Confirm the route does this. If it currently calls `DELETE /consents/{id}` instead, switch.

Also confirm the UI delete option is keyboard-accessible (focusable, Enter/Space activatable, screen-reader labelled).

### 7. Failure logging (T3)

**File:** `src/app/api/yapily/callback/route.ts`

Lines 43-55 currently `console.error` and redirect with a query-string `error=...` param. Add:
```ts
await supabase.from('business_log').insert({
  source: 'yapily_callback',
  severity: 'warn',
  summary: `Yapily redirect error: ${errorParam}`,
  metadata: { error: errorParam, error_description: searchParams.get('error_description'), state: searchParams.get('state') },
});
```

Also surface `error_description` to the user-facing redirect URL so the UI can render the actual reason.

---

## Test account strategy for tomorrow

**Recommendation: create a fresh test account.** Reasons:
- Predictable clean state for the demo on Monday — no legacy `bank_connections` rows, no leftover transactions, no half-renewed consents.
- We can wipe and re-seed it as many times as we need without nuking your real data.
- Production doesn't ship with this user — the Paybacker MCP `test_users_excluded` field already filters them out of metrics.

**Proposed test user:** `paul+yapilytest@paybacker.co.uk` (Gmail catch-all aliases land in your existing inbox).

Steps tomorrow morning:
1. Sign up that email at `paybacker.co.uk/auth/signup`. Verify email link works.
2. Promote to Pro tier in DB (so we hit no bank caps during testing): `UPDATE profiles SET subscription_tier = 'pro' WHERE id = (SELECT id FROM auth.users WHERE email = 'paul+yapilytest@paybacker.co.uk');`
3. Walk the onboarding to the bank-connect step. Click "Connect bank" → should redirect to Yapily hosted page → log in to NatWest Premier sandbox or HSBC Business sandbox (Migle has provisioned both per her 30 Apr email).
4. Execute the 11 test cases from the scheduled task.

**`aireypaul@googlemail.com` as alternative:** acceptable IF the account has no existing `bank_connections` rows, no transactions, and no active subscriptions tied to a card. Quickest check — run this SQL in Supabase:
```sql
SELECT
  (SELECT count(*) FROM bank_connections bc JOIN auth.users u ON u.id = bc.user_id WHERE u.email = 'aireypaul@googlemail.com') AS banks,
  (SELECT count(*) FROM bank_transactions bt JOIN auth.users u ON u.id = bt.user_id WHERE u.email = 'aireypaul@googlemail.com') AS txns;
```
If both are zero, it's safe to use. If either is non-zero, **use the fresh test account** — don't pollute the demo by wiping your real history.

---

## Build order tomorrow (08:00 BST onwards)

Roughly an 8-hour day if we hit it hard. Adjust if a P0 turns out trickier than expected.

| Slot | Hours | Work |
|---|---|---|
| 08:00–08:30 | 0.5 | Confirm staging env; create/verify test user; add `YAPILY_BASE_URL` for staging in `.env.local` if not set; sanity-check `GET /institutions` returns NatWest Premier + HSBC Business. |
| 08:30–10:00 | 1.5 | **Code change 1** (Hosted Pages flow) + DB migration. Local sign-up → hosted page redirects. T1 + T2 manually green. |
| 10:00–11:00 | 1.0 | **Code change 3** (structured errors + 403 re-consent). Wire into callers. |
| 11:00–12:30 | 1.5 | **Code change 2** (3-min fallback polling cron). Test by killing redirect mid-flow. |
| 12:30–13:00 | 0.5 | Lunch / TrueLayer copy sweep (find/replace; 30 files, mostly comments). |
| 13:00–14:30 | 1.5 | **Code change 4** (capability gating + single-use). Migration + connection-store update. |
| 14:30–15:30 | 1.0 | **Code change 5** (pagination + 5-min window). Backfill test by re-syncing. |
| 15:30–16:00 | 0.5 | **Code change 6+7** (disconnect verify + failure logging). |
| 16:00–18:00 | 2.0 | **Run all 11 tests end-to-end** with the test account against staging. Save evidence to `docs/yapily-build-review-evidence/<test-id>/`. Write `RESULTS.md`. |
| 18:00–18:30 | 0.5 | Hosted page branding (logo + colours in Yapily console). Tag `git tag v2026-05-01-yapily-build-review-ready`. Update Migle email draft with results and send. |

---

## Definition of done

- [ ] `rg -i 'truelayer' src/` returns 0 hits
- [ ] All 6 P0 code changes shipped to `main`
- [ ] All 11 tests have evidence in `docs/yapily-build-review-evidence/RESULTS.md` marked PASS (or a clear blocker noted)
- [ ] Hosted consent page renders Paybacker logo + navy/gold palette
- [ ] `npx tsc --noEmit` clean
- [ ] Vercel preview deploys green
- [ ] Test user signs up, connects NatWest Premier (or HSBC Business) sandbox, sees account list, sees transactions paginate, sees the renewal banner fire, can click Disconnect and the consent goes
- [ ] Email to Migle sent with results summary

---

## Risk register

| Risk | Mitigation |
|---|---|
| Hosted-flow redirect params differ from direct flow → callback breaks | Read https://docs.yapily.com/tools-and-services/hosted-pages/payment-tutorial-hosted-data first. Compare actual callback URL during T2 against expectation. |
| Polling cron firing every minute eats Vercel cron quota | Vercel hobby has 100 cron jobs limit but this is one job. Should be fine. Confirm in dashboard. |
| Single-use endpoints already consumed during dev work | Re-mint consent via fresh test user. Don't re-test single-use endpoints on the same consent — the spec is single-use. |
| 5-minute window not actually 5 min — Yapily docs may have changed | Verify with Migle on the call. The conservative play (sync from `last_synced_at - 5min`) is safe regardless. |
| Test user blocked by tier cap | Explicitly upgrade to Pro in DB before testing (no payment needed). |

---

## Open questions for Migle (Monday call)

1. Confirm Yapily expects `DELETE /account-auth-requests/{id}` or `DELETE /consents/{id}` for the disconnect modal — Paul's 29 Apr email said the former; want to lock it.
2. The 5-minute historical-data window — is that documented anywhere or just lore? We're being defensive about it but want her sign-off on the strategy.
3. Single-use endpoints (scheduled-payments, periodic-payments, direct-debits) — does "single-use" mean once per consent ever, or once per consent per 90-day cycle?
4. Hosted page branding — colour palette format (hex accepted? PNG vs SVG logo?).
5. Production go-live checklist — beyond passing these 11 tests, anything else needed before Yapily flips us to live?
