# Paybacker — End-to-End Test Plan v2
*Date: 21 March 2026 | Tester: Paul Airey (aireypaul@googlemail.com) | Site: paybacker.co.uk*

---

## How to use this document

Work through each section in order. For each test:
1. Follow the **Steps** exactly
2. Compare what you see against the **Expected Result**
3. Write **Pass** or **Fail** in the **Result** column
4. If Fail, note what actually happened in the **Notes** column

Use two browsers/sessions where tests require both a free user and a paid user.

**Test card for Stripe:** `4242 4242 4242 4242` — any future expiry, any 3-digit CVC, any postcode.

---

## Section 1: Authentication

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| AUTH-01 | Signup — new user | 1. Open an incognito window<br>2. Go to paybacker.co.uk/auth/signup<br>3. Enter a new email + password<br>4. Click **Create account** | Account created; redirected to /dashboard | | |
| AUTH-02 | Login — existing user | 1. Go to paybacker.co.uk/auth/login<br>2. Enter aireypaul@googlemail.com + password<br>3. Click **Sign in** | Redirected to /dashboard; name/email shown in sidebar | | |
| AUTH-03 | Password reset | 1. Go to /auth/login<br>2. Click **Forgot password**<br>3. Enter aireypaul@googlemail.com<br>4. Click **Send reset link** | Success message shown; reset email arrives in inbox | | |
| AUTH-04 | Auth redirect — logged-in user hits login | 1. While logged in, navigate directly to paybacker.co.uk/auth/login | Automatically redirected to /dashboard without showing login form | | |
| AUTH-05 | Auth redirect — unauthenticated user hits dashboard | 1. In a fresh incognito window<br>2. Navigate directly to paybacker.co.uk/dashboard | Redirected to /auth/login | | |

---

## Section 2: Plan Gating

> Before running these tests, ensure you have: (a) a free account and (b) a paid account to compare. Use the Stripe test card to upgrade.

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| GATE-01 | Free user — complaints page accessible | 1. Log in as free user<br>2. Go to /dashboard/complaints | Page loads; "Generate Complaint" form visible; usage counter shows (e.g. 0/3 this month) | | |
| GATE-02 | Free user — scanner blocked | 1. Log in as free user<br>2. Click **Scanner** in sidebar or go to /dashboard/scanner | Redirected to /pricing with upgrade prompt | | |
| GATE-03 | Free user — deals blocked | 1. Log in as free user<br>2. Click **Deals** in sidebar or go to /dashboard/deals | Redirected to /pricing with upgrade prompt | | |
| GATE-04 | Paid user — full access | 1. Log in as paid user (or complete STRIPE-01 first)<br>2. Click **Scanner** in sidebar<br>3. Click **Deals** in sidebar | Both pages load without redirect | | |
| GATE-05 | Stripe test card checkout | 1. Go to /pricing<br>2. Click **Start 7-day free trial** on Essential<br>3. Enter card: 4242 4242 4242 4242, any future date, any CVC<br>4. Complete checkout | Redirected to /dashboard?success=true; success banner visible | | |
| GATE-06 | Trial status in database | 1. After GATE-05, check Supabase<br>2. Open profiles table, find your user row | subscription_status = 'trialing'; subscription_tier = 'essential' | | |

---

## Section 3: Complaints AI Agent

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| COMP-01 | Generate complaint letter | 1. Go to /dashboard/complaints<br>2. Fill in: Company = "British Gas", Issue = "Overcharged by £120 on my January bill", Desired Outcome = "Full refund of £120"<br>3. Click **Generate Letter** | After 10–20 seconds, a formatted complaint letter appears referencing UK consumer law | | |
| COMP-02 | Letter is well formatted | 1. After COMP-01, read the letter | Letter has: date, your name/address (if provided), company address, formal salutation, numbered paragraphs, legal references (Consumer Rights Act 2015 or similar), clear demand, closing | | |
| COMP-03 | Copy to clipboard | 1. Click the **Copy** button on the generated letter | "Copied!" confirmation appears; paste into Notepad/Notes confirms text is there | | |
| COMP-04 | Download PDF | 1. Click the **Download PDF** button | Browser downloads a .pdf file; open it to confirm letter content is readable | | |
| COMP-05 | Approve letter | 1. Click **Yes, it's great** (or the approve button) | Confirmation shown (e.g. "Letter approved"); letter status updates | | |
| COMP-06 | Request changes | 1. Generate a new letter (repeat COMP-01)<br>2. Click **Request changes**<br>3. Type: "Make it more assertive and mention Ofgem"<br>4. Click **Regenerate** | New version of the letter appears with requested changes incorporated | | |
| COMP-07 | History tab | 1. Click the **History** tab on the complaints page | List of previously generated letters appears with dates and company names | | |
| COMP-08 | Edit letter in history | 1. In the History tab, click the pencil/edit icon on any letter | Letter opens in editable state; changes can be saved | | |
| COMP-09 | Free user 3-complaint limit | 1. As a free user, generate 3 complaint letters<br>2. Try to generate a 4th | Upgrade prompt appears instead of generating; message explains the 3/month free limit | | |

