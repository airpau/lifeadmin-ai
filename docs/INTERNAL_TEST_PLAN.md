# Paybacker — Internal Test Plan
*Date: 22 March 2026 | Tester: Paul | Account: aireypaul@googlemail.com*

---

## Pre-Test Setup
- [ ] Clear browser cache or use incognito
- [ ] Have your phone ready for Apple Pay / card testing
- [ ] Have access to hello@paybacker.co.uk inbox

---

## 1. Homepage & Landing Page

### 1.1 Visual Check
- [ ] Homepage loads at paybacker.co.uk
- [ ] Logo shows in navbar (not duplicated in hero)
- [ ] "Launching Soon" badge visible (waitlist mode)
- [ ] 9 feature cards display correctly
- [ ] Tier comparison table renders (Free / Essential / Pro)
- [ ] "Money you could be owed" section shows 6 cards
- [ ] Waitlist form visible with social proof counter
- [ ] Footer links work (Privacy, Terms, Pricing)

### 1.2 Waitlist Signup
- [ ] Submit a test email to waitlist form
- [ ] Success message shows
- [ ] Counter updates
- [ ] Check Supabase: waitlist_signups table has new entry

### 1.3 Chat Widget
- [ ] Gold chat bubble visible bottom-right
- [ ] Click opens chat panel
- [ ] Suggested questions display
- [ ] Type a question and get AI response
- [ ] Response is relevant and UK-focused
- [ ] Close button works

---

## 2. Authentication

### 2.1 Login
- [ ] Go to /auth/login
- [ ] Logo + "Paybacker" text shows
- [ ] Login with aireypaul@googlemail.com
- [ ] Redirect to /dashboard after login

### 2.2 Signup (test with a new email)
- [ ] Go to /auth/signup
- [ ] If WAITLIST_MODE=true: redirects to homepage
- [ ] (Test when waitlist mode disabled) Create account with new email
- [ ] Verify email flow works or instant login

---

## 3. Dashboard Overview

- [ ] Shows correct user name
- [ ] Stats cards display (money recovered, tasks, agents run)
- [ ] If returning from Stripe checkout (?success=true): shows sync message

---

## 4. Subscriptions Page

### 4.1 Bank Connection
- [ ] "Connect Bank Account" button visible
- [ ] Click → redirects to TrueLayer
- [ ] Select NatWest (or your bank), authenticate
- [ ] Redirects back to subscriptions page with "Bank connected" toast
- [ ] Bank name shows on connected bank card
- [ ] "Add Bank" button visible below existing connection

### 4.2 Bank Sync
- [ ] Click "Sync Now" on connected bank
- [ ] Transactions sync (check count in toast or Supabase)
- [ ] Recurring payments detected and shown as subscriptions
- [ ] Each subscription shows: provider name, amount, category badge, billing cycle
- [ ] Bank-detected subs show "Bank: [description]" line
- [ ] Source badge shows (bank icon)

### 4.3 Subscription Management
- [ ] Click X to remove a subscription → confirm it disappears
- [ ] Reload page → subscription stays removed (soft-delete working)
- [ ] Click "Sync Now" again → removed subscription does NOT come back
- [ ] Click "+ Add Subscription" → manual add form works
- [ ] Edit a subscription (pencil icon) → save changes

### 4.4 Cancellation Flow
- [ ] Click on a subscription → right panel shows cancellation info
- [ ] For known providers: email, phone, URL, tips display
- [ ] Click "Generate Cancellation Email" → AI generates letter
- [ ] Letter uses correct legal context (not Consumer Contracts for council tax, etc.)
- [ ] "Saved to your complaint history" message shows
- [ ] Click "Request changes" → type feedback → "Regenerate" works
- [ ] "Copy Email" button works
- [ ] "Open in Email" button works (if account_email set)

### 4.5 Email Scan (Detect from Inbox)
- [ ] Click "Detect from Inbox" (requires Gmail connected via Scanner page first)
- [ ] Detected subscriptions appear
- [ ] No duplicates of existing subscriptions
- [ ] Click "Track" to add detected subscription

---

## 5. Opportunity Scanner

### 5.1 Connect Gmail
- [ ] Go to /dashboard/scanner
- [ ] Click "Connect Gmail"
- [ ] Google OAuth flow completes
- [ ] Gmail shows as connected with email address

