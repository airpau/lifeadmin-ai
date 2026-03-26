/**
 * Single source of truth for product information used by:
 * - Website chatbot (/api/chat)
 * - Social media engagement (comments, DMs)
 * - Telegram bot (Charlie)
 *
 * Updated daily by the context-sync cron job.
 * Import this instead of hardcoding product info in each prompt.
 */

export const PRODUCT_CONTEXT = `
About Paybacker (paybacker.co.uk):
A UK consumer rights platform powered by AI. We help people dispute unfair bills, track subscriptions, scan bank accounts, and get their money back.

FEATURES:

1. AI Complaint Letters
   - Generates formal complaint letters in 30 seconds
   - Cites exact UK legislation: Consumer Rights Act 2015, Consumer Credit Act 1974, EU261/UK261, Ofcom rules, Ofgem rules
   - Covers: energy bill disputes, broadband complaints, flight delay compensation (up to £520), parking charge appeals, council tax band challenges, debt collection responses, insurance claims, NHS complaints, refund requests
   - Free: 3 letters per month. Unlimited on Essential and Pro plans.

2. Government Forms and Official Letters
   - HMRC tax rebates
   - Council tax band challenges
   - DVLA issues
   - NHS formal complaints
   - Parking fine appeals
   - Debt dispute responses (Section 77/78 requests)

3. AI Cancellation Emails
   - Writes cancellation emails citing UK consumer law
   - Provider-specific advice for 80+ UK companies
   - References Consumer Contracts Regulations 2013 (14-day cooling off)
   - Category-specific legal context (broadband Ofcom rules, energy Ofgem rules, gym Consumer Rights Act, etc.)

4. Bank Scanning (Open Banking)
   - Connects bank accounts securely via TrueLayer (FCA regulated, read-only)
   - Scans 12 months of transactions
   - Automatically detects all subscriptions and recurring payments
   - Finds hidden charges and forgotten direct debits
   - Free: one-time scan. Essential: 1 bank with daily sync. Pro: unlimited banks.

5. Money Hub (Financial Dashboard)
   - Full spending intelligence with 20+ category breakdown
   - Income tracking and net worth snapshot
   - Budget planner with category limits and alerts (80% and 100% warnings)
   - Savings goals with progress tracking
   - Monthly spending trends with interactive charts
   - Transaction-level analysis on Pro plan

6. Subscription and Contract Tracking
   - Track every subscription, direct debit, mortgage, loan, insurance, and contract
   - Contract end date tracking with countdown badges
   - Email alerts at 30, 14, and 7 days before renewal
   - "Find Better Deal" button links to relevant deals
   - Add manually or detect automatically from bank connection

7. Email Inbox Scanning
   - Connect Gmail or Outlook (read-only, Google OAuth verified)
   - Scans up to 2 years of email history
   - Finds overcharges, forgotten subscriptions, flight delay opportunities, debt disputes, price increase notifications
   - Smart action buttons: Add to Subscriptions, Write Complaint, Claim Compensation

8. Deal Comparison
   - 59+ deals across 9 categories from verified UK providers
   - Energy, broadband, mobile, insurance, mortgages, loans, credit cards, car finance, travel
   - Awin affiliate integration for trusted switching
   - Free to browse, no signup needed

9. AI Support Chatbot
   - Available on every page
   - Answers UK consumer rights questions
   - Helps navigate the platform
   - Escalates to human support when needed

10. Loyalty Rewards
    - Earn points for every action (generating letters, adding subscriptions, referring friends)
    - Tiers: Bronze, Silver, Gold, Platinum
    - Redeem points for subscription discounts

PRICING:
- Free: 3 AI letters/month, manual subscription tracking, one-time bank scan, one-time email scan, basic spending overview, AI chatbot, loyalty rewards
- Essential £4.99/month (or £44.99/year): unlimited letters, 1 bank account with daily sync, monthly re-scans, full spending dashboard, cancellation emails, renewal reminders, contract tracking
- Pro £9.99/month (or £94.99/year): everything in Essential plus unlimited bank accounts, unlimited scans, full transaction analysis, priority support

SPECIAL OFFER: First 25 members get Pro FREE for 30 days. No card needed.

UK CONSUMER LAW (cite accurately when relevant):
- Consumer Rights Act 2015: goods must be satisfactory quality, fit for purpose, match description. 30-day right to reject faulty goods. Right to repair or replacement within 6 months.
- Consumer Contracts Regulations 2013: 14-day right to cancel online purchases. Refund within 14 days of cancellation.
- Section 75 Consumer Credit Act 1974: credit card purchases between £100 and £30,000 are jointly protected by the card issuer.
- Consumer Credit Act 1974 Section 77/78: right to request a copy of your credit agreement from any lender.
- Ofcom rules: broadband speed guarantees (minimum guaranteed speed in contract). Right to exit penalty-free if speeds consistently below minimum. Mid-contract price rise exit rights.
- Ofgem rules: energy supplier must refund credit within 10 working days of request. Must offer cheapest tariff. Accurate billing required.
- EU261/UK261: up to £520 compensation for flight delays over 3 hours. Applies to flights departing UK or on UK/EU carriers arriving in UK. Can claim for flights in the last 6 years.
- Direct Debit Guarantee: immediate full refund from your bank for any incorrect direct debit payment.
- Financial Ombudsman Service: free dispute resolution for financial products if complaint not resolved within 8 weeks.
- Energy Ombudsman: free resolution for energy complaints not resolved within 8 weeks.

COMPANY INFO:
- Paybacker LTD, UK registered
- Website: paybacker.co.uk
- Support: support@paybacker.co.uk
- Features: features@paybacker.co.uk
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
