# Paybacker — End-to-End Test Plan

Last updated: 20 March 2026

---

## How to use this document

Work through each scenario top to bottom. Mark each step ✅ Pass / ❌ Fail / ⏭ Skip.
For failures, note the error message and URL in the "Notes" column.

---

## 1. Public Homepage

**URL:** https://paybacker.co.uk

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 1.1 | Open homepage | Page loads, no 500/404 errors | |
| 1.2 | Logo visible | "Paybacker" with amber accent | |
| 1.3 | Header: Sign In button | Visible, links to /auth/login | |
| 1.4 | Header: Get Started button | Visible, amber, links to /auth/signup | |
| 1.5 | Hero headline | "Paybacker — Get Your Money Back" | |
| 1.6 | Hero CTA: Create Free Account | Links to /auth/signup | |
| 1.7 | Hero CTA: Sign In | Links to /auth/login | |
| 1.8 | 3 benefit cards visible | "Dispute overcharges", "Cancel forgotten subscriptions", "Letters citing UK consumer law" | |
| 1.9 | "How it works" section | 3 numbered steps visible | |
| 1.10 | Waitlist form visible | Name + email fields + "Join the waitlist" button | |
| 1.11 | Footer | "© 2026 Paybacker LTD." visible | |
| 1.12 | Footer links | Privacy Policy, Terms of Service, Pricing all work | |

---

## 2. Waitlist Sign-Up Flow

**URL:** https://paybacker.co.uk (waitlist form at bottom)

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 2.1 | Enter name and email, click Join | Loading state shown | |
| 2.2 | Success state | Green tick, "You're on the list!" message | |
| 2.3 | Check Supabase | Row inserted in `waitlist_signups` table | |
| 2.4 | Check Resend | Welcome email sent (once domain verified) | |
| 2.5 | Submit duplicate email | Should succeed silently or show friendly error | |
| 2.6 | Submit with no name | Browser validation prevents submit | |
| 2.7 | Submit with invalid email | Browser validation prevents submit | |

---

## 3. Account Sign-Up

**URL:** https://paybacker.co.uk/auth/signup

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 3.1 | Page loads | Paybacker logo, form visible | |
| 3.2 | Fill name, email, password (≥8 chars) → Create account | Success: redirect to /dashboard | |
| 3.3 | Check Supabase | Row in `profiles` table, `subscription_tier = 'free'` | |
| 3.4 | Check Supabase Auth | User appears in Authentication → Users | |
| 3.5 | Try password < 8 chars | Error: "Minimum 8 characters" | |
| 3.6 | Try duplicate email | Supabase error shown ("User already registered") | |
| 3.7 | Terms/Privacy links | In footer of form, both links work | |

---

## 4. Account Login

**URL:** https://paybacker.co.uk/auth/login

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 4.1 | Page loads | Password / Magic Link toggle visible | |
| 4.2 | Login with correct credentials | Redirect to /dashboard | |
| 4.3 | Login with wrong password | Error message shown | |
| 4.4 | Magic Link tab: enter email → Send | "Check your email" confirmation shown | |
| 4.5 | Access /dashboard without auth | Redirect to /auth/login | |

---

## 5. Dashboard — Overview

**URL:** https://paybacker.co.uk/dashboard

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 5.1 | Page loads | Stats cards visible (£0.00 recovered, 0 complaints, etc.) | |
| 5.2 | Sidebar navigation | Overview, Scanner, Complaints, Subscriptions, Profile | |
| 5.3 | Signed-in email | Shown at bottom of sidebar | |
| 5.4 | Mobile view | Hamburger menu works, bottom nav visible | |
| 5.5 | Sign Out | Redirects to homepage | |

---

## 6. Complaint Letter Generator

**URL:** https://paybacker.co.uk/dashboard/complaints

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 6.1 | Page loads | Generate + History tabs visible, usage counter shown | |
| 6.2 | Free tier usage counter | "X of 3 used this month" | |
| 6.3 | Fill out form (company, issue, amount, description) | Form accepts input | |
| 6.4 | Click Generate Complaint | Loading spinner, then letter appears | |
| 6.5 | Letter content | Cites UK consumer law, sets 14-day deadline, professional tone | |
| 6.6 | Usage counter | Increments after generation | |
| 6.7 | Copy button | Copies letter to clipboard | |
| 6.8 | Feedback textarea | Visible below generated letter | |
| 6.9 | Enter feedback, click Regenerate | New letter generated with improvements | |
| 6.10 | Clear Form button | Resets all fields and result | |
| 6.11 | History tab | Shows past letters from `agent_runs` table | |
| 6.12 | Free tier limit hit | Upgrade prompt shown after 3 letters | |

