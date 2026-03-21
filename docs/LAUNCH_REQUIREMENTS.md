# Paybacker — Revised Launch Requirements
*Updated: March 2026*

## Hard Launch Blockers (Phase 1)

These four features must be fully working before any public launch. Everything else moves to Phase 2.

---

### 1. Open Banking / Bank Feeds

**Why it's a blocker:** Email scanning misses ~60% of subscriptions (app-store billing, direct debits, card-on-file). Bank transactions are the ground truth. Without this, the subscription tracker and opportunity scanner are unreliable.

**What must work:**
- TrueLayer or Plaid OAuth connection flow
- Read 12 months of transaction history
- Auto-categorise recurring payments (subscriptions, standing orders, direct debits)
- Surface in Subscription Tracker and Financial Overview
- Re-consent / token refresh handled automatically

**Preferred provider:** TrueLayer (EU/UK-focused, FCA-regulated, covers 99% of UK banks)

**Dependencies:**
- FCA registration or exemption (TrueLayer acts as the regulated entity — we use their API, no FCA reg needed)
- TrueLayer sandbox → production sign-off (2–4 weeks)
- Supabase: `bank_connections`, `bank_transactions` tables

---

### 2. Stripe Payments (Fully Working)

**Why it's a blocker:** The business model requires subscription revenue. Broken payments = zero MRR.

**What must work:**
- Checkout flow (monthly + annual for Essential and Pro)
- Successful webhook handling (checkout.session.completed, customer.subscription.*)
- Plan upgrades and downgrades
- Stripe Customer Portal (self-service: cancel, change plan, update card)
- Plan-gating middleware (free users can't access paid features)
- Failed payment handling (dunning emails or Stripe retry logic)

**Current status:**
- Checkout flow: built ✓
- Webhook tier mapping: fixed ✓ (explicit price ID lookup table)
- Customer Portal: NOT built ✗
- Plan-gating middleware: NOT built ✗
- Price IDs: need replacing with production values ✗

---

### 3. Affiliate Deal Comparison (Deals Tab)

**Why it's a blocker:** Affiliate revenue is projected to match or exceed subscription revenue at scale. It's also the "Find Better Deals" feature that completes the core value proposition.

**What must work:**
- Dedicated Deals tab in dashboard
- Categories: Energy, Broadband, Insurance, Mobile
- Affiliate links integrated via Awin network
- Link tracking (click → affiliate ID → provider)
- Conversion tracking (switches logged in DB)
- Revenue reporting for internal use

**Affiliate partners to integrate (Awin):**
| Category | Providers |
|----------|-----------|
| Energy | Octopus Energy, Ovo, E.ON, British Gas |
| Broadband | BT, Sky, Virgin Media, Vodafone |
| Insurance | Compare the Market, MoneySuperMarket, GoCompare |
| Mobile | iD Mobile, Smarty, Lebara |

**Implementation:**
- Static comparison cards with affiliate deep-links (Phase 1)
- Dynamic pricing via APIs (Phase 2 — most require commercial agreements)

---

### 4. Subscription Tracker (Fully Functional)

**Why it's a blocker:** This is the primary daily-use feature. Users need to see all their subscriptions in one place. Without bank feeds, it's too incomplete to be credible.

**What must work:**
- Unified view: bank feed transactions + email-detected subscriptions
- Total monthly spend prominently displayed
- Per-subscription: name, amount, frequency, next billing date, category
- Flag unused/duplicate subscriptions (AI analysis)
- Cancellation methods per provider: email template, cancel portal URL, phone number
- Edit, mark cancelled, add manually
- Confidence score on auto-detected subscriptions (filter out false positives)

**Current status:**
- Basic tracker: built ✓
- Manual add/edit: built ✓
- Email scanning: built ✓ (improved dual-query system)
- Bank feed integration: NOT built ✗
- Cancellation method database: NOT built ✗
- Unused/duplicate detection: partial ✗

---

## Phase 2 Features (Post-Launch)

Move these out of Phase 1 scope:

| Feature | Why deferred |
|---------|-------------|
| Gmail OAuth publication (Google review) | Can soft-launch without; use manual connection |
| Forms & Government Agent (HMRC, DVLA) | Complex, lower volume |
| Savings Agent / tariff negotiation | Requires partner agreements |
| Loyalty rewards programme | Retention play, not acquisition |
| Family plans | Requires multi-user auth |
| Tax-year summary (self-employed) | Niche segment |
| Open Banking write access (payment initiation) | Regulatory complexity |
| Share Your Win viral feature | Nice-to-have |
| Advanced automation (auto-cancel, auto-negotiate) | Trust/legal risk at launch |

---

## Launch Readiness Checklist

### Open Banking
- [ ] TrueLayer sandbox account created
- [ ] OAuth connection flow built
- [ ] Transaction sync working
- [ ] Subscription detection from transactions
- [ ] Production credentials approved
- [ ] `bank_connections` + `bank_transactions` tables in Supabase

### Stripe
- [ ] Production price IDs set in env
- [ ] Checkout working end-to-end
- [ ] All webhook events handled
- [ ] Customer Portal configured and linked
- [ ] Plan-gating middleware on all paid routes
- [ ] Stripe CLI tested locally

### Affiliate Deals
- [ ] Awin account approved
- [ ] Affiliate IDs for each provider category
- [ ] Deals tab in dashboard
- [ ] Click tracking logged to DB
- [ ] Links tested for correct attribution

### Subscription Tracker
- [ ] Bank feed transactions merged with email detections
- [ ] Monthly total calculated correctly
- [ ] Cancellation method DB seeded for top 50 providers
- [ ] Unused detection algorithm reviewed
- [ ] Edit/delete/mark-cancelled all working

### Infrastructure
- [ ] Vercel production deployment
- [ ] Custom domain (paybacker.co.uk) live
- [ ] Resend domain verified and sending
- [ ] All env vars set in Vercel production
- [ ] Error monitoring (Sentry or similar)
- [ ] CRON jobs running (waitlist + onboarding emails)

---

## Revised Timeline Estimate

| Week | Milestone |
|------|-----------|
| 1–2 | TrueLayer integration + bank transaction sync |
| 2–3 | Subscription Tracker v2 (bank + email unified) |
| 3 | Stripe Customer Portal + plan-gating middleware |
| 4 | Affiliate Deals tab (Awin, static comparison cards) |
| 4 | End-to-end testing across all 4 blockers |
| 5 | Soft launch to waitlist (closed beta) |
| 6 | Public launch |
