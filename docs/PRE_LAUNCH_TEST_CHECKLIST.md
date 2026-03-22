# Pre-Launch Test Checklist
*Updated: 22 March 2026*

## Critical Path Tests (Must Pass Before Launch)

### 1. User Registration + Login
- [ ] Sign up with new email
- [ ] Email verification works (or instant login)
- [ ] Login with password works
- [ ] Login with magic link works
- [ ] Redirect to dashboard after login

### 2. Referral System
- [ ] Go to /dashboard/rewards → copy referral link
- [ ] Open referral link in incognito: paybacker.co.uk?ref=PB-XXXXX
- [ ] Sign up as new user in incognito
- [ ] Check: referrer gets 100 points in rewards page
- [ ] New user: check profiles.referred_by is set
- [ ] New user subscribes → referrer gets 200 bonus points

### 3. Bank Connection + Sync
- [ ] Click "Connect Bank Account" → TrueLayer loads
- [ ] Select bank, authenticate
- [ ] Redirects back with "Bank connected" toast
- [ ] Bank name shows on connection card
- [ ] Click "Sync Now" → transactions sync
- [ ] Recurring subscriptions detected and appear in list
- [ ] Categories auto-assigned (mortgage, loan, utility, etc.)

### 4. Subscription Management
- [ ] Delete a subscription (X button)
- [ ] Reload page → deleted subscription stays gone
- [ ] Click "Sync Now" → deleted subscription does NOT return
- [ ] Edit a subscription → changes save
- [ ] Edit triggers merchant rule learning

### 5. Complaint Letter Generation
- [ ] Fill in company name, issue, desired outcome
- [ ] Generate letter → letter appears with legal references
- [ ] Legal references correct for category (not Consumer Contracts for everything)
- [ ] Approve button works
- [ ] History tab shows past complaints
- [ ] Click history item → modal opens with full letter

### 6. Debt Recovery Letter
- [ ] Company: any debt chaser (e.g. "Energy Fitness")
- [ ] Issue: paste debt recovery email content
- [ ] Outcome: "Stop chasing / prove the debt"
- [ ] Letter references: Consumer Credit Act 1974, Limitation Act, Protection from Harassment
- [ ] NOT Consumer Contracts Regulations 2013

### 7. Cancellation Emails
- [ ] Click on a subscription → cancellation info panel shows
- [ ] Known provider shows: email, phone, URL, tips
- [ ] Generate cancellation email → correct legal context for category
- [ ] "Request changes" → edit feedback → regenerate works
- [ ] "Saved to complaint history" message shows

### 8. Deals Page
- [ ] "Recommended for you" section shows based on subscriptions
- [ ] Each recommendation shows "You pay £X for Y" with alternatives
- [ ] All 8 categories visible: Energy, Broadband, Insurance, Mobile, Mortgages, Credit Cards, Loans, Car Finance
- [ ] "View Deal" button works (opens in new tab)

### 9. Spending Intelligence
- [ ] /dashboard/spending loads with data (needs bank connection)
- [ ] Summary shows monthly averages (not inflated totals)
- [ ] Transfers NOT included in spending figures
- [ ] Monthly overview shows spend vs income per month
- [ ] Category breakdown with percentages
- [ ] Categories expandable (paid users)
- [ ] Free users see top 5 + upgrade prompt
- [ ] Pro users see biggest transactions

### 10. Stripe Billing
- [ ] Subscribe to Essential from browser console
- [ ] Payment goes through, profile updates to Essential
- [ ] "Manage Billing" opens Stripe portal
- [ ] Cancel shows pending cancellation on profile
- [ ] Upgrade to Pro → Stripe checkout, charges correctly

### 11. Loyalty Rewards
- [ ] /dashboard/rewards loads
- [ ] Points balance shows
- [ ] Current tier shows (Bronze for new users)
- [ ] "How to earn" table displays
- [ ] Generate a complaint → points awarded
- [ ] Click a deal → points awarded
- [ ] Referral section shows with unique code
- [ ] Copy referral link works

### 12. AI Chatbot
- [ ] Gold bubble visible bottom-right on all pages
- [ ] Click opens chat panel
- [ ] Suggested questions work
- [ ] Responses are relevant and formatted
- [ ] Chatbot doesn't reveal tech stack
- [ ] Tier-aware responses (free users told about upgrade for paid features)

### 13. Email System
- [ ] Waitlist signup → welcome email received
- [ ] Test deal alert: trigger /api/cron/deal-alerts (with CRON_SECRET)
- [ ] Check email received with personalised deals

### 14. Analytics
- [ ] PostHog: check events appearing in dashboard
- [ ] GA4: check real-time shows active users

### 15. Homepage
- [ ] All sections load correctly
- [ ] Feature cards (9 features)
- [ ] Tier comparison table (correct features per tier)
- [ ] "Money you could be owed" section
- [ ] Data security section
- [ ] Waitlist form works
- [ ] Chat widget doesn't block content on mobile

### 16. Admin Dashboard
- [ ] /dashboard/admin accessible only for admin email
- [ ] Overview: MRR, users, subscriptions, transactions counts
- [ ] Members tab: list all users
- [ ] Click member: drill-down with subscriptions, tasks, API costs
- [ ] Opportunity score visible per member

### 17. Mobile Responsiveness
- [ ] Homepage readable on phone
- [ ] Dashboard sidebar collapses to hamburger
- [ ] Subscriptions page usable
- [ ] Chat widget positioned correctly (not blocking content)

---

## After Each Test
- Note: Pass / Fail / Partial
- Screenshot any issues
- Browser + device used
