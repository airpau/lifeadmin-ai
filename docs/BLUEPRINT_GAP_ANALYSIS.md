# Blueprint Gap Analysis — Paybacker LTD
**Last updated:** 22 March 2026, 20:00

---

## Overall Completion: ~85%

---

## Section 1: The Five AI Agents

| Agent | Status | Notes |
|-------|--------|-------|
| Inbox Scanner | ✅ **Done** | 100 emails, 150+ providers, 4 parallel queries, comprehensive extraction |
| Complaints & Rights | ✅ **Done** | Category-aware legal context (11 categories), edit/regenerate, saved to history |
| Subscriptions | ✅ **Done** | Bank + email detection, soft-delete, categories, cancellation methods DB (50+ providers) |
| Savings / Deals | ✅ **Mostly done** | 8 deal categories, personalised recommendations. Waiting on Awin for live links |
| Forms & Government | ❌ **Not started** | HMRC, council tax, DVLA. Post-launch |

**Agent completion: 4/5 agents built (80%)**

---

## Section 2: Tech Stack

| Component | Status | Notes |
|-----------|--------|-------|
| Next.js 15 App Router | ✅ | |
| Supabase (Postgres + Auth) | ✅ | EU-west-2, RLS enabled |
| Claude API | ✅ | Sonnet for complaints, Haiku for chatbot/scanning. Per-user token tracking |
| Stripe (subscriptions + webhooks) | ✅ | Live mode, full lifecycle, portal, sync |
| Gmail API OAuth | ✅ | Built. Waiting on Google app verification for public access |
| Microsoft Graph (Outlook) | ✅ | Built, not tested |
| TrueLayer Open Banking | ✅ | **LIVE** — multi-bank, 2,337+ transactions, nightly sync |
| Vercel hosting | ✅ | paybacker.co.uk + paybacker.ai redirect |
| Resend (email) | ✅ | Domain verified, 6 email sequences active |
| PostHog analytics | ✅ | Server-side tracking, working |
| Google Analytics GA4 | ✅ | G-GRL9XKYTN1 |
| Awin affiliates | ⏳ | Deal pages built, waiting on Awin approval |

**Stack completion: 11/12 components (92%)**

---

## Section 3: Database Schema

| Table | Status | Notes |
|-------|--------|-------|
| profiles | ✅ | Stripe IDs, subscription tier/status |
| waitlist_signups | ✅ | With email sequence tracking |
| subscriptions | ✅ | Soft-delete, source, category, bank_description, connection_id |
| bank_connections | ✅ | Multi-bank, bank_name, account_display_names |
| bank_transactions | ✅ | 2,337+ records, dedup on transaction_id |
| tasks / agent_runs | ✅ | Token usage tracking, estimated_cost per call |
| merchant_rules | ✅ **NEW** | 80+ rules, self-learning from user edits |
| social_posts | ✅ | Template-based, auto-post to Facebook |
| gmail_tokens | ✅ | OAuth tokens for Gmail |

**Schema completion: 9/9 tables (100%)**

---

## Section 4: Dashboard Pages & Features

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (signup/login) | ✅ | |
| Dashboard overview | ✅ | Stripe sync on return from checkout |
| Complaints page | ✅ | Generate + history + letter modal + edit/regenerate + approve |
| Scanner page | ✅ | Deep scan (100 emails), progress panel, summary, smart action buttons |
| Subscriptions page | ✅ | Bank sync, multi-bank, categories, cancel methods, soft-delete |
| Deals page | ✅ | 8 categories, personalised "Recommended for you" per subscription |
| Profile page | ✅ | Stripe portal, pending cancellation notice, renewal date |
| Admin dashboard | ✅ **NEW** | Business metrics, MRR/ARR, member drill-down, API cost per user |
| AI chatbot | ✅ **NEW** | Tier-aware, every page, Haiku powered |

**Page completion: 9/9 pages (100%)**

---

## Section 5: Plan Gating & Business Logic

| Feature | Status | Notes |
|---------|--------|-------|
| Free tier limits | ✅ | 3 complaints/month, unlimited subscription tracking |
| Paid tier gating | ✅ | Middleware enforced on paid routes |
| Stripe checkout | ✅ | No trial, cancels old subs before new checkout |
| Stripe Customer Portal | ✅ | Cancel, switch plan, update payment |
| Subscription sync | ✅ | Webhook + /api/stripe/sync belt-and-suspenders |

