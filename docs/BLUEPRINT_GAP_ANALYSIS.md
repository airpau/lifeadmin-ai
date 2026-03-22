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
| Stripe (subscriptions + webhooks) | ✅ | ✅ **Done** | Live mode activated; checkout + portal working; price IDs live |
| Gmail API OAuth | ✅ | ✅ **Done** | Working (test mode — needs Google app verification for public) |
| Microsoft Graph (Outlook) | ✅ | ✅ **Done** | `/api/auth/microsoft` + scan route built |
| Vercel hosting | ✅ | ✅ **Done** | Deployed at paybacker.co.uk |
| Resend (email) | ✅ | ✅ **Done** | Waitlist sequence built; domain verified ✅ |
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
| Free tier (3 complaints, 1 scan/month) | ✅ | ✅ **Done** | `checkUsageLimit()` enforces limits; API routes block free tier |
| Pro tier gating (unlimited) | ✅ | ✅ **Done** | Stripe plan stored; gating enforced in `/api/*` routes |
| Premium tier gating (auto-send) | ✅ | ❌ **Missing** | Auto-send not built; Premium not differentiated from Pro |
| Stripe Customer Portal | ✅ | ✅ **Done** | Self-service cancel/upgrade working at `/api/stripe/portal` |
| Plan-gating middleware | ✅ | ✅ **Done** | All agent routes check `plan_tier` before execution |

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

## Priority Gap Summary — UPDATED 21 March 23:11

### 🔴 Critical / Pre-Launch Blockers — LARGELY RESOLVED
1. **Stripe real price IDs** — ✅ DONE — Live mode active, checkout + portal working
2. **Google OAuth app verification** — ⏳ Waiting external (1-2 weeks)
3. **Resend domain verification** — ✅ DONE — Domain verified
4. **Plan-gating middleware** — ✅ DONE — All API routes enforce plan_tier
5. **Stripe Customer Portal** — ✅ DONE — Self-service cancel/upgrade working

### 🟡 High Priority / This Week
6. **TrueLayer testing** — 🔲 NOT TESTED — Built but needs verification
7. **Forms & Government Agent** — 🔲 NOT STARTED — 4th blueprint agent
8. **Nightly cron scans** — 🔲 NOT BUILT — All scans currently manual
9. **Open Banking (TrueLayer)** — 🔲 PARTIAL — Built, needs testing
10. **PostHog analytics** — 🔲 NOT STARTED — See setup instructions below

### 🟢 Growth / Month 2–3
11. **Savings Agent** — Deal comparison (energy, insurance, broadband, mobile)
12. **"Share Your Win" viral** — Highest-ROI viral growth mechanic
13. **SEO content pages** — 20 done, 180+ remaining
14. **AI disclaimer on letters** — Verify visible in complaint letter UI
15. **Premium tier differentiation** — Auto-send on approval not built

---

## Blueprint Completion by Section — UPDATED

| Section | % Complete |
|---------|-----------|
| AI Agents | 60% |
| Tech Stack | 82% (Stripe live, Resend verified) |
| Database Schema | 71% |
| Dashboard Pages | 78% |
| Plan Gating / Business Logic | 80% (was 20%) |
| Legal & Compliance | 43% |
| Marketing & Growth | 50% |
| Infrastructure & Ops | 60% |
| **OVERALL** | **~69%** (was 62%) |

---

## ACTION REQUIRED — Paul Manual Steps

1. **Awin merchant IDs** — When Awin approved, replace `!!!REPLACE_WITH_AWIN_ID!!!` in `src/app/dashboard/deals/page.tsx` with your Awin affiliate ID. Then verify each provider's actual merchant ID in the Awin dashboard:
   - Energy: Octopus (8173), OVO (5318), E.ON (15007)
   - Broadband: BT (5082), Sky (2547), Virgin Media (6137), Vodafone (9456)
   - Insurance: Compare the Market (3738), MoneySuperMarket (1986), GoCompare (5982)
   - Mobile: iD Mobile (15913), Smarty (18849), Lebara (13780)
   - Mortgages: Habito (15441), MoneySuperMarket (1986), L&C (7498), Trussle (19822)
   - Credit Cards: MSE (12498), Compare the Market (3738), TotallyMoney (10983)
   - Loans: Freedom Finance (14780), MoneySuperMarket (1986), Compare the Market (3738)
   - Car Finance: Carwow (18621), Zuto (16944)
   - NOTE: These merchant IDs are estimates — verify in Awin dashboard before going live

2. **PostHog personal API key** — Add to Vercel env vars (NOT in code) as `POSTHOG_PERSONAL_API_KEY`. Create key in PostHog > Settings > Personal API Keys with Read scope.

3. **Google OAuth verification** — Submit for review when ready for public Gmail access

---

## Remaining Tasks — Priority Order

### Must do before launch
- [ ] Fix admin dashboard blank page (auth/login pages not rendering)
- [ ] Staged launch: disable waitlist mode, free tier live, paid tiers "coming soon"
- [ ] Test full user journey end-to-end

### Should do soon
- [ ] Nightly cron: auto-sync bank transactions for connected users
- [ ] Deal matching engine: match user subscriptions to specific affiliate deals
- [ ] Spending intelligence dashboard: tiered reporting for users
- [ ] Separate scanning modes: subscription detection vs deal switching vs complaint opportunities

### Can wait (post-launch)
- [ ] Forms & Government Agent (HMRC, council tax, DVLA)
- [ ] Loyalty rewards programme (points system)
- [ ] Share Your Win viral feature
- [ ] Family plans
- [ ] Auto-cancel / auto-negotiate
- [ ] AI email aliases (support@, billing@, etc.)
- [ ] Annual savings report PDF

---

## PostHog Analytics Setup Instructions

**Why:** Track user behaviour, feature usage, conversion funnels, and drop-off points. Essential data for product decisions.

**Steps:**
1. **Create account:** Go to posthog.com, sign up with hello@paybacker.co.uk
2. **Get project API key:** Copy the "Project API Key" (starts with `phc_`)
3. **Add to Vercel:** `vercel env add NEXT_PUBLIC_POSTHOG_KEY production`
4. **Install SDK:** `npm install posthog-js`
5. **Add to layout.tsx:**
   ```tsx
   // In src/app/layout.tsx
   import posthog from 'posthog-js'
   
   if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
     posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
       api_host: 'https://app.posthog.com',
       loaded: (posthog) => {
         if (process.env.NODE_ENV === 'development') posthog.debug()
       }
     })
   }
   ```
6. **Track key events:**
   - `user_signed_up` — when new user registers
   - `complaint_generated` — when user generates complaint letter
   - `subscription_detected` — when user adds a subscription
   - `stripe_checkout_started` — when user clicks upgrade
   - `stripe_checkout_completed` — after successful payment
   - `gmail_connected` — when user links Gmail
   - `bank_connected` — when user links bank via TrueLayer

**Priority:** Medium — can launch without, but needed within 2 weeks for product insights.
