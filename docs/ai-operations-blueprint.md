# Paybacker AI Operations Blueprint

> Last updated: 23 March 2026 (end of day)

## Overview

Paybacker is an AI-powered savings platform for UK consumers. The system runs with 8 autonomous AI agents managing day-to-day operations, a full support ticketing system, email inbox scanning, an executive meeting room, a self-improving proposal system with one-click email approval, comprehensive contract tracking, and Google Ads integration. The platform is live at paybacker.co.uk with Google Ads driving traffic.

---

## Membership Tiers

### Free
- 3 AI complaint/form letters per month
- Unlimited subscription tracking (manual add)
- One-time bank scan (detects all subscriptions)
- One-time email inbox scan (2 years of history)
- One-time opportunity scan
- Basic spending overview (top 5 categories)
- AI support chatbot
- Loyalty rewards

### Essential (£9.99/month)
- Unlimited complaint and form letters
- 1 bank account with daily auto-sync
- Monthly email inbox re-scans
- Monthly opportunity re-scans
- Full spending intelligence dashboard
- Cancellation emails citing UK consumer law
- Renewal reminders (30, 14, 7 days before)
- Contract end date tracking

### Pro (£19.99/month)
- Everything in Essential
- Unlimited bank accounts
- Unlimited email and opportunity scans
- Full transaction-level analysis
- Priority support
- Automated cancellations (coming soon)

### Upgrade Psychology
- Free to Essential: one-time scans go stale, user wants daily sync and monthly re-scans. Hit 3-letter limit, want unlimited.
- Essential to Pro: want multiple bank accounts (families), unlimited scans, transaction detail.

---

## AI Executive Team (8 Agents)

| Role | Name | Schedule | Model | Emails To |
|------|------|----------|-------|-----------|
| CFO | Alex | 3x daily (7am, 1pm, 6pm) | Haiku | hello@paybacker.co.uk |
| CTO | Morgan | 3x daily (8:30am, 2:30pm, 7:30pm) | Haiku | hello@paybacker.co.uk |
| CAO | Jamie | 3x daily (8am, 12pm, 5pm) | Haiku | hello@paybacker.co.uk |
| CMO | Taylor | 3x daily (7:30am, 1:30pm, 5:30pm) | Haiku | hello@paybacker.co.uk |
| Head of Ads | Jordan | 3x daily (8am, 2pm, 8pm) | Sonnet | hello@paybacker.co.uk |
| Exec Assistant | Charlie | 7x daily (7,9,11,1,3,5,7) | Sonnet | hello@paybacker.co.uk |
| Support Lead | Sam | Every 30 mins | Haiku | DB only |
| Support Agent | Riley | Every 15 mins | Haiku | DB only |

**Cron:** Vercel Pro, `/api/cron/executive-agents` runs every 15 minutes. Each agent's DB schedule determines execution. 14-minute tolerance window prevents missed runs.

**Separate API key:** `ANTHROPIC_AGENTS_API_KEY` for all agent calls, tracks AI staff costs separately from user-facing costs.

### Agent Responsibilities

**Alex (CFO):** MRR, ARR, API costs, revenue margins, tier distribution, financial recommendations.

**Morgan (CTO):** Agent success rates, API errors, cost efficiency, infrastructure recommendations.

**Jamie (CAO):** User growth, onboarding rates, feature adoption, churn signals, waitlist conversion.

**Taylor (CMO):** Social media performance, waitlist funnel, deal clicks, user acquisition, content recommendations.

**Jordan (Head of Ads):** Google Ads performance, signup attribution, CPA tracking, budget recommendations, campaign optimisation. Google Ads API fully connected (developer token, OAuth, customer ID).

**Charlie (Exec Assistant):** Reads ALL other agents' reports, checks support tickets, monitors metrics, scans for expiring contracts, compiles numbered task list for Paul 7x daily.

**Sam (Support Lead):** Triages tickets every 30 minutes, flags urgent/overdue, adjusts priorities, escalates to human.

**Riley (Support Agent):** Auto-responds to simple tickets every 15 minutes, escalates complex ones. Sends branded email to user with response.

### Agent Coordination
Agents flag action items via `agent_action_items` table. Charlie reads all action items and includes them in task briefs. Agents can suggest improvements via `improvement_proposals` table with one-click email approve/reject.

---

## Support Ticketing System

