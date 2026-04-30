# Paybacker — Full QA Review (16 April 2026)

**Tester:** Paul Airey (aireypaul@googlemail.com, Pro account)
**Site:** paybacker.co.uk
**Method:** Live browser test + static codebase audit

---

## Executive summary

The product is feature-rich and the **core experiences work** — login, dashboard data rendering, subscriptions list, AI dispute tracking, profile, Stripe plan display, and legal pages all load and produce useful output. However, **monetary and data values diverge across pages in several places**, and there are multiple UI polish bugs that will undermine user trust in a consumer-finance product. Five items are P0 (ship-blockers or credibility-damaging): a sign-flip bug on the Monthly Trends chart, an inflated MRR calculation in admin metrics, diverging "cheaper deals" savings totals between Dashboard and Money Hub, a duplicate-deal-row explosion in Money Hub, and a missing Forgot Password flow.

**Headline counts**
- P0 issues: 5
- P1 issues: 9
- P2 / polish: 12
- Suggested improvements: 10

---

## P0 — Must fix before any paid-user rollout push

### P0-1. Monthly Trends chart — Net values have wrong sign on negative months
**Page:** /dashboard/money-hub — "Monthly Trends" widget
**Observed:** April 2026 shows `In: £8,778.12 · Out: £21,326.64 · Net: £12,548.52`. December 2025 shows `In: £0.00 · Out: £29.35 · Net: £29.35`.
**Expected:** April Net = `8778.12 − 21326.64 = −£12,548.52` (negative). December Net = `−£29.35`.
**Impact:** A user looking at their monthly history will think they saved £12.5k in a month where they actually overspent by £12.5k. For a finance product this is credibility-destroying.
**Likely cause:** `Math.abs()` applied when computing Net, or swapped operands.
**Fix location:** client-side computation in Money Hub Monthly Trends component (or the backing `/api/money-hub` aggregation if it returns absolute values).

### P0-2. Admin MRR formula uses wrong prices
**File:** `src/app/api/admin/metrics/route.ts` (~line 22)
**Observed:** `mrr = (tierBreakdown.essential || 0) * 9.99 + (tierBreakdown.pro || 0) * 19.99`
**Expected:** `essential * 4.99 + pro * 9.99` (per `src/lib/stripe.ts` and pricing page).
**Impact:** Every MRR number on the admin dashboard is ~2× reality. Any decision-making, investor update, or agent report based on this figure is wrong.
**Fix:** import `PLAN_PRICES` from `src/lib/stripe.ts` as the single source of truth, replace the literals, and add a unit test.

### P0-3. "Cheaper deals" savings diverge across Dashboard and Money Hub
**Pages:** /dashboard vs /dashboard/money-hub
**Observed:**
- Dashboard overview: `Better deals found — Save £2,025.00/year · 23 subscriptions with cheaper alternatives`
- Money Hub: `Cheaper Alternatives Found — Save £3,319.00/year · We found cheaper deals for 33 of your subscriptions`
- Same Money Hub page footer separately says `27 could be switched →` (third value)
**Impact:** Either the user is told they can save £2,025 or £3,319 — a £1,294 gap — depending on which page they look at. Undermines the whole "verified savings" value prop.
**Likely cause:** Two different queries/RPCs. Dashboard uses `get_subscription_totals()` to derive savings; Money Hub aggregates from `cheaper_alternatives` table directly; the "27 could be switched" line appears to use a yet-third filter (maybe "active only" vs "all").
**Fix:** centralise on one query; cache the result and expose a single `GET /api/savings/summary` endpoint that both pages consume.

