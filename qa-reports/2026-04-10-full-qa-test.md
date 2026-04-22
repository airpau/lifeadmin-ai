# Paybacker QA Test Report — 10 April 2026

**Account:** Paul Airey (Pro Plan)  
**Tester:** Cowork Scheduled Task  
**Pages tested:** 9 (Overview, Money Hub, Subscriptions, Disputes, Deals, Contract Vault, Rewards, Profile, Pocket Agent)  
**Console errors:** None detected  

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| Medium | 3 |
| Low | 3 |

**Overall:** 7 pages PASS, 1 PASS WITH ISSUES, 1 CRITICAL BUG

---

## Critical Bugs

### 1. Subscriptions list only renders 2 of 45 items
**Page:** /dashboard/subscriptions  
**Expected:** All 45 tracked subscriptions (or at least 30 active) should appear in the list  
**Actual:** Only Paratus AMC (Mortgage) and HMRC are rendered. The rest of the list is blank.  
**Impact:** Users cannot see or manage most of their subscriptions  

### 2. Subscription category filters non-functional
**Page:** /dashboard/subscriptions  
**Expected:** Clicking Energy, Broadband, Entertainment etc. should filter the subscription list  
**Actual:** Clicking filter tabs has no effect — "All" remains highlighted and list doesn't change  
**Impact:** Users cannot filter subscriptions by category  

### 3. Mobile layout not responsive
**Page:** All dashboard pages  
**Expected:** Sidebar should collapse into a hamburger menu at mobile widths (375px)  
**Actual:** Sidebar remains fully visible, overlapping content area  
**Impact:** Dashboard is unusable on mobile devices  

---

## Medium Bugs

### 4. Money Hub spending category drill-down broken
**Page:** /dashboard/money-hub  
**Expected:** Clicking a spending category row should show transaction details (text says "Click row for details")  
**Actual:** Nothing happens when clicking category rows  

### 5. Dispute count inconsistency across pages
- Overview: 11 disputes
- Disputes page: 10 Active + 0 Resolved
- Profile: 9 Active disputes

### 6. Deals empty category tabs
**Page:** /dashboard/deals  
Mobile, Insurance, Travel, Water tabs exist but show no content and no empty-state message  

---

## Low Bugs

### 7. Lowercase "transfer" category in Money Hub
All other spending categories are capitalised (Bills, Mortgage, Software, Loans, Energy, Other) but "transfer" is lowercase.

### 8. Dispute letter placeholders not auto-filled
Letter shows YOUR NAME, YOUR ADDRESS, YOUR TOWN etc. instead of pulling from user profile (Paul Airey, 18 Devenish Road, Winchester, SO22 6EX).

### 9. Dashboard deals data race condition
First load shows £0.00/yr from 0 deals. Subsequent load shows £1,380.00/yr from 9 deals. Suggests deals data loads asynchronously and isn't ready on first render.

---

## Page-by-Page Results

### Overview — PASS
- Total Opportunities: £1,542.72/yr
- Price Increase Alerts: 3 (Bank of Scotland +10.8%)
- Better Deals Found: £1,380.00/yr savings from 9 subscriptions
- All summary cards render correctly

### Money Hub — PASS WITH ISSUES
- Income: £3,597.96 | Spent: £3,501.54 | Savings Rate: 2.7% | Health Score: 32
- Monthly Trends chart renders with working hover tooltips (verified: In £29,490.69, Out £22,513.55, Net £6,977.14)
- Spending breakdown totals match (£3,501.54)
- Energy budget correctly flagged over-budget (£162.29/£100, red)
- Savings goal: Travel £200/£1,000 with progress bar
- Missing: separate Expected Bills, Net Worth, Regular Payments sections

### Subscriptions — CRITICAL BUG
- Summary cards accurate: £1,013.75/mo Subs, £7,572.86/mo Mortgages, £469.79/mo Council Tax, £9,056.40/mo Total
- Cancellation Email panel works (showed Creation Finance cancellation instructions)
- Category filters: 8 categories available but non-functional
- Only 2 of 45 items render in list

### Disputes — PASS
- 10 active disputes with statuses: Open, Won, Waiting for reply
- E.ON detail page: excellent progress tracker, company info, escalation to Energy Ombudsman
- Legal references: Consumer Protection from Unfair Trading Regs 2008 (Reg 5 & 6), Harassment Act 1997, Gas Act 1986 + 4 more
- Confidence score: "Good case (78%)"
- Write next letter / Add update actions present

### Deals — PASS
- Energy: British Gas £117.46/mo with 7 alternatives (best: Octopus £95/mo, save £270/yr)
- Broadband: 6 providers (best: Virgin Media M125 £17.99/mo, save £460/yr)
- All cards show "Verified this week" badges
- No Patreon miscategorisation found

### Contract Vault — PASS
- Empty state with upload CTA renders correctly

### Rewards — PASS
- Bronze tier, 10 points, 4/19 badges earned
- Tier progress: 2% to Silver (need 490 points + 3 months)
- 5 redemption options displayed with points-needed calculations
- Badges: Bill Fighter, Serial Complainer, Subscription Slayer, Money Detective

### Profile — PASS
- Personal details: Paul Airey, 07918188396, 18 Devenish Road Winchester, SO22 6EX
- Plan: Pro — Active with Manage Billing
- Connected emails: aireypaul1988@outlook.com, aireypaul@googlemail.com
- Stats: 11 letters written

### Pocket Agent — PASS
- Telegram connected: @paishop since 02 Apr 2026
- Last message: 09 Apr 2026
- Feature cards: Proactive alerts, Real-time queries, Complaint letters

---

## Cross-Cutting

| Test | Result |
|------|--------|
| All sidebar navigation links | PASS |
| Console errors | PASS (none) |
| Mobile responsiveness (375px) | FAIL |
| Footer links | PASS |
| Auth (logged in state) | PASS |
| Chatbot widget | PASS (visible on all pages) |