---

## 7. Gmail Scanner (OAuth)

**URL:** https://paybacker.co.uk/dashboard/scanner

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 7.1 | Page loads | Connect Gmail / Connect Outlook buttons visible | |
| 7.2 | Click Connect Gmail | Redirects to Google OAuth | |
| 7.3 | Google auth screen | Correct app name, read-only scope shown | |
| 7.4 | Approve access | Redirects back to /api/auth/callback/google | |
| 7.5 | After connect | Scanner shows "Scanning..." then results | |
| 7.6 | Scan results | Opportunities listed (or "nothing found" message) | |
| 7.7 | Deny OAuth (click Cancel) | Friendly error message shown, not crash | |
| 7.8 | Disconnect Gmail | Token removed from `gmail_tokens` table | |

> **Prerequisite:** GOOGLE_REDIRECT_URI must be set in Vercel AND https://paybacker.co.uk/api/auth/callback/google must be in Google Cloud Console → Authorized redirect URIs.

---

## 8. Subscriptions Tracker

**URL:** https://paybacker.co.uk/dashboard/subscriptions

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 8.1 | Page loads | Subscription list (empty for new user) | |
| 8.2 | Add subscription | Name, amount, billing date → saved to DB | |
| 8.3 | View added subscription | Appears in list | |
| 8.4 | Generate cancellation email | AI drafts email citing consumer law | |
| 8.5 | Delete subscription | Removed from list and DB | |

---

## 9. Pricing Page

**URL:** https://paybacker.co.uk/pricing

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 9.1 | Page loads | 3 plans: Free / Essential £9.99 / Pro £19.99 | |
| 9.2 | Paybacker logo | Correct branding, links to homepage | |
| 9.3 | No success fees mentioned | Neither "20%" nor "15% success fee" anywhere | |
| 9.4 | Monthly/Yearly toggle | Prices update correctly | |
| 9.5 | Free plan CTA | Redirects to /auth/signup | |
| 9.6 | Essential plan CTA (logged out) | Redirects to /auth/login | |
| 9.7 | Essential plan CTA (logged in) | Redirects to Stripe Checkout | |
| 9.8 | Footer | "© 2026 Paybacker LTD. All prices exclude VAT." | |

---

## 10. Stripe Checkout

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 10.1 | Click Essential plan (logged in) | Stripe Checkout page loads within 30s | |
| 10.2 | Stripe branding | Shows Paybacker name | |
| 10.3 | Test card: 4242 4242 4242 4242 | Payment succeeds | |
| 10.4 | After payment | Redirected to /dashboard, profile shows "essential" tier | |
| 10.5 | Webhook fires | Check Supabase: `profiles.subscription_tier = 'essential'`, `subscriptions` row created | |

> **Note:** Use Stripe test mode. Test card: `4242 4242 4242 4242`, any future date, any CVC.

---

## 11. Profile Page

**URL:** https://paybacker.co.uk/dashboard/profile

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 11.1 | Page loads | Name, email, member since, subscription tier visible | |
| 11.2 | Stats | £0.00 recovered, 0 tasks, 0 agents | |
| 11.3 | Connected Accounts section | Gmail + Bank both show "Coming Soon" | |
| 11.4 | Subscription section (free user) | "Upgrade to unlock more" + View Plans button | |
| 11.5 | Legal links | Privacy Policy + Terms of Service links work | |
| 11.6 | Delete Account button | Red button visible in Danger Zone | |
| 11.7 | Delete Account confirmation | Two-step: first click shows confirm UI | |
| 11.8 | Confirm delete | Account deleted, redirected to /?deleted=true | |
| 11.9 | Check Supabase after delete | User gone from Auth + all tables | |

---

## 12. Legal Pages

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 12.1 | /legal/privacy | Page loads, "Paybacker LTD" throughout | |
| 12.2 | Privacy: data processors table | Supabase, Vercel, Anthropic, Stripe, Resend, PostHog listed | |
| 12.3 | Privacy: contact email | privacy@paybacker.co.uk | |
| 12.4 | /legal/terms | Page loads, "Paybacker LTD" throughout | |
| 12.5 | Terms: disclaimer box | "Not legal advice" warning visible | |
| 12.6 | Terms: 14-day cooling off | Mentioned in Section 5 | |
| 12.7 | Terms: governing law | English law, England and Wales jurisdiction | |
| 12.8 | Terms: contact email | hello@paybacker.co.uk | |

---