### Ticket Sources
1. Chatbot escalation (auto-creates with conversation history)
2. "Talk to a human" button in chat widget
3. Inbound email webhook (Resend, needs MX setup)
4. Manual creation via API

### Ticket Lifecycle
`open > in_progress > awaiting_reply > resolved > closed`

Auto-generated ticket numbers: TKT-0001, TKT-0002, etc.
Riley auto-emails users with branded response when replying.
First agent reply sets `first_response_at`. Status auto-progresses.

### Admin Dashboard (4 Tabs)
1. **Overview:** MRR, users, tier breakdown, platform stats
2. **Members:** All users with drill-down
3. **Tickets:** Filter, view conversation, reply with email notify
4. **AI Team:** All 8 agents, status, reports, pause/resume, Run Now

### "Call a Meeting" Button
Full-screen boardroom: type a message, all 6 executive agents respond in character using Sonnet. "Make this a proposal" button on every agent message.

---

## Email Scanning (LIVE)

Google OAuth approved and verified. Available to all tiers (one-time for free, monthly for Essential, unlimited for Pro).

### Opportunity Scanner
- Groups emails by sender for efficient analysis
- Uses Sonnet for financial intelligence
- Detects: subscriptions, bills, flight delays, debt disputes, tax rebates, admin tasks, price alerts
- Smart action buttons per type: Add to Subscriptions, Write Complaint, Claim Compensation, Generate HMRC Letter, Create Task, Dismiss
- Opportunities saved to database, persist between visits
- New scans merge with existing (no duplicates)

### Subscription Detection
- Scans 2 years of email history
- Detects contract end dates and renewal notices
- Flags subscriptions ending within 90 days
- Suggests cancellation for unused/expensive items

---

## Contract Tracking

15 fields on the `subscriptions` table for comprehensive contract data:

| Field | Purpose |
|-------|---------|
| contract_type | subscription, fixed_contract, mortgage, loan, insurance, lease, membership, utility |
| contract_start_date / contract_end_date | Contract period |
| contract_term_months | 12, 18, 24, etc. |
| auto_renews | Whether it rolls over |
| early_exit_fee | Penalty for leaving early |
| annual_cost / total_contract_value | Full cost tracking |
| interest_rate / remaining_balance / monthly_payment | Loans and mortgages |
| provider_type | energy, broadband, mobile, mortgage, loan, insurance, etc. |
| current_tariff / postcode / property_type / bedrooms | For deal targeting |
| data_allowance / speed_mbps | Broadband and mobile comparison |

---

## Deals System (Coming Soon)

Deals page shows all categories but buttons greyed out with "Coming Soon" until Awin publisher approved or comparison API partner signed.

### Revenue Strategy (Two-Pronged)
1. **Earn:** Comparison API partner (Switchcraft in negotiation, also contacted Decision Tech, Free Price Compare, The Energy Shop)
2. **Grow:** Awin Advertiser for influencer acquisition (£1 per signup, £2 Essential conversion, £4 Pro conversion)

### Awin Integration (Advertiser)
- Mastertag installed (loads via `NEXT_PUBLIC_AWIN_ADVERTISER_ID`)
- S2S conversion tracking on signup and Stripe webhook
- Commission: £1 free signup (LEAD), £2 Essential (ESSENTIAL), £4 Pro (PRO)
- Tracking confirmed email sent to newintegration@awin.com

---

## Advertising

### Google Ads
- Search campaign live (launched 23 March 2026)
- Budget: ~£10.60/day (~£322/month)
- Keywords: complaint letters, energy disputes, subscription tracking, debt disputes, flight compensation, parking appeals
- Conversion tracking: signup page + checkout page configured
- API fully connected: developer token, OAuth2, refresh token, customer ID
- Jordan (Head of Ads) monitors performance 3x daily

### Meta Ads
- Not yet launched (needs Meta Pixel ID)
- Ad copy drafted: 3 variations (complaint angle, subscription angle, money recovery angle)

---

## Content Pages

- `/about` - What Paybacker is, how it works, trust and transparency
- `/blog` - Index with article cards
- `/blog/are-you-overpaying-on-energy` - Energy price cap guide (800 words)
- `/blog/broadband-contract-ended` - Broadband switching guide (800 words)
- `/privacy-policy` - Full UK GDPR privacy policy
- Header and footer links updated across all pages

---

## Self-Improving Proposal System

