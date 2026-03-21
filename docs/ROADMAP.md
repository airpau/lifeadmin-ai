# Paybacker — Product Roadmap
*Updated: March 2026*

For financial projections see `REVENUE_MODEL.md`. For launch blockers see `LAUNCH_REQUIREMENTS.md`.

---

## Phase 1 — Launch (Weeks 1–6)

Hard blockers. Nothing ships until all four are done.

| Feature | Status |
|---------|--------|
| Open Banking (TrueLayer) | Not started |
| Stripe — Customer Portal + plan-gating | Partial |
| Affiliate Deals Tab (Awin) | Not started |
| Subscription Tracker v2 (bank + email unified) | Partial |

---

## Phase 2 — Retention & Expansion (Months 3–6 Post-Launch)

### Loyalty Rewards Programme

Tier system that rewards usage and creates switching cost. Points accrue on every money-saving action.

**Tiers:**

| Tier | Tenure | Points Multiplier | Perks |
|------|--------|------------------|-------|
| Bronze | 0–6 months | 1× | Standard features, email support |
| Silver | 6–12 months | 1.05× | Priority support, monthly savings PDF |
| Gold | 12–24 months | 1.1× | 1 free Pro month/year, partner discounts, quarterly webinars |
| Platinum | 24+ months | 1.15× | Dedicated account manager, annual review call, beta access, top-tier partner discounts |

**Points mechanics:**
- £1 saved via complaint = 1 point
- Subscription cancelled = 10 points
- Deal switched via affiliate link = 25 points
- 500 points = £5 off next month's subscription (Stripe coupon auto-applied)

**Implementation:**
- `user_points` table: user_id, balance, lifetime_earned, tier
- Points events logged on: complaint_sent, subscription_cancelled, affiliate_click_converted
- Tier computed from `profiles.created_at`, cached in session
- Points balance shown in dashboard sidebar

---

### Financial Tools

**Annual Money-Saved Report (PDF)**
- Auto-generated each April (UK tax year)
- Total saved via complaints, cancellations, switches
- Paybacker-branded PDF, downloadable and shareable
- Shareable card: "I saved £847 last year with Paybacker" → viral social hook
- Available: Essential + Pro

**Spending Insights Dashboard**
- Monthly subscription spend trend (line chart)
- Category breakdown: entertainment, utilities, fitness, software, etc.
- MoM change alerts ("Your entertainment spend is up 23%")
- Powered by Open Banking transaction data
- Available: Pro

**Tax-Year Summary (Self-Employed)**
- Flag subscriptions as business vs personal
- Estimated tax-deductible spend
- CSV export for accountants
- Available: Pro

---

### Exclusive Partnerships

Target partners for preferential rates and referral revenue:

| Partner | Offer for Paybacker users | Revenue model |
|---------|--------------------------|---------------|
| Octopus Energy | Priority switching queue, exclusive rate | CPA per switch |
| Simply Business | Paybacker-exclusive insurance rate | Revenue share |
| Monzo / Starling | 3 months free Pro for new bank signups | Referral fee |
| Tide Business | Discounted Essential for SME customers | Referral fee |

---

### Family Plans

**Tiers:**
- Household Essential: £14.99/mo (up to 3 users)
- Household Pro: £24.99/mo (up to 5 users)

**Features:**
- Single billing admin, sub-profiles per family member
- Shared subscription tracker (full household spend view)
- Pooled complaint limits across members
- Individual privacy options (members can hide personal subscriptions)

**Why it matters:** 2× ARPU vs individual Essential with a lower per-head price. Harder to cancel than individual plans — household admin friction reduces churn.

---

### Smart Deal Timing Alerts

- Track renewal dates on all subscriptions (from bank feed + email)
- Push notifications / email alerts at 30, 14, and 7 days before renewal
- "Your Sky broadband renews in 14 days — here are 3 better deals"
- Link directly to Deals tab for one-click comparison
- Pro tier: auto-draft cancellation letter if no action taken by day 7

---

## Phase 3 — Automation & Scale (Months 6–12 Post-Launch)

### ⭐ AUTO-CANCEL Unused Subscriptions [HIGH PRIORITY]

**Why high priority:** Single biggest user value feature. Major retention driver — users who see Paybacker save them money automatically will not churn. Differentiates from all manual competitors.

