# Paybacker — Revenue Model & Business Analysis
*Updated: March 2026*

---

## Assumptions

| Variable | Value |
|----------|-------|
| Free tier | 60% of users |
| Essential (£9.99/mo) | 30% of users |
| Pro (£19.99/mo) | 10% of users |
| Monthly churn | 5% |
| Affiliate conversion | 5% of users switch 1 product/year |
| Avg affiliate commission | £30/switch |

### Subscription MRR Formula
```
MRR = (users × 0.30 × £9.99) + (users × 0.10 × £19.99)
```

### Affiliate Revenue Formula (monthly)
```
Affiliate = (users × 0.05 × £30) / 12
```

---

## 1. Revenue Projections by User Scale

### 1,000 Users

| Stream | Monthly | Annual |
|--------|---------|--------|
| Essential subs (300 × £9.99) | £2,997 | £35,964 |
| Pro subs (100 × £19.99) | £1,999 | £23,988 |
| Affiliate (1,000 × 5% × £30 / 12) | £125 | £1,500 |
| **Total** | **£5,121** | **£61,452** |

ARR: **~£61K**

---

### 5,000 Users

| Stream | Monthly | Annual |
|--------|---------|--------|
| Essential subs (1,500 × £9.99) | £14,985 | £179,820 |
| Pro subs (500 × £19.99) | £9,995 | £119,940 |
| Affiliate (5,000 × 5% × £30 / 12) | £625 | £7,500 |
| **Total** | **£25,605** | **£307,260** |

ARR: **~£307K**

---

### 10,000 Users

| Stream | Monthly | Annual |
|--------|---------|--------|
| Essential subs (3,000 × £9.99) | £29,970 | £359,640 |
| Pro subs (1,000 × £19.99) | £19,990 | £239,880 |
| Affiliate (10,000 × 5% × £30 / 12) | £1,250 | £15,000 |
| **Total** | **£51,210** | **£614,520** |

ARR: **~£615K**

---

### 50,000 Users

| Stream | Monthly | Annual |
|--------|---------|--------|
| Essential subs (15,000 × £9.99) | £149,850 | £1,798,200 |
| Pro subs (5,000 × £19.99) | £99,950 | £1,199,400 |
| Affiliate (50,000 × 5% × £30 / 12) | £6,250 | £75,000 |
| **Total** | **£256,050** | **£3,072,600** |

ARR: **~£3.07M**

---

### 100,000 Users

| Stream | Monthly | Annual |
|--------|---------|--------|
| Essential subs (30,000 × £9.99) | £299,700 | £3,596,400 |
| Pro subs (10,000 × £19.99) | £199,900 | £2,398,800 |
| Affiliate (100,000 × 5% × £30 / 12) | £12,500 | £150,000 |
| **Total** | **£512,100** | **£6,145,200** |

ARR: **~£6.15M**

---

## 2. Year 1 / Year 2 / Year 3 Growth Projections

Assumes growth trajectory: 0 → 1K → 5K → 15K users

### Conservative Path (slow organic growth)

| Period | Users (EoP) | Monthly Revenue | Annual Revenue |
|--------|-------------|-----------------|----------------|
| Year 1 Q1 | 500 | £2,561 | — |
| Year 1 Q2 | 1,500 | £7,682 | — |
| Year 1 Q3 | 3,000 | £15,363 | — |
| Year 1 Q4 | 5,000 | £25,605 | — |
| **Year 1 Total** | **5,000** | — | **~£153K** |
| Year 2 | 15,000 | £76,815 | **~£615K** |
| Year 3 | 40,000 | £204,840 | **~£2.1M** |

### Aggressive Path (paid acquisition + viral)

| Period | Users (EoP) | Monthly Revenue | Annual Revenue |
|--------|-------------|-----------------|----------------|
| Year 1 Q1 | 2,000 | £10,242 | — |
| Year 1 Q2 | 6,000 | £30,726 | — |
| Year 1 Q3 | 15,000 | £76,815 | — |
| Year 1 Q4 | 30,000 | £153,630 | — |
| **Year 1 Total** | **30,000** | — | **~£823K** |
| Year 2 | 80,000 | £409,680 | **~£3.9M** |
| Year 3 | 150,000 | £768,150 | **~£7.5M** |

