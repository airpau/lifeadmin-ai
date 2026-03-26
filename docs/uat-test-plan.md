# Paybacker User Acceptance Test Plan

## For Beta Testers and Chrome Extension UX Review
**Version:** 1.0 | **Date:** 26 March 2026 | **Site:** paybacker.co.uk

---

## Instructions for Testers

Please go through each section below on paybacker.co.uk. For each test, note:
- Did it work? (Yes / No / Partially)
- Any issues or bugs?
- How did it feel? (Confusing / OK / Smooth / Delightful)
- Suggestions for improvement?

Use a fresh browser (incognito recommended) for a clean experience.

---

## 1. First Impressions (Homepage)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 1.1 | Homepage loads | Visit paybacker.co.uk | Page loads within 3 seconds, no blank screen |
| 1.2 | Hero section | Read the headline | Clear value proposition: "Get your money back in 30 seconds" |
| 1.3 | Stats visible | Check the stats row | Shows letters generated, subscriptions tracked, 30 sec, 56 deals |
| 1.4 | CTA visible | Find the main button | "Claim Your Free Pro Account" or "Create Free Account" is prominent |
| 1.5 | Mobile responsive | View on phone or resize browser | Layout adapts, text readable, buttons tappable |
| 1.6 | Chat widget | Wait 5 seconds | Chat bubble appears with teaser message |
| 1.7 | Navigation | Click About, Blog, Pricing links | All pages load correctly |
| 1.8 | Social proof | Scroll down | Features section, how it works, pricing comparison visible |

**Feedback:**
- First impression of the site (1-10):
- Would you sign up based on the homepage? Why/why not?
- Anything confusing or unclear?

---

## 2. Sign Up Flow

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 2.1 | Find signup | Click "Get Started" or CTA button | Signup page loads |
| 2.2 | Form fields | Check the form | First name, last name, email, mobile (optional), password |
| 2.3 | Validation | Try submitting empty form | Error messages appear |
| 2.4 | Create account | Fill in details, click Create Account | Account created, redirected to dashboard |
| 2.5 | Welcome email | Check email inbox | Welcome email from Paybacker received |

**Feedback:**
- How easy was signup (1-10)?
- Any friction points?
- Did you receive the welcome email?

---

## 3. Dashboard Overview

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 3.1 | Dashboard loads | After signup, dashboard appears | Stats cards visible (subscriptions, letters, spend) |
| 3.2 | Action items | Check "Your Action Items" section | Items show with relevant badges and action buttons |
| 3.3 | Quick links | Check bottom section | Links to Deals and Contracts |
| 3.4 | Navigation | Use sidebar (desktop) or bottom nav (mobile) | All menu items accessible |
| 3.5 | Mobile nav | On mobile, check bottom bar | Home, Money Hub, Letters, Scanner, Subs visible |

**Feedback:**
- Is the dashboard clear and useful?
- What would you want to see first?

---

## 4. AI Complaint Letters

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 4.1 | Navigate | Click "Letters" in sidebar | Complaints page loads with tabs |
| 4.2 | Generate letter | Click "Generate" tab, fill in company name and issue | AI generates a formal complaint letter |
| 4.3 | Letter quality | Read the generated letter | Cites specific UK law, professional tone, accurate |
| 4.4 | Copy letter | Click "Copy" button | Letter copied to clipboard |
| 4.5 | History | Click "History" tab | Previous letters visible |
| 4.6 | Pre-fill from action item | Go to overview, click "Write Complaint Letter" on an action item | Complaints form pre-filled with provider and issue |

**Feedback:**
- Rate the letter quality (1-10):
- Would you actually send this letter?
- Any laws cited incorrectly?

---

## 5. Subscription Tracking

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 5.1 | Navigate | Click "Subs" in sidebar/bottom nav | Subscriptions page loads |
| 5.2 | Add subscription | Click "Add", fill in provider, amount, billing cycle | Subscription saved and appears in list |
| 5.3 | Contract details | Expand "Contract Details" section in add form | Fields for contract type, end date, provider type, auto-renew |
| 5.4 | Edit subscription | Click pencil icon on a subscription | Edit modal opens with pre-filled data |
| 5.5 | Delete subscription | Click X icon | Subscription removed from list |
| 5.6 | Summary cards | Check the top stats | Monthly spend, active count, annual spend, renewing soon |
| 5.7 | Cancellation email | Click "Generate Cancellation Email" on a subscription | AI generates cancellation email with legal context |
| 5.8 | Find Better Deal | If provider type is set, check for "Find Better Deal" button | Links to relevant deals page |

**Feedback:**
- How useful is subscription tracking (1-10)?
- Would you use the contract end date tracking?

---