**Flow:**
1. AI identifies subscriptions with no usage signals (no emails, no login activity) for 60+ days
2. Sends in-app + email alert: "We've detected you may not be using [Netflix]. Want us to cancel it?"
3. User has 24-hour approval window (can dismiss/snooze)
4. On approval: Paybacker drafts and sends cancellation email from user's account (via Gmail OAuth)
5. Logs outcome in subscription tracker, awards points
6. Follow-up: checks 30 days later if cancellation confirmed

**Safeguards:**
- Always requires explicit user approval — never auto-cancels without confirmation
- Shows estimated annual saving before user approves
- Logs full audit trail (who approved, when, what was sent)
- Available: Pro only

**Implementation:**
- New cron: daily scan of subscriptions vs usage signals
- Usage signals: Gmail login activity, subscription emails received in last 60 days
- `auto_cancel_queue` table: sub_id, detected_at, alerted_at, approved_at, sent_at, outcome
- Reuse existing cancellation email flow from `/api/subscriptions/cancellation-email`

---

### Auto-Negotiate Renewals

- AI monitors upcoming renewal dates
- Drafts retention/negotiation letter: "I'm considering cancelling unless you can offer a better rate"
- Proven effective for: Sky, Virgin Media, BT, insurance providers
- User reviews and approves before sending
- Available: Pro

---

### Price-Drop Alerts

- Monitor deals tab for price improvements vs current subscriptions
- "Broadband prices have dropped — you could save £12/mo by switching to Vodafone"
- Triggered by: affiliate partner price updates, user's renewal approaching
- Available: Essential + Pro

---

### Auto-Submit Meter Readings

- Parse energy bills from Gmail for meter details
- Remind user to submit readings at month end
- Draft submission to energy provider (email or web form)
- Available: Pro

---

### AI Support Chatbot

- Floating widget on all pages (bottom-right)
- Knowledge base: FAQ, pricing, features, UK consumer law basics, privacy/terms
- Claude-powered, streaming responses
- Escalation path: "Would you like me to email our support team?"
- Reduces support load, increases conversion on pricing page
- Implementation: React widget + `/api/chat` streaming endpoint

---

### Email Management System

AI email aliases for solo operation at scale:

| Alias | Handling |
|-------|---------|
| support@paybacker.co.uk | AI resolves 80%+, escalates complex cases |
| complaints@paybacker.co.uk | Auto-routes to complaint system |
| billing@paybacker.co.uk | AI resolves billing queries |
| partners@paybacker.co.uk | Hold for human review |

**Escalation triggers:** contains 'lawyer', 'sue', 'ICO', 'refund demand'; confidence < 80%; high-value partner or press.

**Implementation:** Google Workspace forwarding → `/api/email/inbound` webhook → Claude categorisation + response → Resend for outbound.

---

## Feature Priority Matrix

| Feature | Phase | User Value | Revenue Impact | Complexity |
|---------|-------|-----------|----------------|------------|
| Open Banking | 1 | ★★★★★ | ★★★★★ | ★★★★ |
| Stripe Customer Portal | 1 | ★★★★ | ★★★★★ | ★★ |
| Affiliate Deals Tab | 1 | ★★★★ | ★★★★★ | ★★★ |
| Subscription Tracker v2 | 1 | ★★★★★ | ★★★★ | ★★★ |
| **AUTO-CANCEL** | **2** | **★★★★★** | **★★★★★** | **★★★★** |
| Smart Deal Timing Alerts | 2 | ★★★★ | ★★★★ | ★★ |
| Loyalty Rewards | 2 | ★★★ | ★★★★ | ★★★ |
| Family Plans | 2 | ★★★★ | ★★★★★ | ★★★★ |
| Annual Savings Report PDF | 2 | ★★★★ | ★★★ | ★★ |
| Auto-Negotiate Renewals | 3 | ★★★★★ | ★★★ | ★★★★ |
| AI Support Chatbot | 3 | ★★★ | ★★★ | ★★★ |
| Price-Drop Alerts | 3 | ★★★★ | ★★★ | ★★ |
| Tax Summary (self-employed) | 3 | ★★★ | ★★ | ★★★ |
| Email Management System | 3 | ★★ | ★★ | ★★★★★ |