**Business logic completion: 5/5 items (100%)**

---

## Section 6: Email System

| Email | Schedule | Status |
|-------|----------|--------|
| Waitlist welcome | Instant on signup | ✅ |
| Waitlist nurture (8 emails) | Days 0-28 | ✅ |
| Onboarding welcome | Instant on register | ✅ |
| Onboarding nurture (8 emails) | Days 0-28 | ✅ |
| Deal alert emails | Weekly Monday 9am | ✅ **NEW** |
| Renewal reminders | Daily 8am (30/14/7 days) | ✅ **NEW** |
| Launch announcement | Manual trigger | ✅ |
| Cancellation emails | On demand (AI generated) | ✅ |

**Email completion: 8/8 sequences (100%)**

---

## Section 7: Cron Jobs

| Time | Job | Status |
|------|-----|--------|
| 3am daily | Bank sync (all connections) | ✅ **NEW** |
| 8am daily | Renewal reminders | ✅ **NEW** |
| 9am daily | Waitlist nurture emails | ✅ |
| 9am Monday | Deal alert emails | ✅ **NEW** |
| 9am Monday | Social: generate + auto-post Facebook | ✅ |
| 10am daily | Onboarding nurture emails | ✅ |

**Cron completion: 6/6 jobs (100%)**

---

## Section 8: Intelligence & Self-Learning

| Feature | Status | Notes |
|---------|--------|-------|
| Merchant rules DB | ✅ **NEW** | 80+ UK providers seeded |
| Self-learning from edits | ✅ **NEW** | User edits create/update rules for all users |
| Auto-categorisation | ✅ | Keywords + merchant rules |
| Cancellation methods DB | ✅ | 50+ providers with email, phone, URL, tips |
| Per-user API cost tracking | ✅ **NEW** | Actual token counts from Claude responses |
| Personalised deal matching | ✅ **NEW** | Subscription → deal category mapping |

---

## Blocked on External Approvals

| Item | Status | Impact |
|------|--------|--------|
| Awin affiliate approval | ⏳ Pending | Deal links non-functional, no affiliate revenue |
| Google OAuth verification | ⏳ Pending | Gmail scanning limited to test users only |
| Meta app review | ⏳ Pending | Instagram auto-posting blocked |

---

## ACTION REQUIRED — Paul Manual Steps

1. **Awin merchant IDs** — When approved, replace `!!!REPLACE_WITH_AWIN_ID!!!` in `src/app/dashboard/deals/page.tsx`. Verify each merchant ID in Awin dashboard.

2. **Google OAuth** — Submit for verification when ready for public Gmail access.

3. **PostHog personal API key** — Store in Vercel as `POSTHOG_PERSONAL_API_KEY` (NOT in code — GitHub revokes it).

4. **paybacker.ai DNS** — Verify A record `76.76.21.21` is set at 123-reg.

---

## Not Started (Post-Launch)

| Feature | Priority | Notes |
|---------|----------|-------|
| Forms & Government Agent | Medium | HMRC, council tax, DVLA |
| Opportunity scoring system | High | Score users by switching likelihood, target with emails |
| Separate scanning modes | Medium | Subscription detection vs deal switching vs complaint |
| Loyalty rewards programme | Medium | Points system designed, not built |
| Spending intelligence dashboard | High | Tiered reporting designed, not built |
| Share Your Win viral feature | Low | |
| Family plans | Low | |
| Auto-cancel / auto-negotiate | Low | |
| AI email aliases | Medium | support@, billing@, etc. designed |
| Annual savings report PDF | Low | |
| Nightly email scan cron | Medium | Bank sync done, email scan not automated |

---

## Blueprint Completion by Section

| Section | Previous | Now |
|---------|----------|-----|
| AI Agents | 60% | 80% |
| Tech Stack | 82% | 92% |
| Database Schema | 71% | 100% |
| Dashboard Pages | 78% | 100% |
| Plan Gating / Business Logic | 80% | 100% |
| Email System | 30% | 100% |
| Cron Jobs | 20% | 100% |
| Intelligence & Self-Learning | 0% | 100% |
| Marketing & Growth | 50% | 65% |
| **OVERALL** | **~69%** | **~85%** |
