# Paybacker — Progress Report
*Generated: 21 March 2026*

---

## Launch Readiness Score: 68%

Up from ~62% at last gap analysis. Significant progress on Stripe, plan gating, deals tab, TrueLayer, and marketing infrastructure. Open Banking and Stripe production credentials remain the primary blockers.

---

## Completed Since Gap Analysis

| Item | Commit | Notes |
|------|--------|-------|
| Stripe Customer Portal | `515e81e` | `/api/stripe/portal` — self-service cancel/upgrade |
| Plan-gating middleware | `27c0c0d`, `d3260a5` | Merged into proxy.ts, enforced on paid routes |
| Deals tab (Affiliate) | `53d25f0` | `/dashboard/deals` + `/api/deals/click` tracking |
| TrueLayer Open Banking scaffold | `53d25f0`, `515e81e` | Auth flow, token encryption, `/api/bank/sync`, `/api/bank/connection`, upsert logic |
| Stripe new account + real price IDs | `daaec12`, `0986379` | New Stripe account wired, trial messaging updated |
| Complaints approve/edit flow | `c5c9103`, `27c0c0d` | Approve button, editable history letters |
| Admin dashboard | `8bbb4e3` | `/dashboard/admin` |
| Cron: waitlist + onboarding emails | `8bbb4e3` | `/api/cron/waitlist-emails`, `/api/cron/onboarding-emails` |
| Cron: launch announcement | `fbe0a62` | `/api/cron/launch-announcement` |
| Social posting pipeline | `fbe0a62`, `962c94d` | Generate, approve, post, image generation, Meta API |
| Programmatic SEO pages | `962c94d` | `/complaints/[company]` dynamic pages |
| Claude cost controls | `fc15d26`, `d0ce0f3` | Rate limiting, Haiku for light tasks, email truncation |
| Security hardening | `515e81e` | Token encryption, API gating fixes |

---

## Launch Blockers — Status

### 1. Open Banking (TrueLayer) — 40% complete
- [x] OAuth connection flow (`/api/auth/truelayer`, `/api/auth/callback/truelayer`)
- [x] Token encryption + storage
- [x] Bank sync endpoint (`/api/bank/sync`)
- [x] Disconnect endpoint (`/api/bank/disconnect`)
- [ ] **Transaction categorisation** (recurring payment detection from bank data)
- [ ] **Merge bank + email subscriptions** in tracker UI
- [ ] **TrueLayer production credentials** (sandbox → live approval, 2–4 weeks)
- [ ] `bank_transactions` table — verify schema and RLS

### 2. Stripe Payments — 80% complete
- [x] Checkout flow built
- [x] Webhook handling (all lifecycle events)
- [x] Customer Portal (`/api/stripe/portal`)
- [x] Plan-gating middleware (enforced on paid routes)
- [x] New Stripe account + price IDs set
- [x] Trial messaging
- [ ] **Verify production price IDs are live** (not test mode)
- [ ] **Dunning / failed payment handling** — confirm Stripe retry logic configured

### 3. Affiliate Deals Tab — 60% complete
- [x] Deals page (`/dashboard/deals`)
- [x] Click tracking (`/api/deals/click`)
- [ ] **Awin account approved** + real affiliate IDs
- [ ] **Links tested for correct attribution**
- [ ] Revenue reporting / conversion tracking

### 4. Subscription Tracker v2 — 50% complete
- [x] Basic tracker with CRUD
- [x] Email scanning (Gmail dual-query)
- [x] AI cancellation email generation
- [ ] **Bank feed integration** (depends on Open Banking #1)
- [ ] **Unified view** (bank + email sources merged)
- [ ] **Cancellation method DB** for top 50 UK providers
- [ ] **Unused/duplicate AI detection** (beyond partial)

---

## Non-Blocker Items — Status

### Infrastructure
| Item | Status |
|------|--------|
| Vercel deployment | ✅ Live at paybacker.co.uk |
| Custom domain + SSL | ✅ Active |
| Resend domain verification | ⚠️ Pending — emails via sandbox |
| Error monitoring (Sentry) | ❌ Not set up |
| Google OAuth app verification | ⚠️ Test mode only — blocks public Gmail access |
| PostHog analytics | ❓ Unverified |

### Legal & Compliance
| Item | Status |
|------|--------|
| Privacy Policy | ✅ `/legal/privacy` |
| Terms of Service | ✅ `/legal/terms` |
| GDPR Delete My Data | ✅ `/api/account/delete` |
| AI disclaimer on letters | ⚠️ Needs verification |
| ICO registration | ❓ External — confirm |
| Companies House registration | ❓ External — confirm |

### Marketing & Growth
| Item | Status |
|------|--------|
| Waitlist landing page | ✅ Live |
| Email nurture sequence | ✅ 7-email + cron |
| Social posting pipeline | ✅ Generate → approve → post |
| Branded image generation | ✅ Built |
| Programmatic SEO pages | ✅ `/complaints/[company]` |
| Share Your Win feature | ❌ Not started |

### Agents (3 of 5 built)
| Agent | Status |
|-------|--------|
| Inbox Scanner | ✅ Gmail + Outlook |
| Complaints & Rights | ✅ Full flow with approve/edit |
| Subscriptions | ✅ Detection + cancellation |
| Savings / Deals | ❌ Not started (deferred to Phase 2) |
| Forms & Government | ❌ Not started (deferred to Phase 2) |

---

## Revised Completion by Section

| Section | Gap Analysis | Now | Change |
|---------|-------------|-----|--------|
| AI Agents | 60% | 60% | — |
| Tech Stack | 73% | 82% | +9% |
| Database Schema | 71% | 79% | +8% |
| Dashboard Pages | 78% | 89% | +11% |
| Plan Gating / Business Logic | 20% | 60% | +40% |
| Legal & Compliance | 43% | 43% | — |
| Marketing & Growth | 50% | 75% | +25% |
| Infrastructure & Ops | 60% | 70% | +10% |
| **OVERALL** | **~62%** | **~68%** | **+6%** |

---

## Priority Actions to Reach Launch

### Immediate (this week)
1. **Verify Stripe is in live mode** — confirm price IDs, test a real checkout end-to-end
2. **Resend domain verification** — complete DNS setup so transactional emails are reliable
3. **TrueLayer production application** — submit now (2–4 week approval lead time)

### Next sprint (Weeks 1–2)
4. **Bank transaction categorisation** — detect recurring payments from TrueLayer data
5. **Unified subscription view** — merge bank + email sources in tracker UI
6. **Awin affiliate signup** — get approved, replace placeholder links with real affiliate IDs
7. **Cancellation method DB** — seed top 50 UK providers (cancel URLs, phone numbers, email templates)

### Before public launch
8. **Google OAuth verification** — submit for review (required for non-test Gmail access)
9. **Error monitoring** — add Sentry or equivalent
10. **End-to-end testing** — full user journey: signup → connect bank → view subs → file complaint → upgrade plan

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| TrueLayer approval delay | High — blocks bank feeds | Apply immediately; launch with email-only as fallback |
| Google OAuth review rejection | Medium — blocks Gmail scanning | Prepare privacy video, detailed scopes justification |
| Awin approval delay | Medium — blocks affiliate revenue | Use direct affiliate links as interim |
| No error monitoring | Medium — blind to production issues | Add Sentry before any marketing push |
| Resend sandbox limits | Low — emails may not deliver | Complete domain verification this week |
