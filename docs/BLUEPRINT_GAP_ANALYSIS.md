# Blueprint Gap Analysis — Paybacker LTD
**Last updated:** 22 March 2026, 23:30

---

## Overall Completion: ~92%

---

## Core Product Features

| Feature | Status | Notes |
|---------|--------|-------|
| AI Complaint Letters | ✅ | Category-aware, debt disputes, edit/regenerate, history |
| AI Debt Response Letters | ✅ | Consumer Credit Act 1974, Limitation Act, harassment protection |
| HMRC & Government Letters | ✅ | 11 types: tax rebate, tax code, council tax, DVLA, NHS, parking, flights, refunds |
| Bank Scanning (TrueLayer) | ✅ | Production, multi-bank, NatWest tested, nightly auto-sync |
| Subscription Tracker | ✅ | Bank + manual, soft-delete, categories, 25 auto-categories |
| Cancellation Methods DB | ✅ | 50+ UK providers with email, phone, URL, tips |
| Smart Cancellation Letters | ✅ | Category-specific legal context per subscription type |
| Personalised Deal Finder | ✅ | 8 categories, shows "You pay X — switch to Y" |
| Spending Intelligence | ✅ | Monthly trends, income vs spend, 25 categories, tiered access |
| Email Scanner | ✅ BUILT | 100 emails, 150+ providers. Blocked: Google OAuth verification |
| AI Support Chatbot | ✅ | Tier-aware, sales mode for anonymous, Haiku powered |
| Loyalty Rewards | ✅ | Points system, 4 tiers, redemptions, auto-awarded |
| Referral System | ✅ | Unique codes, share links, point tracking, end-to-end |
| Opportunity Scoring | ✅ | Scores users by switching likelihood, feeds targeted emails |
| Self-Learning Merchant Rules | ✅ | 80+ seeded, learns from user edits |

## Email System

| Email | Status | Schedule |
|-------|--------|----------|
| Welcome (instant) | ✅ | On signup |
| Onboarding nurture (8 emails) | ✅ | Daily 10am |
| Waitlist nurture (8 emails) | ✅ | Daily 9am |
| Weekly deal digest | ✅ | Monday 9am |
| Targeted deal alerts | ✅ | Wed/Fri 9am |
| Renewal reminders | ✅ | Daily 8am |
| Email delivery monitor | ✅ | Daily 2pm |
| Launch announcement | ✅ | Manual trigger |

## Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| Next.js 15 | ✅ | |
| Supabase (EU-west-2) | ✅ | RLS on all tables |
| Claude API | ✅ | Sonnet for letters, Haiku for chatbot. Per-user cost tracking |
| Stripe (live) | ✅ | Full lifecycle, webhook at /api/webhooks/stripe |
| TrueLayer (production) | ✅ | Multi-bank, nightly sync |
| Resend (verified domain) | ✅ | SPF/DKIM/DMARC all verified |
| PostHog | ✅ | Server-side tracking, working |
| GA4 | ✅ | G-GRL9XKYTN1 |
| Vercel | ✅ | paybacker.co.uk + paybacker.ai redirect |
| SEO pages | ✅ | 103 company complaint pages |

## Tier Gating

| Rule | Status |
|------|--------|
| Free: 3 complaints/month | ✅ |
| Free: one-time bank scan | ✅ |
| Free: unlimited subscription tracking | ✅ |
| Essential: 1 bank, daily sync | ✅ |
| Essential: unlimited complaints | ✅ |
| Essential: full spending dashboard | ✅ |
| Pro: unlimited banks | ✅ |
| Pro: biggest transactions | ✅ |
| Chatbot: sales mode for anonymous | ✅ |
| Chatbot: tier-aware for logged in | ✅ |

## Admin & Operations

| Feature | Status |
|---------|--------|
| Admin dashboard (metrics + members) | ✅ |
| Per-user API cost tracking | ✅ |
| Opportunity score per member | ✅ |
| Social post automation | ✅ |
| Marketing plan | ✅ |

---

## Blocked on External Approvals

| Item | Impact | Workaround |
|------|--------|------------|
| Awin affiliate approval | Deal links non-functional | Deals page works, links go to provider directly |
| Google OAuth verification | Gmail scanning limited to test users | Bank scanning works for all users |
| Meta app review | Instagram auto-posting blocked | Manual Instagram posting |

---

## What's NOT Done (Post-Launch / Future)

| Feature | Priority | Notes |
|---------|----------|-------|
| Spending cross-user comparisons | Medium | Needs 20+ users with bank data |
| Separate scanning modes | Low | UX improvement, not critical |
| AI email aliases (support@, billing@) | Medium | Designed, not built |
| Annual savings report PDF | Low | |
| Share Your Win viral feature | Low | |
| Family plans | Low | |
| Auto-cancel on user's behalf | Low | Pro feature, complex |
| Spending anomaly alerts | Low | Pro feature |
| Awin postback endpoint | Medium | Needs Awin approval first |
| Re-engagement emails | Medium | "You haven't logged in" |
| Monthly newsletter | Medium | Consumer rights tips |

---

## Pre-Launch Checklist

| Item | Status |
|------|--------|
| Waitlist mode disabled | ✅ |
| Homepage shows all features | ✅ |
| Pricing page correct tiers | ✅ |
| Stripe payments working | ✅ |
| Bank scanning working | ✅ |
| Complaint letters working | ✅ Needs ANTHROPIC_API_KEY verified in Vercel |
| Government forms working | ✅ Needs ANTHROPIC_API_KEY verified in Vercel |
| Welcome emails sending | ✅ |
| Admin dashboard working | ✅ |
| SEO pages live | ✅ (103 pages) |
| PostHog tracking | ✅ |
| GA4 tracking | ✅ |
| Privacy policy | ✅ |
| Terms of service | ✅ |
| Data security section on homepage | ✅ |
| paybacker.ai redirect | ✅ (pending DNS propagation) |
| Chatbot restricted for anonymous | ✅ |

## ACTION REQUIRED — Paul

1. **Verify ANTHROPIC_API_KEY** is set in Vercel production — needed for complaint/form generation
2. **Awin** — chase approval, then update `!!!REPLACE_WITH_AWIN_ID!!!` in deals page
3. **Google OAuth** — submit for verification when ready
4. **paybacker.ai** — verify DNS A record `76.76.21.21` is set at 123-reg
5. **Test complaint generation** — generate a real complaint letter to verify Claude API works
6. **Test government form** — generate an HMRC letter to verify