**Note on churn:** At 5%/month, annual retention is ~54%. Revenue projections assume churn is offset by new user acquisition. Reducing churn to 2–3%/month via loyalty features would increase Year 3 ARR by 30–40%.

---

## 3. Affiliate Revenue Upside (Underestimated Above)

The £30/switch average is conservative. Real commissions vary significantly:

| Category | Avg Commission | Annual switches at 100K users |
|----------|---------------|-------------------------------|
| Energy switching | £40–£80 | 5,000 × £60 avg = £300K |
| Broadband | £30–£60 | 3,000 × £45 avg = £135K |
| Home insurance | £20–£50 | 2,000 × £35 avg = £70K |
| Car insurance | £30–£60 | 2,000 × £45 avg = £90K |
| Mobile | £15–£40 | 1,000 × £25 avg = £25K |
| **Total at 100K users** | | **~£620K/year** |

This is ~4× higher than the conservative model. At scale, affiliate revenue could represent 8–10% of total revenue — a meaningful secondary stream with zero marginal cost.

---

## 4. Paid Plan Enhancements

### A. Loyalty Rewards Programme

**Mechanics:**
- 1 point per £1 saved (via complaints, cancellations, switching)
- 2x points for switching via affiliate links
- 500 points = £5 off next month's subscription

**Business case:** Reduces churn by making points balance a switching cost. Users with 200+ points have measurably lower churn than those without (see LoyaltyLion data across SaaS products).

**Implementation:**
- `user_points` table: user_id, points_balance, lifetime_earned
- Points events logged on: complaint sent, subscription cancelled, deal clicked/converted
- Redemption at billing: Stripe coupon applied automatically
- Show points balance prominently in dashboard sidebar

---

### B. Financial Tools

**Annual Money-Saved Report (PDF)**
- Auto-generated each April (tax year)
- Total saved via complaints, cancellations, switches
- Formatted as PDF with Paybacker branding
- Shareable on social (viral hook: "I saved £847 last year")

**Spending Insights Dashboard**
- Monthly subscription spend trend (chart)
- Category breakdown (entertainment, utilities, fitness, etc.)
- MoM change alerts ("your entertainment spend is up 23%")
- Powered by bank transaction data (Open Banking)

**Tax-Year Summary (Self-Employed)**
- Separate business vs personal subscriptions
- Export as CSV for accountants
- Estimated tax-deductible spend

---

### C. Exclusive Partnerships

Target partners for preferential rates:

| Partner | Offer | Revenue model |
|---------|-------|---------------|
| Monzo / Starling | 3-month free Pro for new bank customers | Referral fee |
| Tide Business | Discounted Essential for SME customers | Referral |
| Octopus Energy | Paybacker users get priority switching queue | CPA |
| Simply Business insurance | Paybacker-exclusive rate | Revenue share |

---

### D. Family Plans

**Structure:**
- Household Essential: £14.99/mo (up to 3 users)
- Household Pro: £24.99/mo (up to 5 users)

**Features:**
- Single dashboard with sub-profiles per family member
- Shared subscription tracker (see whole household spend)
- Per-member complaint limits pooled
- One billing admin

**Business case:** 2× ARPU vs individual Essential at a lower price per head — compelling for couples and families. Reduces per-user churn (harder to cancel a family plan).

---

### E. Advanced Automation (Pro/Pro+ tier)

Features that justify a higher price point:

| Feature | Complexity | Impact |
|---------|-----------|--------|
| Auto-cancel unused subscriptions (with 24h approval window) | High | High churn reduction |
| Auto-negotiate renewal prices (AI draft → you approve) | Medium | Differentiator |
| Price-drop alerts (notify when better deal detected) | Low | Engagement |
| Auto-submit meter readings | Medium | Utility-specific |
| Renewal reminders (30/14/7 days before) | Low | Easy win |

---

## 5. Tier System — Bank-Style Loyalty Benefits

Tenure-based tiers encourage long-term retention.