---

## Section 4: Gmail/Outlook Scanner

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| SCAN-01 | Connect Gmail account | 1. Go to /dashboard/scanner<br>2. Click **Connect Gmail**<br>3. Authorise with your Google account | Gmail shown as connected; scan button appears | | |
| SCAN-02 | Run inbox scan | 1. After SCAN-01, click **Scan Inbox** (or it runs automatically) | Scan runs; spinner shown; results appear within 30 seconds | | |
| SCAN-03 | Opportunities appear | 1. After SCAN-02, view results | At least some opportunities shown — subscriptions, potential refunds, or overpayments detected | | |
| SCAN-04 | Track & Cancel on opportunity | 1. Find a subscription opportunity in results<br>2. Click **Track & Cancel** | Subscription added to Subscription Tracker; cancellation email drafted | | |

---

## Section 5: Subscription Tracker

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| SUB-01 | Add subscription manually | 1. Go to /dashboard/subscriptions<br>2. Click **Add Subscription**<br>3. Fill in: Name = "Netflix", Amount = 15.99, Billing = Monthly<br>4. Click **Save** | Netflix appears in the subscriptions list with a ✏️ (manual) badge | | |
| SUB-02 | Edit subscription | 1. Click the edit icon on the Netflix subscription<br>2. Change amount to 17.99<br>3. Save | Amount updates to £17.99 in the list | | |
| SUB-03 | Delete subscription | 1. Click the delete icon on the Netflix subscription<br>2. Confirm deletion | Netflix removed from the list | | |
| SUB-04 | Generate AI cancellation email | 1. Add a new subscription (e.g. "Spotify", £9.99/month)<br>2. Click **Cancel** or **Generate cancellation email** | AI-drafted cancellation email appears with subject line and body; professional tone; references UK Consumer Contracts Regulations 2013 | | |
| SUB-05 | Connect bank account (TrueLayer sandbox) | 1. Click **Connect Bank Account**<br>2. In the TrueLayer flow, select **Lloyds Bank Sandbox**<br>3. Enter credentials: username = user, password = password<br>4. Authorise | Bank shown as connected; "Connected" status visible | | |
| SUB-06 | Trigger bank sync | 1. After SUB-05, click **Sync** or wait for auto-sync | Sync runs; loading indicator shown; completes without error | | |
| SUB-07 | Bank-detected subscriptions appear | 1. After SUB-06, view the subscriptions list | One or more subscriptions appear with a 🏦 badge indicating they were detected from bank data | | |
| SUB-08 | Source badges visible | 1. View subscriptions list after adding manually and connecting bank | Each subscription shows the correct badge: 🏦 bank-detected, 📧 email-detected, ✏️ manual | | |

---

## Section 6: Affiliate Deals Tab

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| DEAL-01 | Page loads with all categories | 1. Log in as a paid user<br>2. Go to /dashboard/deals | Page loads with 4 categories visible: Energy, Broadband, Insurance, Mobile | | |
| DEAL-02 | Click a deal — opens new tab | 1. Click on any deal card | New browser tab opens to the provider's website (note: links may be placeholder URLs) | | |
| DEAL-03 | Click logged in database | 1. After DEAL-02, check Supabase<br>2. Open the deal_clicks table | A new row exists with your user_id, the deal ID, and a timestamp | | |

---

