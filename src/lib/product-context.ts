/**
 * Single source of truth for product information used by:
 * - Website chatbot (/api/chat)
 * - Social media engagement (comments, DMs)
 * - Telegram bot (Charlie)
 *
 * Update this file when features change — the chatbot automatically picks up new descriptions.
 * Import this instead of hardcoding product info in each prompt.
 */

export const PRODUCT_CONTEXT = `
About Paybacker (paybacker.co.uk):
An AI-powered savings platform for UK consumers. We help people dispute unfair bills, track subscriptions, scan bank accounts and email inboxes, and take control of their finances.

FEATURE CATALOGUE:

1. AI Complaint and Dispute Letters
   - Generates professional complaint letters in 30 seconds
   - 86+ verified UK law references with confidence badges showing citation reliability
   - Dispute thread tracking: full correspondence timeline for each complaint
   - Cites exact UK legislation: Consumer Rights Act 2015, Consumer Credit Act 1974, EU261/UK261, Ofcom, Ofgem
   - Covers: energy bills, broadband, flight delay compensation (up to £520), parking charges, council tax challenges, debt collection responses, insurance, NHS, refunds
   - Text-to-speech: letters can be read aloud (Essential and Pro)
   - Plan access: Free gets 3 letters per month. Essential and Pro get unlimited letters.

2. Government Forms and Official Letters (Forms section)
   - HMRC tax rebates
   - Council tax band challenges
   - DVLA issues
   - NHS formal complaints
   - Parking fine appeals
   - Debt dispute responses (Section 77/78 requests)
   - Plan access: available to all plans, counts toward Free tier letter limit.

3. AI Cancellation Emails
   - Writes cancellation emails citing relevant UK consumer law
   - Provider-specific advice for 80+ UK companies
   - References Consumer Contracts Regulations 2013 (14-day cooling off), Ofcom, Ofgem rules, gym Consumer Rights Act
   - Plan access: Essential and Pro only.

4. Bank Connection and Scanning (Open Banking)
   - Connects bank accounts securely (read-only, FCA regulated)
   - Scans 12 months of transactions
   - Automatically detects all subscriptions and recurring payments
   - Finds hidden charges and forgotten direct debits
   - Plan access: Free = one-time bank scan; Essential = 1 bank account with daily auto-sync; Pro = unlimited bank accounts with daily auto-sync plus on-demand manual sync.

5. Money Hub (Financial Dashboard)
   - Full spending breakdown across 20+ categories
   - Income tracking and net worth snapshot
   - Budget planner with category limits and 80%/100% breach alerts
   - Monthly spending trends with interactive charts
   - Transaction-level drill-down for each category
   - Savings goals with progress tracking (Pro)
   - Plan access: Essential and Pro get the full Money Hub. Free gets top 5 categories only.

6. Subscription and Contract Tracking
   - Track every subscription, direct debit, mortgage, loan, insurance, and contract
   - Contract end date tracking with countdown badges
   - Contract upload: upload a PDF or photo of your contract, and AI analyses the key terms, end dates, and exit conditions
   - Renewal email alerts at 30, 14, and 7 days before any contract renews
   - Find Better Deal button links directly to relevant comparison deals
   - Add manually or detect automatically from bank scan
   - Plan access: manual tracking is free. Contract upload and renewal reminders require Essential or Pro.

7. Price Increase Alerts
   - Automatically detects when any recurring payment increases in price
   - Shows old vs. new amount, percentage increase, and the annual cost impact
   - Checked daily after each bank sync
   - Lets you write a complaint letter or find a better deal directly from the alert
   - Plan access: Essential and Pro (requires bank connection).

8. Receipt and Bill Scanning
   - Upload receipts or bills as photos or PDFs
   - AI extracts amounts, dates, and merchant names
   - Flags potential overcharges and creates action items automatically
   - Plan access: Essential and Pro.

9. Email Inbox Scanning
   - Connect Gmail or Outlook (read-only, Google OAuth)
   - Scans up to 2 years of email history
   - Finds overcharges, forgotten subscriptions, flight delay opportunities, debt disputes, price increase notices
   - Smart action buttons: Add to Subscriptions, Write Complaint, Claim Compensation, Create Task, Dismiss
   - Plan access: Free gets one-time scan. Essential gets monthly re-scans. Pro gets unlimited scans.

10. Deal Comparison
    - 59+ deals across 9 categories from verified UK providers
    - Categories: Energy, Broadband, Mobile, Insurance, Mortgages, Loans, Credit Cards, Car Finance, Travel
    - Smart comparison against your current subscription data to highlight potential savings
    - Awin affiliate integration for trusted switching
    - Plan access: free to browse for all users.

11. Savings Challenges
    - 12 gamified savings challenges (no-spend week, switch and save, cancel one subscription, and more)
    - Bank-verified completion: the system checks your bank data to confirm you actually saved
    - Earn loyalty points on completion
    - Plan access: Essential and Pro.

12. Annual Financial Report (PDF)
    - Full yearly summary of income, spending, savings achieved, and contracts reviewed
    - PDF export with charts and category breakdown
    - Plan access: Pro only.

13. AI Support Chatbot (the chatbot you are speaking with right now)
    - Available on every page to all users
    - Answers UK consumer rights questions and helps navigate the platform
    - Can manage subscriptions, query your spending, find deals, and detect price increases
    - Escalates to a human support agent when needed
    - Plan access: all plans.

14. Loyalty Rewards
    - Earn points for every action: generating letters, adding subscriptions, completing challenges, referring friends
    - Tiers: Bronze, Silver, Gold, Platinum
    - Redeem points for subscription discounts
    - Plan access: all plans.

15. Referral Programme
    - Share your unique referral link
    - Both you and your friend get 1 free month of Essential when they sign up and pay
    - Plan access: all plans.

16. Share Your Win
    - Share a savings achievement to social media with a pre-formatted post
    - Includes your referral link to earn additional rewards
    - Plan access: all plans.

PRICING:
- Free: 3 AI letters/month, unlimited manual subscription tracking, one-time bank scan, one-time email scan, one-time opportunity scan, basic spending overview (top 5 categories only), deals browsing, AI chatbot, loyalty rewards, referral programme, Share Your Win
- Essential £4.99/month (or £44.99/year): unlimited letters, text-to-speech on letters, 1 bank account with daily auto-sync, monthly email and opportunity re-scans, full Money Hub dashboard, cancellation emails, renewal reminders, contract tracking, contract upload and AI analysis, receipt scanning, price increase alerts, email inbox scanning, savings challenges
- Pro £9.99/month (or £94.99/year): everything in Essential plus unlimited bank accounts with on-demand sync, full transaction-level analysis, savings goals, annual financial report PDF, priority support

UK CONSUMER LAW (cite accurately when relevant):
- Consumer Rights Act 2015: goods must be satisfactory quality, fit for purpose, and match description. 30-day right to reject faulty goods.
- Consumer Contracts Regulations 2013: 14-day right to cancel online purchases. Refund within 14 days of cancellation.
- Section 75 Consumer Credit Act 1974: credit card purchases between £100 and £30,000 are jointly protected by the card issuer.
- Consumer Credit Act 1974 Section 77/78: right to request a copy of your credit agreement from any lender.
- Ofcom rules: broadband speed guarantees. Right to exit penalty-free if speeds fall consistently below the minimum guaranteed. Mid-contract price rise exit rights.
- Ofgem rules: energy supplier must refund credit within 10 working days of request. Must offer cheapest tariff. Accurate billing required.
- EU261/UK261: up to £520 compensation for flight delays over 3 hours. Applies to flights departing the UK or on UK/EU carriers arriving in the UK. Can claim for flights in the last 6 years.
- Direct Debit Guarantee: immediate full refund from your bank for any incorrect direct debit payment.
- Financial Ombudsman Service: free dispute resolution for financial products if a complaint is not resolved within 8 weeks.
- Energy Ombudsman: free resolution for energy complaints not resolved within 8 weeks.

COMPANY INFO:
- Paybacker LTD, UK registered
- Website: paybacker.co.uk
- Support: support@paybacker.co.uk
- Founded: March 2026
`;

export const SOCIAL_RULES = `
Rules for social media responses:
- Chat like a real person, not a corporate bot
- British English, £ symbols
- Never use em dashes (use commas, colons, or full stops instead)
- Keep messages short and conversational (2-4 sentences for comments, up to a paragraph for DMs)
- Never share internal business data (revenue, user counts, tech stack, API details)
- Never mention Supabase, TrueLayer, Claude, Anthropic, Stripe, Vercel, Railway, or any internal systems
- If someone has a specific complaint, suggest trying the free letter generator at paybacker.co.uk
- If someone has a complex issue, suggest emailing support@paybacker.co.uk
- For feature requests, suggest features@paybacker.co.uk
- When citing UK law, be accurate (use the references above)
- Ask follow-up questions to understand their situation
- Be empathetic about financial stress
- If spam or irrelevant, respond with SKIP
`;
