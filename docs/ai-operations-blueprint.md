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

## SEO and Discoverability

**Fixed 23 March 2026:**
- robots.txt created at /public/robots.txt (allows all crawlers, references sitemap)
- sitemap.xml generated at /src/app/sitemap.ts (11 public pages)
- Open Graph tags added (title, description, image, locale en_GB)
- Twitter card tags added
- Canonical URLs set via metadataBase
- Keywords meta tag added
- robots meta set to index: true, follow: true
- Root cause of invisibility: /robots.txt was 404, which served a page containing noindex meta tag

**Still needed:**
- Google Search Console verification (need to download HTML file and add to /public/)
- Submit sitemap to Google Search Console
- Request indexing for all key pages
- Bing Webmaster Tools (optional)
- Monitor indexing status weekly

---

## Marketing Plan (8 Items)

1. **SEO Content Pages** - Landing pages for: energy bill disputes, flight delay compensation, gym cancellation, council tax challenge, debt collection response. Each with proper H1, meta tags, CTA.
2. **Referral Mechanic** - Free month of Essential per referred paying subscriber. Unique links, DB tracking, Stripe reward automation.
3. **Conversion-Optimised Homepage** - Lead with value prop, live stats counters (letters generated, money claimed, subs tracked), strong free CTA.
4. **Use-Case Landing Pages** - Separate pages for paid ad traffic: /energy-bill-dispute, /flight-delay-compensation, /cancel-subscriptions, /debt-collection-response, /council-tax-challenge.
5. **OG Image** - Default 1200x630px branded image for social sharing.
6. **Google Search Console** - Verification, sitemap submission, request indexing.
7. **Homepage Stats Counter** - Live from Supabase: total letters, money claimed, subscriptions tracked.
8. **Structured Data** - FAQPage, SoftwareApplication, BreadcrumbList JSON-LD schemas.

Taylor (CMO) and Jordan (Head of Ads) agent prompts updated with these priorities.

---

## AI Agent Team (14 Agents)

| # | Name | Role | Schedule | Model |
|---|------|------|----------|-------|
| 1 | Alex | CFO | 3x daily (7am, 1pm, 6pm) | Haiku |
| 2 | Morgan | CTO | 3x daily (8:30am, 2:30pm, 7:30pm) | Haiku |
| 3 | Jamie | CAO | 3x daily (8am, 12pm, 5pm) | Haiku |
| 4 | Taylor | CMO | 3x daily (7:30am, 1:30pm, 5:30pm) | Haiku |
| 5 | Jordan | Head of Ads | 3x daily (8am, 2pm, 8pm) | Sonnet |
| 6 | Casey | CCO (Content) | Daily 7am | Sonnet |
| 7 | Drew | CGO (Growth) | Daily 8am | Sonnet |
| 8 | Pippa | CRO (Retention) | Every 6 hours | Sonnet |
| 9 | Leo | CLO (Compliance) | Daily 6am | Sonnet |
| 10 | Nico | CIO (Intelligence) | Weekly Monday 7am | Sonnet |
| 11 | Bella | CXO (Experience) | Daily 9am | Sonnet |
| 12 | Charlie | Exec Assistant | 7x daily | Sonnet |
| 13 | Sam | Support Lead | Every 30 mins | Haiku |
| 14 | Riley | Support Agent | Every 15 mins | Haiku |

---

## Outstanding Items

### Priority 0: REBUILD AGENTS AS PERSISTENT SUB-AGENTS (Critical)

**Current limitation:** Agents run as stateless serverless functions. Each meeting message is a fresh Claude API call with memory pasted into the prompt. This causes unreliable recall, no true conversation history, and no ability to work autonomously between runs.

**Solution:** Rebuild using the **Claude Agent SDK** running as persistent processes on a dedicated server.

**Architecture:**
- Host: Railway, Fly.io, or EC2 (not Vercel serverless)
- Each agent runs as a persistent process with its own conversation thread
- Agents communicate via message passing (Supabase Realtime or Redis pub/sub)
- True conversational memory within sessions, DB-backed long-term memory between sessions
- Agents can proactively check for tasks and work on them continuously, not just on cron
- Meeting room connects to live agent processes via WebSocket or SSE

**Implementation steps:**
1. Set up dedicated server (Railway recommended for simplicity)
2. Install Claude Agent SDK
3. Create persistent agent processes (one per agent or pooled)
4. Migrate meeting room to connect to live agents instead of one-shot API calls
5. Add inter-agent message bus for coordination
6. Keep existing cron-based reporting as a fallback/supplement

**What works today (interim):**
- Cron-based agent runs with task processing (agents do work on assigned tasks during scheduled runs)
- Meeting room with prompt-injected memory (unreliable but functional)
- Agent workflow system (tasks assigned, processed, results saved)
- Meeting history saved to DB

### Priority 1: Agent Autonomy and Persistent Memory (current interim system)
1. **Meeting persistence** - DONE: conversations saved to DB, summary emailed on end
2. **Agent memory** - DONE but limited: agent_memory table stores learnings, loaded into prompts
3. **Cross-agent tasks** - DONE: agent_tasks table, processed during cron runs
4. **Cross-agent autonomous actions** - Agents trigger actions on each other during cron runs:
   - Drew (CGO) detects inactive user > triggers Resend email automatically
   - Pippa (CRO) identifies churn risk > notifies Alex (CFO) and Drew (CGO)
   - Leo (CLO) finds compliance issue > notifies Morgan (CTO) to fix
   - Bella (CXO) ranks UX fix > creates improvement proposal for Morgan (CTO)
   - Casey (CCO) generates content > sends to Taylor (CMO) for review
   - Nico (CIO) spots competitor threat > alerts Taylor (CMO) and Jordan (Head of Ads)

### Priority 2: API Integrations Needed Per Agent

| Agent | APIs Needed | Status |
|-------|------------|--------|
| Casey (CCO) | fal.ai (Flux Pro images), Runway ML (Gen-3 video), Twitter API v2, LinkedIn Marketing API, TikTok Content API | Keys needed |
| Jordan (Head of Ads) | Google Ads API (connected), Meta Marketing API (needs Pixel ID) | Partially done |
| Drew (CGO) | Resend (already integrated for email sequences) | Ready |
| Pippa (CRO) | Resend (for personalised re-engagement emails), Stripe (for loyalty rewards) | Ready |
| Leo (CLO) | Web search API for regulatory monitoring (consider SerpAPI or Brave Search API) | Key needed |
| Nico (CIO) | Web search API for competitor monitoring, App Store API for review tracking | Key needed |
| Bella (CXO) | No external APIs needed (uses internal ticket and chatbot data) | Ready |

### Priority 3: Other Outstanding Items
1. **Google Search Console setup** (verification file, sitemap submission, request indexing)
2. **Marketing plan implementation** (8 items: SEO pages, referrals, landing pages, structured data)
3. Meta Ads setup (need Pixel ID)
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