## 13. GDPR / Data Rights

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 13.1 | Delete account flow | All data removed (see Test 11.8–11.9) | |
| 13.2 | Trust indicators on homepage | "UK consumer protection · GDPR compliant · Read-only email access" | |
| 13.3 | Gmail scope | Read-only — cannot send, delete, or modify emails | |

---

## 14. Mobile / Responsive

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 14.1 | Homepage on mobile | All content readable, CTA buttons full-width | |
| 14.2 | Dashboard on mobile | Bottom nav visible, sidebar hidden | |
| 14.3 | Complaints form on mobile | Form fields full-width, usable | |
| 14.4 | Hamburger menu | Opens mobile sidebar overlay | |
| 14.5 | Bottom nav | All 5 nav items visible and tappable (44px min height) | |

---

## 15. Error States

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 15.1 | Complaints with no API key | Graceful error ("Failed to generate") | |
| 15.2 | Stripe checkout with no price ID | Error alert, no crash | |
| 15.3 | Gmail OAuth: access denied | Friendly error on scanner page | |
| 15.4 | Delete account: API failure | Alert with hello@paybacker.co.uk contact | |
| 15.5 | /dashboard without auth | Redirect to /auth/login | |

---

## Blueprint Completion Checklist

Feature status against original product blueprint.

### Authentication & Accounts ✅
- [x] Email + password signup
- [x] Magic link login
- [x] Email confirmation flow
- [x] Session management (Supabase Auth)
- [x] Sign out
- [x] Profile page
- [x] Account deletion (GDPR)

### AI Complaint Letters ✅
- [x] Generate complaint citing UK consumer law
- [x] Feedback + regenerate
- [x] Letter history saved to DB
- [x] Free tier usage limits (3/month)
- [x] Copy to clipboard

### Inbox Scanner ⚠️ Partial
- [x] Gmail OAuth connect/disconnect
- [x] AI email scanning for opportunities
- [x] Opportunity display UI
- [ ] Outlook OAuth (code exists, untested)
- [ ] Nightly auto-scan cron
- [ ] Open Banking / bank account connection

### Subscription Management ✅
- [x] Add/view/delete subscriptions (manual)
- [x] AI cancellation email generation
- [ ] Auto-detection from Gmail scan (needs nightly cron)

### Payments & Plans ✅
- [x] 3-tier pricing page (Free / Essential / Pro)
- [x] Stripe Checkout integration
- [x] Stripe webhook → update subscription tier
- [x] Plan gating (usage_logs, increment_usage)
- [ ] Stripe Customer Portal (self-service cancel/upgrade)
- [ ] Stripe price IDs — confirm real IDs are set

### Waitlist & Marketing ✅
- [x] Waitlist form (homepage)
- [x] 8-email nurture sequence
- [x] Cron endpoint for sequence delivery

### Legal & Compliance ✅
- [x] Privacy Policy (/legal/privacy)
- [x] Terms of Service (/legal/terms)
- [x] GDPR delete account flow
- [x] Read-only email scope disclosure

### Analytics ✅
- [x] PostHog analytics installed
- [x] Page view tracking
- [x] User identification

### Branding ✅
- [x] Full rebrand to Paybacker LTD
- [x] paybacker.co.uk domain live
- [x] www.paybacker.co.uk SSL working
- [ ] Apex (paybacker.co.uk) SSL — awaiting Vercel cert provisioning
- [ ] Resend domain verified (paybacker.co.uk)
- [ ] Google Cloud Console: redirect URI updated

### Not Yet Built ❌
- [ ] Savings Agent (tariff comparison, switching letters)
- [ ] Forms & Government Agent (HMRC, council tax, DVLA)
- [ ] Open Banking integration
- [ ] Share Your Win feature
- [ ] Mobile app

---

## Pre-Launch Checklist

Before going live, confirm:

- [ ] `ANTHROPIC_API_KEY` set in Vercel (required for complaints + cancellation emails)
- [ ] Real Stripe price IDs set (not placeholders)
- [ ] `GOOGLE_REDIRECT_URI=https://paybacker.co.uk/api/auth/callback/google` set in Vercel
- [ ] Google Cloud Console: paybacker.co.uk redirect URI authorised
- [ ] Resend domain paybacker.co.uk verified → `RESEND_FROM_EMAIL=Paybacker <hello@paybacker.co.uk>` set in Vercel
- [ ] paybacker.co.uk apex SSL working
- [ ] Stripe dashboard: business name updated to Paybacker LTD
- [ ] Test Stripe webhook with live keys
- [ ] Supabase: confirm RLS policies on all tables