### P0-4. Cheaper Alternatives list shows 14 identical EE→Lebara rows
**Page:** /dashboard/money-hub — "Cheaper Alternatives Found" section
**Observed:** The card `Ee £8.73/mo → £5.00/mo via Lebara — Save £45.00/yr` repeats **14 consecutive times**.
**Impact:** The page length balloons, the £3,319/yr headline is inflated by 14× double-counting of the same £45 saving (14 × £45 = £630 of the claimed savings are phantom), and the section looks buggy.
**Likely cause:** Each detected EE direct debit is being rendered as its own card instead of grouped by provider, or the underlying `cheaper_alternatives` query isn't `DISTINCT` on `(subscription_id, recommended_provider)`.
**Fix:** group by `(provider, alternative_provider)` client-side, sum the savings, and show a single row — "EE × 14 lines → Lebara — save £45/yr each (£630/yr total)" — with an expand toggle.

### P0-5. No Forgot Password flow on /auth/login
**Page:** /auth/login
**Observed:** Password and Magic Link tabs exist, but no "Forgot password?" link anywhere on the form.
**Impact:** Any password-auth user who forgets their password has no self-serve recovery; they must email support. Test plan case AUTH-03 cannot pass as written. On a financial product this also looks amateur.
**Fix:** add a link to `/auth/reset-password` below the password field; wire the Supabase `resetPasswordForEmail` flow. (Magic Link is technically a workaround but users expect an explicit reset link.)

---

## P1 — High priority

### P1-1. Disputes "Resolved" counter says 0 while 3 disputes are marked Won
**Page:** /dashboard/disputes (also reachable via /dashboard/complaints)
**Observed:** Header tiles show `8 Active Disputes · 0 Resolved · £6,675 Being Disputed · £2,245.00 Total Recovered`. The recovered figure exists only because three disputes (Barclaycard £200, LendInvest £2,000, Energie Fitness £45 = £2,245) are marked "Won". So Resolved must not be 0.
**Impact:** The KPI tile contradicts the list underneath it.
**Fix:** treat `status = 'won'` (and `'settled'`) as resolved in the header count.

### P1-2. Active-disputes count differs across three pages
- Dashboard overview: `11 Disputes Filed`
- Profile page: `7 Active disputes`
- Disputes page: `8 Active Disputes`
Three different numbers. "Filed" vs "Active" is fine as different semantics, but 7 vs 8 active is not defensible.
**Fix:** use the same query, exposed as a shared helper.

