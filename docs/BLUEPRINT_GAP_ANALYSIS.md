# Blueprint Gap Analysis — Paybacker LTD
**Date:** March 2026
**Blueprint source:** BLUEPRINT.docx (LifeAdmin AI Complete Build & Launch Blueprint)

---

## Overall Completion: ~62%

---

## Section 1: The Five AI Agents

| Agent | Blueprint Spec | Status | Notes |
|-------|---------------|--------|-------|
| 📧 Inbox Scanner | Gmail/Outlook read-only OAuth, opportunity detection, nightly runs | ✅ **Built** | `/api/gmail/scan`, `/api/outlook/scan`, `/api/auth/google`, `/api/auth/microsoft`. Manual trigger only — nightly cron not wired. |
| 💷 Savings Agent | Energy/insurance/broadband/mobile tariff comparison, switching letters | ❌ **Missing** | In backlog. High priority post-core. |
| ⚖️ Complaints & Rights | CRA 2015, FCA, Ofcom, formal letters, UK legislation | ✅ **Built** | `/api/complaints/generate` with UK consumer law context. History, modal, feedback/regenerate loop all built. |
| 📋 Forms & Government | HMRC rebates, council tax challenges, DVLA, NHS referrals | ❌ **Missing** | No page or API route. Not started. |
| 🔁 Subscriptions | Detect recurring charges (email + bank), cancel drafts | ✅ **Built** | `/api/gmail/detect-subscriptions`, `/api/subscriptions`, `/api/subscriptions/cancellation-email`. AI cancellation email working. |

**Agent completion: 3/5 agents built (60%)**

---

## Section 2: Tech Stack

| Component | Blueprint Spec | Status | Notes |
|-----------|---------------|--------|-------|
| Next.js 15 App Router | ✅ | ✅ **Done** | — |
| Supabase (Postgres + Auth) | ✅ | ✅ **Done** | EU-west-2, RLS enabled |
| Claude API (claude-sonnet-4-6) | ✅ | ✅ **Done** | All three built agents use it |
| Stripe (subscriptions + webhooks) | ✅ | ✅ **Done** | Checkout + webhook built; needs real price IDs |
| Gmail API OAuth | ✅ | ✅ **Done** | Working (test mode — needs Google app verification for public) |
| Microsoft Graph (Outlook) | ✅ | ✅ **Done** | `/api/auth/microsoft` + scan route built |
| Vercel hosting | ✅ | ✅ **Done** | Deployed at paybacker.co.uk |
| Resend (email) | ✅ | ⚠️ **Partial** | Waitlist sequence built; domain verification pending |
| PostHog analytics | ✅ | ❓ **Unknown** | Not confirmed in codebase — needs verification |
| Open Banking (Finexer/TrueLayer) | ✅ | ❌ **Missing** | Not started. Bank connections table not created. |
| Supabase Edge Functions + Cron | ✅ | ❌ **Missing** | Nightly agent runs not automated. All scans are manual. |

**Stack completion: 8/11 components (73%)**

---

## Section 3: Database Schema

| Table | Blueprint | Status | Notes |
|-------|-----------|--------|-------|
| users/profiles | ✅ | ✅ **Done** | Supabase Auth + profiles table |
| email_connections | ✅ | ✅ **Done** | `gmail_tokens` table (covers Gmail + will cover Outlook) |
| bank_connections | ✅ | ❌ **Missing** | Needed for Open Banking integration |
| opportunities | ✅ | ✅ **Done** | Scanner opportunities stored |
| drafts (complaint letters) | ✅ | ✅ **Done** | Stored via `agent_runs` / `tasks` table |
| agent_runs | ✅ | ✅ **Done** | Logging all agent activity |
| subscriptions_detected | ✅ | ✅ **Done** | `subscriptions` table |

**Schema completion: 5/7 tables (71%)**

---

## Section 4: Dashboard Pages & Features

| Feature | Blueprint | Status | Notes |
|---------|-----------|--------|-------|
| Auth (signup/login) | ✅ | ✅ **Done** | — |
| Dashboard overview | ✅ | ✅ **Done** | Stats from DB |
| Complaints page | ✅ | ✅ **Done** | Generate + history + letter modal + feedback loop |
| Scanner page | ✅ | ✅ **Done** | Gmail scan, opportunity cards, Track & Cancel |
| Subscriptions page | ✅ | ✅ **Done** | CRUD + AI cancellation email |
| Profile page | ✅ | ✅ **Done** | — |
| Pricing page | ✅ | ✅ **Done** | 3 tiers (Free / Pro £9.99 / Premium £19.99) |
| Forms & Government page | ✅ | ❌ **Missing** | No page, no agent, no API |
| Savings / Deals page | ✅ | ❌ **Missing** | No page, no agent, no API |

**Page completion: 7/9 pages (78%)**

---

## Section 5: Plan Gating & Business Logic