Agents suggest improvements in their reports. Proposals auto-emailed to hello@paybacker.co.uk with Approve/Reject buttons.

| Category | On Approve |
|----------|-----------|
| prompt | Agent system prompt updated immediately |
| schedule | Agent cron schedule updated immediately |
| config, data | Logged for next dev session |
| code, feature, bugfix | Creates GitHub issue (GITHUB_TOKEN configured) |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| ANTHROPIC_API_KEY | User-facing Claude calls |
| ANTHROPIC_AGENTS_API_KEY | AI agent calls (staff cost tracking) |
| CRON_SECRET | Auth for cron and admin routes |
| GITHUB_TOKEN | Auto-create issues from proposals |
| GOOGLE_ADS_DEVELOPER_TOKEN | Google Ads API |
| GOOGLE_ADS_CUSTOMER_ID | Google Ads account (390-589-8717) |
| GOOGLE_ADS_CLIENT_ID | OAuth2 for Google Ads |
| GOOGLE_ADS_CLIENT_SECRET | OAuth2 for Google Ads |
| GOOGLE_ADS_REFRESH_TOKEN | Long-lived token for API access |
| GOOGLE_CLIENT_ID | Gmail OAuth |
| GOOGLE_CLIENT_SECRET | Gmail OAuth |
| META_ACCESS_TOKEN | Facebook page posting |
| META_PAGE_ID | Facebook page ID |
| NEXT_PUBLIC_AWIN_ADVERTISER_ID | Awin mastertag |
| NEXT_PUBLIC_AWIN_AFF_ID | Awin publisher affiliate links (not yet set) |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| profiles | User accounts, tiers, Stripe data |
| subscriptions | All tracked subscriptions + 15 contract fields |
| tasks | Complaints, forms, opportunities |
| agent_runs | AI usage audit trail |
| support_tickets | Support tickets (TKT-XXXX) |
| ticket_messages | Conversation threads |
| ai_executives | 8 agent definitions and config |
| executive_reports | Reports from agents |
| agent_action_items | Cross-agent coordination |
| improvement_proposals | Self-improving system |
| social_posts | Social media content |
| bank_connections | TrueLayer connections |
| bank_transactions | Transaction data |
| gmail_tokens | Gmail OAuth tokens |
| usage_logs | Rate limiting |
| deal_clicks | Affiliate click tracking |
| point_events | Loyalty points events |
| user_points | Points balances |
| waitlist_signups | Pre-launch waitlist |

---

## File Structure

```
src/lib/agents/
  executive-agent.ts        Base runner (Haiku/Sonnet, JSON parsing)
  cfo-agent.ts              Alex
  cto-agent.ts              Morgan
  cao-agent.ts              Jamie
  cmo-agent.ts              Taylor
  head-of-ads-agent.ts      Jordan
  exec-assistant-agent.ts   Charlie (Sonnet)
  support-lead-agent.ts     Sam
  support-agent.ts          Riley (auto-emails users)
  complaints-agent.ts       Complaint letter generation

src/app/api/
  support/tickets/           CRUD + messages + inbound email
  admin/agents/              List, update, trigger, reports
  admin/meeting/             Live boardroom chat
  admin/proposals/           Create + approve/reject
  cron/executive-agents/     15-min cron runner
  gmail/scan/                Opportunity scanner
  gmail/detect-subscriptions/ Subscription detection
  awin/signup/               Signup tracking
  awin/conversion/           Paid conversion tracking
  auth/callback/google-ads/  Google Ads OAuth

src/components/admin/
  TicketList.tsx             Ticket management
  AITeamPanel.tsx            Agent cards + controls
  MeetingRoom.tsx            Live boardroom

src/app/
  about/                     About page
  blog/                      Blog index + 2 articles
  privacy-policy/            UK GDPR privacy policy
```

---

## Outstanding Items

1. Meta Ads setup (need Pixel ID)
2. Google Ads API data in Jordan's reports
3. Scanner learning from dismissals
4. Onboarded_at trigger
5. Audit log for approved proposals
6. Meeting history persistence
7. Spending accuracy improvements
8. Self-learning from user edits
9. Switchcraft partnership (awaiting response)
10. Awin publisher approval (pending)
11. Instagram posting (Meta app review pending)
12. Resend inbound MX for email to ticket
13. Page load speed optimisation
14. Blueprint document in docs/ (this file)