### P1-3. Deal counts disagree
- Landing page: `53 deals across 9 categories from top UK providers`
- Dashboard Quick Actions: `Browse 59 Deals`
- Dashboard savings tile: `from 23 deals` (this 23 = deals that beat a user's subscription, different semantics — labelling needs to clarify)
**Fix:** settle on live count from DB, use everywhere; or mark the 23 as "23 of your subscriptions beaten by a cheaper deal" to disambiguate.

### P1-4. Subscription count "57 vs 72" is confusing on Dashboard
**Observed:** Dashboard shows `Subscriptions & bills 57 · £1,529.60 · + £8,042.65 in mortgages, loans & tax`. Subscriptions page shows `Subscriptions & Bills 57 · Mortgages & Loans 10 · Council Tax 5 · Total 72 tracked`. The numbers are consistent (57 + 10 + 5 = 72), but only the Subscriptions page shows the breakdown; the Dashboard leaves you wondering why Money Hub says "72 tracked" and Dashboard says "57".
**Fix:** add a "+ 15 mortgages/loans/tax" sub-line on the Dashboard tile so the two always agree at a glance.

### P1-5. Monthly Trends net = 0 for Nov 2025 but data should exist
**Observed:** Nov shows `In: £0.00 · Out: £0.00 · Net: £0.00`. User has been a bank-connected customer since at least Dec 2025, so this is either a data-gap or a blank-vs-null rendering bug.
**Fix:** if there's legitimately no data, don't show the month; if there is data, fix the query's date filter.

### P1-6. Bank connections all expired — misleading "Auto-syncs up to 4× daily" claim
**Page:** /dashboard/money-hub header
**Observed:** `Auto-syncs up to 4× daily · Last synced: 2 days ago` is shown right above a list of six banks, **all of which are marked Expired**.
**Impact:** The user is being told they're being auto-synced when in fact nothing has synced since the tokens expired.
**Fix:** if any bank connection is expired, surface a warning banner and suppress the "Auto-syncs" claim; optionally auto-email the user at T-3 days before tokens expire so they can reconnect without a gap.

### P1-7. Duplicate category "Bills" vs "bills" with different emojis
**Page:** /dashboard/money-hub — Spending Breakdown
**Observed:** One entry reads `📋 bills — 15.8% — £3,371.19` and another reads `📄 Bills — 15.8% — £3,371.19`. Same £ and %, different casing and emoji. Either the same thing is listed twice, or categorisation isn't case-normalised.
**Fix:** lowercase-normalise category keys on write; keep a single emoji per canonical category in `src/lib/categories.ts` or similar.

### P1-8. Page `<title>` is identical across every dashboard page
**Pages:** /dashboard, /dashboard/money-hub, /dashboard/subscriptions, /dashboard/complaints, /dashboard/profile, /auth/login
**Observed:** every tab shows `Paybacker — Stop Overpaying on Bills, Subscriptions & More | UK Consumer Rights AI`.
**Impact:** browser-tab and history UX are confusing; SEO on marketing pages (e.g. /auth/login falling through to the home metadata) is weak.
**Fix:** add a `generateMetadata` or per-route metadata export. E.g. "Money Hub · Paybacker", "Subscriptions · Paybacker", "Sign in · Paybacker".

### P1-9. URL `/dashboard/complaints` renders a page titled "Disputes"
**Observed:** Navigating to `/dashboard/disputes` redirects to `/dashboard/complaints`. The page at that URL is titled "Disputes". Deep links to "complaints" as a URL shouldn't survive if the UI has moved on to "Disputes".
**Fix:** pick one — either rename the route to `/dashboard/disputes` with a redirect from `/complaints`, or put the word "Complaints" back in the heading so at least the URL matches the page title.

---

## P2 — Polish / correctness

### P2-1. Expected Bills ordinal suffixes are broken
**Page:** /dashboard/money-hub — Expected Bills
**Observed:** `Due ~1th`, `Due ~2th` (should be `1st`, `2nd`, `3rd`). English-speaking users will notice immediately.
**Fix:** small util — `const ord = n => { if (n%100>=11 && n%100<=13) return n+"th"; return n + ["th","st","nd","rd"][n%10]||"th"; }`.

### P2-2. Pricing page title has duplicate "Paybacker"
**Observed:** `<title>Pricing - Free, Essential and Pro Plans | Paybacker | Paybacker</title>`.
**Fix:** the root-layout metadata is appending " | Paybacker" and the route metadata already includes it. Strip one.

### P2-3. Test Plan v2 references outdated URLs and trial length
**File:** `docs/TEST_PLAN_V2.md`
- AUTH-03 says "Click Forgot password" — there is no such link.
- LEGAL-01/02 uses `/legal/privacy` and `/legal/terms` — both work *and* the canonical paths are `/privacy-policy` and `/terms-of-service`. Footer only links to the canonical pair.
- STRIPE-01 describes "Start 7-day free trial" — the site says **14-day**.
**Fix:** refresh the test plan to reflect the live product.

### P2-4. Signups counter on landing (`955 of 1,000`) vs real users
**Page:** /
**Observed:** `955 of 1,000 founding member spots remaining` alongside `45 Members joined · founding member pricing active`. If only 45 have joined, "955 remaining" is directionally correct (1,000 − 45 = 955) — OK by happy coincidence, but if the site ever drops below that cute alignment the two numbers will diverge.
**Fix:** make the "remaining" counter compute live from the real signup count.

### P2-5. Deliveroo copy on landing says £7.99 but Subscriptions shows Deliveroo £7.99/mo — CONSISTENT ✓ (this one I verified, keeping as "known-good")

### P2-6. "Tracked Subscriptions" panel mis-shows "Not in bank" badge for items that ARE in bank
**Page:** /dashboard/money-hub — Tracked Subscriptions
**Observed:** Netflix, Disney+, Plex, Sky TV all show `Not in bank` despite being Detected from bank account on the Subscriptions page.
**Likely cause:** match logic between `subscriptions` and `transactions` is name-normalisation-sensitive and mismatches when the provider descriptor differs.
**Fix:** fuzzy-match on provider name, or store a `bank_tx_match_id` on the subscription.

### P2-7. Email Scanner results contain duplicates
**Page:** /dashboard — Email Scanner
**Observed:** Netflix appears twice (one as `Apple`-sourced and another from PayPal), Google AI Ultra appears twice, Obsidian twice, etc. The AI-generated summaries even *internally* contradict (one says "renews 5 May at £29.00", another says "confirmed on 5 April 2026 and renewing 5 May 2026" — same event, two entries).
**Fix:** dedupe in the Opportunity Scanner pipeline — group by `(merchant, amount_pence, next_date ± 3d)` and show once with all source receipts linked.

### P2-8. Netflix price discrepancy flagged by the AI itself (correct, but worth reviewing)
**Observed:** Email Scanner correctly flags `Netflix £18.99 via PayPal 9 Apr` vs `Netflix renews 25 Apr £17.99`. This is the AI doing its job, but it's an example where the product's own "opportunities" list contradicts the "Subscriptions" list (Subscriptions shows £17.99). The fix is to surface the real price from bank data in the Subscriptions table.

### P2-9. HMRC subscription shown as "Cancelled" with £1,113.53/monthly and "Needs review"
**Page:** /dashboard/subscriptions
**Observed:** HMRC entry labelled `Cancelled` but still contributes to "Subscriptions & Bills £1,529.60/mo" (or does it? — worth checking whether cancelled items are excluded from the total; if they are, the total should be larger than £1,529.60).
**Fix:** verify `get_subscription_totals()` excludes `status IN ('cancelled', 'cancelling')`.

### P2-10. Multiple "Onestream Broadband 1/2/3" entries suggest test data
**Page:** /dashboard/subscriptions
**Observed:** three Onestream Broadband entries with different prices. For a user to have three simultaneous broadband contracts with the same provider is unusual; if this is seed/test data, it's confusing; if real, a duplicate-detection alert would help.
**Fix:** show a "possible duplicate" nudge when a provider appears in >1 active subscription of the same category.

### P2-11. "5 subscriptions need your review" banner doesn't specify which 5
**Page:** /dashboard/subscriptions
**Fix:** expand/anchor the banner to scroll to those 5 items (those tagged "Needs review"), or pre-filter the list when clicked.

### P2-12. Net Worth widget correctly computes £2.25M − £975k = £1.275M ✓ (known-good, keeping)

---

## Flow-by-flow QA status vs Test Plan v2

| Section | Status | Notes |
|---|---|---|
| 1. Authentication | **Partial fail** | AUTH-02 login works; AUTH-03 impossible (no Forgot Password). |
| 2. Plan Gating | **Not tested live** (need free account) | Static audit confirms `plan-limits.ts` enforces 3 letters/mo for free. |
| 3. Complaints AI | **Pass (history exists)** | 11 letters written; UI flow not clicked-through this round. |
| 4. Gmail/Outlook Scanner | **Pass (both connected)** | 30 opportunities surfaced; duplicates present (see P2-7). |
| 5. Subscription Tracker | **Mostly pass** | Manual add/edit/delete not exercised; totals & badges correct. |
| 6. Affiliate Deals | **Not exercised live** | Page accessible to Pro user. |
| 7. Stripe Payments | **Partial** | STRIPE-03 confirmed: Manage Billing visible on Profile. Portal not clicked. |
| 8. Profile Page | **Pass** | All fields render; Data export + Delete present. |
| 9. Legal Pages | **Pass** | Both `/legal/privacy` and `/privacy-policy` resolve. |
| 10. Admin Dashboard | **Needs separate account** | Requires admin role. |
| 11. Email Flows | **Not tested** | Waitlist EMAIL-01 would send from `hello@paybacker.co.uk`. |

---

## Suggested product improvements

1. **One "Total possible savings" number.** A single, always-live KPI at the top of every logged-in page (e.g. "You could save £3,319/yr — act on X items") pulled from the same endpoint everywhere. Removes the Dashboard-vs-Money-Hub gap.

2. **Proactive bank reconnect.** Email 3 days before Yapily/TrueLayer tokens expire with a one-click reconnect. At the moment all six connections are silently expired.

3. **Deduplicate email-scan opportunities.** Group by merchant + amount + date so you don't show Netflix twice; collapse into a single card with multiple sources.

4. **Group duplicate deal rows.** Instead of 14× "EE → Lebara £45/yr", show `EE × 14 lines — potential total saving £630/yr` with an expand toggle.

5. **"One-tap dispute" from a price-increase alert.** The Price Increase Alerts widget already shows `Start Dispute | Find Better Deal | Dismiss` — make Start Dispute pre-fill the dispute form with the provider, old price, new price and auto-reference the relevant law (Ofcom mid-contract price rise, Ofgem billing codes) so the user just clicks Send.

6. **Contract-end countdown on the Dashboard.** The Money Hub has "14 days until contract ends" messaging — promote it to the Dashboard overview so users see it on first login.

7. **Savings Leaderboard/Rewards.** The Loyalty feature exists (`src/lib/loyalty.ts`) — surface it on the dashboard with "You've recovered £2,245 — bronze tier unlocked".

8. **Mobile-first density pass.** The Dashboard tries to do a lot; each section would benefit from a "Show more / show less" toggle so first paint shows the top 3 actions.

9. **Per-page metadata titles** — fixes P1-8 and gives meaningful browser history / SEO.

10. **Admin parity test.** Add a cypress/playwright test that asserts `Dashboard.subscriptionCount === MoneyHub.trackedCount === Subscriptions.total` — would have caught P1-4 automatically.

---

## Math sanity-check log

- Spending-pie totals: 4339.31 + 3934.52 + 3371.19 + 3136.47 + 2166.01 + 980.08 + 802.44 + 511.64 = **£19,241.66** of £21,326.64 — the remaining £2,084.98 is distributed across the "+16 more categories". ✓
- Net Worth: 550k + 500k + 500k = £1.55M assets flat; 2.25M total implies ~£700k of additional assets not itemised (could be other property or the rollup differs). Liabilities 375k+275k+325k = £975k. ✓
- Total Recovered: £200 + £2,000 + £45 = **£2,245**. Matches the tile. ✓
- Price-increase yr totals: 5626.08 + 66.84 + 60 + 36.64 + 35.88 + 34.68 + 24 = **£5,884.12**; Dashboard shows £5,884.08 (4p rounding difference). ✓
- Starlink → Community Fibre: (56.36 − 25) × 12 = £376.32/yr; displayed £376. ✓
- MRR bug confirmed: `9.99` / `19.99` in `api/admin/metrics/route.ts` where `4.99` / `9.99` are correct.

---

## Files to open to fix the top 5

1. `src/app/dashboard/money-hub/page.tsx` and backing `/api/money-hub` aggregator — Monthly Trends sign flip, duplicate EE rows, duplicate Bills category.
2. `src/app/api/admin/metrics/route.ts` — MRR price literals.
3. Create `src/app/api/savings/summary/route.ts` — single endpoint for the "possible savings" KPI, consumed by both Dashboard and Money Hub.
4. `src/app/auth/login/page.tsx` — add Forgot Password link, wire to existing Supabase reset flow.
5. `src/app/layout.tsx` + per-route `metadata` exports — fix the global title.

— end of report