### Bronze (0–6 months)
- Standard feature access per plan
- Email support (48h response)
- Monthly savings digest email

### Silver (6–12 months)
- +5% points multiplier on all savings events
- Priority email support (24h)
- Monthly savings PDF report
- Early access to beta features

### Gold (12–24 months)
- +10% points multiplier
- 1 free Pro month per year (auto-applied in month 13)
- Exclusive partner discounts (Octopus, Simply Business, etc.)
- Quarterly webinars: "How to fight back against your energy company"
- Priority support queue

### Platinum (24+ months)
- +15% points multiplier
- Dedicated account manager (email/chat)
- Annual review call (30 min)
- First access to all new features
- Highest-tier partner discounts
- Paybacker community access (Slack/Discord)

**Implementation:** `user_tenure_tier` computed column in profiles (based on `created_at`). Tier checked at login and stored in session. Stripe coupons auto-applied for Gold free month.

---

## 6. UK Market Size

| Metric | Value | Source |
|--------|-------|--------|
| UK adults | ~54 million | ONS 2024 |
| UK adults with ≥1 subscription | ~45 million | Ofcom / Barclaycard |
| Who feel they overpay for utilities | ~60% | Citizens Advice 2024 |
| Who have tried to cancel a sub and failed | ~40% | Which? 2023 |
| Total Addressable Market (TAM) | ~45M people | |
| Serviceable Addressable Market (SAM) | ~15M | Tech-savvy, 25–55, urban |
| Serviceable Obtainable Market (SOM) 3yr | ~150K | Top of aggressive path |

### Market Penetration at Each Scale

| Users | % of SAM | % of TAM |
|-------|----------|----------|
| 1,000 | 0.007% | 0.002% |
| 5,000 | 0.033% | 0.011% |
| 10,000 | 0.067% | 0.022% |
| 50,000 | 0.33% | 0.11% |
| 100,000 | 0.67% | 0.22% |
| 500,000 | 3.3% | 1.1% |

Even at 100K users, penetration is under 1% of SAM. The ceiling is enormous — the constraint is acquisition cost, not market size.

---

## 7. Key Unit Economics

| Metric | Value |
|--------|-------|
| Avg revenue per paying user (blended Essential + Pro) | £12.33/mo |
| Avg revenue per all users (incl free tier) | £4.93/mo |
| Monthly churn (assumed) | 5% |
| Customer lifetime (1/churn) | 20 months |
| LTV (blended paying users) | £246 |
| Target CAC (to be profitable) | <£82 (LTV/3 rule) |
| Payback period at £30 CAC | ~6 months |

### CAC Channels to Target

| Channel | Estimated CAC | Quality |
|---------|--------------|---------|
| SEO (bill dispute / subscription cancel guides) | £5–£15 | High intent |
| Reddit / forums (organic) | £0 | High trust |
| Referral programme | £10–£20 | High quality |
| Google Ads (money-saving intent) | £25–£60 | Medium |
| Facebook/Instagram retargeting | £15–£40 | Medium |
| Price comparison site listings | £0–revenue share | Very high intent |

---

## 8. Priority Recommendations

### Immediate (before launch)
1. **Add Open Banking** — this is the single biggest quality improvement; email-only is not credible
2. **Fix Stripe Customer Portal** — self-serve is essential, support tickets for cancellations don't scale
3. **Build Deals tab** — affiliate revenue from launch, even with static links

### 3 months post-launch
4. **Launch referral programme** — lowest CAC channel, creates viral loop
5. **Annual Savings Report PDF** — shareable, creates social proof
6. **Silver tier** — reward users who hit 6 months, reduce churn cliff

### 6 months post-launch
7. **Family plans** — ARPU expansion without new user acquisition
8. **Loyalty points** — build switching cost moat
9. **Auto-cancel (Pro)** — biggest differentiator vs manual competitors

### 12 months post-launch
10. **Platinum/dedicated account manager** — retain high-value users, gather product feedback
11. **Partner deals (Monzo, Octopus)** — B2B2C distribution channel
12. **Open Banking write access** — payment initiation for direct switching