## 6. Deals Comparison

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 6.1 | Navigate | Click "Deals" in sidebar | Deals page loads with category tabs |
| 6.2 | Category tabs | Click Energy, Broadband, Mobile, etc. | Deals filter by category |
| 6.3 | Deal cards | Review a deal card | Provider name, headline, saving amount, "View Deal" button |
| 6.4 | View Deal | Click "View Deal" | Opens provider link in new tab (via Awin tracking) |
| 6.5 | Lebara deals | Find Lebara in Mobile | Shows 3 deals with promo codes (LEBARA5, LEBARA10, SAVE50) |
| 6.6 | Affiliate disclosure | Scroll to bottom | Affiliate disclosure text visible |

**Feedback:**
- Are the deals relevant and useful?
- Any categories missing?
- Would you switch provider based on these?

---

## 7. Money Hub (if bank connected)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 7.1 | Navigate | Click "Money Hub" | Money Hub loads |
| 7.2 | Connect bank | If not connected, click "Connect Bank Account" | TrueLayer auth flow starts |
| 7.3 | Spending overview | After connection, check spending data | Categories, amounts, trends visible |
| 7.4 | Budget planner | Check budget section | Can set budgets per category |
| 7.5 | Income tracking | Check income section | Income detected from transactions |

**Feedback:**
- How useful is the spending breakdown?
- Would you connect your real bank account?

---

## 8. Scanner

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 8.1 | Navigate | Click "Scanner" | Scanner page loads |
| 8.2 | Bank status | Check bank connection display | Shows connected banks or "Reconnect" for expired |
| 8.3 | Sync button | If connected, click "Sync Now" | Transactions sync |
| 8.4 | Quick links | Check bottom cards | Links to Subscriptions and Money Hub |

**Feedback:**
- Is the scanner page clear about what it does?

---

## 9. Blog

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 9.1 | Navigate | Click "Blog" in sidebar or header | Blog index loads with posts |
| 9.2 | Read post | Click on a blog post | Full article loads with proper formatting |
| 9.3 | CTA in post | Scroll to bottom of post | "Generate Your Letter Free" CTA visible |

**Feedback:**
- Are the blog posts helpful and relevant?

---

## 10. Pricing Page

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 10.1 | Navigate | Click "Pricing" in header | Pricing page loads |
| 10.2 | Three tiers | Check Free, Essential, Pro | Features clearly listed for each |
| 10.3 | Monthly/Annual toggle | Toggle between monthly and annual | Prices update correctly |
| 10.4 | Founding member banner | Check for special offer banner | Shows if founding member spots available |
| 10.5 | Subscribe | Click "Subscribe" on Essential | Stripe checkout loads with correct price (£4.99) |

**Feedback:**
- Is the pricing clear?
- Which plan would you choose and why?

---

## 11. Chat Bot

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 11.1 | Open chat | Click the chat bubble | Chat widget opens |
| 11.2 | Quick actions | Check suggestion buttons | "How can Paybacker help?", "Consumer rights?", "Cancel subscription?", "Feature suggestion" |
| 11.3 | Ask question | Type "How do I dispute an energy bill?" | Helpful response with UK law references |
| 11.4 | Feature request | Click "I have a feature suggestion" | Directed to features@paybacker.co.uk |
| 11.5 | Escalation | Type "I want to speak to someone" | Directed to support@paybacker.co.uk |

**Feedback:**
- How helpful is the chatbot (1-10)?
- Any questions it couldn't answer?

---

## 12. Mobile Experience

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 12.1 | Homepage mobile | Visit on phone | Fully responsive, readable, CTA visible |
| 12.2 | Signup mobile | Sign up on phone | Form works, keyboard doesn't cover fields |
| 12.3 | Dashboard mobile | Navigate dashboard | Bottom nav works, cards stack properly |
| 12.4 | Generate letter mobile | Generate a complaint letter | Works end to end on phone |

**Feedback:**
- Overall mobile experience (1-10):
- Any elements that don't work on mobile?

---

## 13. Landing Pages

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 13.1 | Solutions pages | Visit paybacker.co.uk/solutions/energy-refunds | Page loads with hero, benefits, FAQ, CTA |
| 13.2 | Deal pages | Visit paybacker.co.uk/deals/broadband | Deal cards load with "View Deal" links |
| 13.3 | All 8 solutions | Check each /solutions/ page loads | No 404s |
| 13.4 | All 9 deal pages | Check each /deals/ page loads | No 404s |

---

## 14. Overall Feedback

Please answer these final questions:

1. **Overall impression (1-10):**
2. **Would you use this product?** Why/why not?
3. **What is the single best feature?**
4. **What is the biggest problem or frustration?**
5. **What feature is missing that you would want?**
6. **Would you recommend this to a friend?**
7. **How does this compare to similar tools you have used?**
8. **Any other comments?**

---

## How to Submit Feedback

Email your completed test results to: **features@paybacker.co.uk**

Or fill in the feedback directly and send as a document.

Thank you for testing Paybacker!