| Feature | Blueprint | Status | Notes |
|---------|-----------|--------|-------|
| Free tier (3 complaints, 1 scan/month) | ✅ | ⚠️ **Partial** | Complaints usage tracked (`/api/complaints/usage`). Scanner not gated. |
| Pro tier gating (unlimited) | ✅ | ⚠️ **Partial** | Stripe plan stored; gating middleware not enforced across routes |
| Premium tier gating (auto-send) | ✅ | ❌ **Missing** | Auto-send not built; Premium not differentiated from Pro in product |
| Stripe Customer Portal | ✅ | ❌ **Missing** | No self-service cancel/upgrade UI |
| Plan-gating middleware | ✅ | ❌ **Missing** | No middleware checking plan_tier before agent runs |

**Business logic completion: 1/5 items (20%)**

---

## Section 6: Legal & Compliance

| Item | Blueprint | Status | Notes |
|------|-----------|--------|-------|
| Privacy Policy | ✅ | ✅ **Done** | `/legal/privacy` — GDPR compliant, names Anthropic as processor |
| Terms of Service | ✅ | ✅ **Done** | `/legal/terms` — "not legal advice" disclaimer included |
| GDPR Delete My Data | ✅ | ✅ **Done** | `/api/account/delete` route built |
| AI disclaimer on letters | ✅ | ⚠️ **Check** | Needs verification in complaint letter output UI |
| ICO registration | ✅ | ❓ **Unknown** | External — manual step, confirm status |
| UK Limited Company | ✅ | ❓ **Unknown** | External — confirm Companies House registration |
| Professional Indemnity / Cyber Insurance | ✅ | ❓ **Unknown** | External — confirm arranged |

**Legal completion: 3/7 items confirmed (43%)**

---

## Section 7: Marketing & Growth Features

| Feature | Blueprint | Status | Notes |
|---------|-----------|--------|-------|
| Waitlist landing page | ✅ | ✅ **Done** | Live at paybacker.co.uk |
| Waitlist email capture + Resend | ✅ | ✅ **Done** | `/api/waitlist` + 7-email nurture sequence |
| PostHog analytics | ✅ | ❓ **Unknown** | Confirm in layout.tsx |
| "Share Your Win" viral feature | ✅ | ❌ **Missing** | High-ROI growth feature — not started |
| SEO content pages | ✅ | ❌ **Missing** | 200+ target pages — not started |
| ProductHunt launch assets | ✅ | ❌ **Missing** | Screenshots, demo video — not prepared |

**Marketing completion: 3/6 items (50%)**

---

## Section 8: Infrastructure & Operations

| Feature | Blueprint | Status | Notes |
|---------|-----------|--------|-------|
| Vercel deployment | ✅ | ✅ **Done** | Auto-deploy from master |
| Custom domain (paybacker.co.uk) | ✅ | ✅ **Done** | SSL active, Vercel DNS |
| Nightly cron / background jobs | ✅ | ❌ **Missing** | No Supabase Edge Functions scheduled. All scans manual. |
| Agent run logging | ✅ | ✅ **Done** | `agent_runs` table |
| Open Banking consent management | ✅ | ❌ **Missing** | Finexer/TrueLayer integration not started |

**Ops completion: 3/5 items (60%)**

---

## Priority Gap Summary

### 🔴 Critical / Pre-Launch Blockers
1. **Stripe real price IDs** — Checkout non-functional without live price IDs
2. **Google OAuth app verification** — Currently test-mode only; blocks real user signups
3. **Resend domain verification** — Transactional emails going via sandbox (unreliable)
4. **Plan-gating middleware** — Pro features accessible to Free users; revenue leakage risk
5. **Stripe Customer Portal** — No self-service cancel/upgrade; required for Stripe compliance

### 🟡 High Priority / Post-Launch (Month 1–2)
6. **Forms & Government Agent** — 4th of 5 blueprint agents; significant user value (HMRC, council tax)
7. **Open Banking (Finexer)** — Unlocks bank-feed subscription detection (more accurate than email)
8. **Nightly cron scans** — Currently all manual; automation is core product promise
9. **Stripe Customer Portal** — Self-service billing management
10. **PostHog integration** — Confirm or add; blind without analytics

### 🟢 Growth / Month 2–3
11. **Savings Agent** — Deal comparison (energy, insurance, broadband, mobile)
12. **Share Your Win feature** — Highest-ROI viral growth mechanic
13. **SEO content pages** — 200+ "How to complain to X" pages for organic traffic
14. **AI disclaimer on letters** — Confirm it's visible in letter output UI
15. **Premium tier differentiation** — Auto-send on approval not built

---

## Blueprint Completion by Section

| Section | % Complete |
|---------|-----------|
| AI Agents | 60% |
| Tech Stack | 73% |
| Database Schema | 71% |
| Dashboard Pages | 78% |
| Plan Gating / Business Logic | 20% |
| Legal & Compliance | 43% |
| Marketing & Growth | 50% |
| Infrastructure & Ops | 60% |
| **OVERALL** | **~62%** |

---

## Recommended Next Sprint (3 items to unlock launch)

1. **Stripe price IDs + Customer Portal** — unblocks paying customers
2. **Plan-gating middleware** — protects revenue, required before any marketing push
3. **Google OAuth app publication** — unblocks real Gmail connections for all users

After those three: Forms Agent, then Open Banking pilot.