## Section 7: Stripe Payments

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| STRIPE-01 | Checkout — Essential plan | 1. Go to /pricing<br>2. Click **Start 7-day free trial** on Essential (£9.99/mo)<br>3. Enter card 4242 4242 4242 4242, any future date, any CVC<br>4. Click **Subscribe** | Redirected to /dashboard?success=true; success banner visible | | |
| STRIPE-02 | Subscription tier updated | 1. After STRIPE-01, check Supabase profiles table for your user | subscription_tier = 'essential'; subscription_status = 'trialing' | | |
| STRIPE-03 | Manage Billing button appears | 1. Go to /dashboard/profile | **Manage Billing** button visible (not the Upgrade button) | | |
| STRIPE-04 | Stripe portal opens | 1. Click **Manage Billing** | New tab/redirect opens to the Stripe customer portal showing your subscription details | | |
| STRIPE-05 | Cancel subscription in portal | 1. In the Stripe portal, click **Cancel plan**<br>2. Confirm cancellation | Cancellation confirmed in portal; returns to app | | |
| STRIPE-06 | Cancellation reflected in DB | 1. After STRIPE-05, wait up to 60 seconds<br>2. Check Supabase profiles table | subscription_status updated to 'canceled' (or 'active' until period end — depends on Stripe config) | | |

---

## Section 8: Profile Page

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| PROF-01 | Profile details display | 1. Go to /dashboard/profile | Your email address displayed correctly; account plan shown | | |
| PROF-02 | Manage Billing (paid user) | 1. As a paid user, view /dashboard/profile | **Manage Billing** button present and clickable (see STRIPE-04) | | |
| PROF-03 | Upgrade Plan (free user) | 1. As a free user, view /dashboard/profile | **Upgrade Plan** button present; clicking it goes to /pricing | | |
| PROF-04 | Delete account | 1. Create a throwaway test account (AUTH-01)<br>2. Log in as that account<br>3. Go to /dashboard/profile<br>4. Click **Delete account**<br>5. Confirm in the dialog | Account deleted; redirected to marketing page or /auth/login; cannot log back in with that account | | |

---

## Section 9: Legal Pages

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| LEGAL-01 | Privacy policy loads | 1. Go to paybacker.co.uk/legal/privacy | Page loads; content visible; Paybacker LTD branding present | | |
| LEGAL-02 | Terms of service loads | 1. Go to paybacker.co.uk/legal/terms | Page loads; content visible; Paybacker LTD branding present | | |

---

## Section 10: Admin Dashboard

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| ADMIN-01 | Admin access for aireypaul@googlemail.com | 1. Log in as aireypaul@googlemail.com<br>2. Go to /dashboard/admin | Admin dashboard loads; stats visible (user count, complaints, subscriptions) | | |
| ADMIN-02 | Non-admin user blocked | 1. Log in as any other account (not aireypaul@googlemail.com)<br>2. Go to /dashboard/admin | Redirected away (to /dashboard or /auth/login); admin content not shown | | |
| ADMIN-03 | Stats are correct | 1. On the admin dashboard, note the user count<br>2. Check Supabase profiles table row count | Numbers match (within a small margin for timing) | | |

---

## Section 11: Email Flows

| ID | Description | Steps | Expected Result | Result | Notes |
|----|-------------|-------|----------------|--------|-------|
| EMAIL-01 | Waitlist confirmation email | 1. Go to paybacker.co.uk (landing page)<br>2. Enter a fresh email address in the waitlist form<br>3. Submit | Confirmation email arrives from hello@paybacker.co.uk within 5 minutes | | |
| EMAIL-02 | Test email via cron endpoint | 1. Make a GET request to /api/cron/test-email with header `Authorization: Bearer <CRON_SECRET>`<br>2. Check hello@paybacker.co.uk inbox | Email arrives confirming Resend + domain are working; subject includes timestamp | | |

---

## Summary Checklist

| Section | Total Tests | Passed | Failed | Blocked |
|---------|------------|--------|--------|---------|
| 1. Authentication | 5 | | | |
| 2. Plan Gating | 6 | | | |
| 3. Complaints AI | 9 | | | |
| 4. Gmail Scanner | 4 | | | |
| 5. Subscription Tracker | 8 | | | |
| 6. Affiliate Deals | 3 | | | |
| 7. Stripe Payments | 6 | | | |
| 8. Profile Page | 4 | | | |
| 9. Legal Pages | 2 | | | |
| 10. Admin Dashboard | 3 | | | |
| 11. Email Flows | 2 | | | |
| **Total** | **52** | | | |

---

*Test plan prepared for Paybacker LTD · paybacker.co.uk · 21 March 2026*