### 5.2 Run Scan
- [ ] Click "Scan Inbox"
- [ ] Progress panel shows ("Deep scanning your inbox...")
- [ ] After completion: summary shows (emails scanned, opportunities found, potential savings)
- [ ] Opportunities display with correct types/icons
- [ ] Each opportunity has: title, description, amount, confidence, provider
- [ ] Action buttons show context-appropriate text (Track, Track & Find Deal, Track & Dispute, etc.)

### 5.3 Track Opportunity
- [ ] Click "Track" on an opportunity
- [ ] Redirects to subscriptions page or saves the item
- [ ] Item appears in subscriptions list

---

## 6. Complaints Page

### 6.1 Generate Complaint
- [ ] Go to /dashboard/complaints
- [ ] Fill in: Company Name, Issue Description, Desired Outcome
- [ ] Click "Generate Complaint Letter"
- [ ] Letter generates with UK consumer law citations
- [ ] Legal references section shows (CRA 2015, Ofcom, etc.)
- [ ] "Copy Letter" and "Download PDF" buttons work

### 6.2 Edit & Regenerate
- [ ] Click edit icon on the letter
- [ ] Edit text in place
- [ ] Save changes
- [ ] Click "Regenerate" with feedback

### 6.3 Approve Letter
- [ ] Click "Approve" button
- [ ] Status changes to approved

### 6.4 History Tab
- [ ] Click "History" tab
- [ ] Past complaints show with provider name, date, status
- [ ] Click on a complaint → letter modal opens
- [ ] Full letter text visible with legal references
- [ ] Copy and PDF buttons work in modal

---

## 7. Deals Page

- [ ] Go to /dashboard/deals
- [ ] Categories display: Energy, Broadband, Insurance, Mobile
- [ ] Deal cards show provider name, description, CTA
- [ ] Click a deal → logs click to /api/deals/click
- [ ] (Awin pending) Links currently go to placeholder — verify no errors

---

## 8. Profile & Billing

### 8.1 Profile Page
- [ ] Shows correct name, email, plan badge
- [ ] Member since date correct
- [ ] Subscription status shows correctly
- [ ] Stats display (money recovered, tasks, agents)
- [ ] Connected accounts section shows (Gmail, Bank — Coming Soon badges)

### 8.2 Stripe Billing
- [ ] Click "Manage Billing" → Stripe portal opens
- [ ] Portal shows: current plan, cancel option, payment methods
- [ ] Returning from portal: profile syncs and shows updated status
- [ ] Pending cancellation: red notice shows with date

### 8.3 Plan Upgrade/Downgrade
- [ ] From browser console, trigger checkout for a different plan
- [ ] Stripe checkout page loads, payment works
- [ ] After payment: redirects to dashboard, plan updates automatically
- [ ] Profile page shows new tier

---

## 9. SEO Pages

- [ ] Visit /complaints/british-gas → page loads with content
- [ ] Visit /complaints/sky → page loads
- [ ] Check 2-3 other complaint pages exist and render correctly

---

## 10. Legal Pages

- [ ] /legal/privacy loads with GDPR-compliant privacy policy
- [ ] /legal/terms loads with terms of service
- [ ] Both mention Paybacker LTD, AI disclaimer, Anthropic as data processor

---

## 11. Analytics Verification

- [ ] Check PostHog dashboard → events appearing (page views, custom events)
- [ ] Perform key actions and verify events in PostHog:
  - [ ] Page view
  - [ ] waitlist_signup
  - [ ] complaint_generated
  - [ ] bank_synced
  - [ ] cancellation_email_generated
  - [ ] deal_clicked

---

## 12. Mobile Responsiveness

- [ ] Homepage renders on mobile (check on phone)
- [ ] Dashboard sidebar collapses to hamburger menu
- [ ] Subscriptions page usable on mobile
- [ ] Chat widget works on mobile
- [ ] Pricing page tier cards stack correctly

---

## Known Issues / Limitations

- Awin affiliate links are placeholders (pending approval)
- Google OAuth is in test mode (only pre-approved test users can connect Gmail)
- Email scan requires Gmail connected (Scanner page → Connect Gmail first)
- TrueLayer is in production but may have bank-specific limitations

---

## After Testing — Report

For each section, note:
- **Pass / Fail / Partial**
- **Screenshots** of any issues
- **Browser + device** used
- **Suggested improvements**
