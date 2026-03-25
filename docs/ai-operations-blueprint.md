# Paybacker AI Operations Blueprint

> Last updated: 25 March 2026

## Overview

Paybacker is an AI-powered savings platform for UK consumers. The system runs with 15 autonomous AI agents on Railway managing day-to-day operations, a full support ticketing system, email inbox scanning, an executive meeting room, a self-improving proposal system with one-click email approval, comprehensive contract tracking, Awin affiliate integration, and Google Ads integration. The platform is live at paybacker.co.uk with Google Ads driving traffic.

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

### Essential (£4.99/month or £44.99/year -- Founding Member Pricing)
- Unlimited complaint and form letters
- 1 bank account with daily auto-sync
- Monthly email inbox re-scans
- Monthly opportunity re-scans
- Full spending intelligence dashboard
- Cancellation emails citing UK consumer law
- Renewal reminders (30, 14, 7 days before)
- Contract end date tracking

### Pro (£9.99/month or £94.99/year -- Founding Member Pricing)
- Everything in Essential
- Unlimited bank accounts
- Unlimited email and opportunity scans
- Full transaction-level analysis
- Priority support
- Automated cancellations (coming soon)

### Founding Member Programme
- First 25 signups get Pro free for 30 days, no card required
- Currently paused for Awin testing, will be re-enabled after Oscar sign-off
- Expiry cron runs daily at 8am, sends reminders at 7/3/1 days before expiry, downgrades to free after 30 days
- All user data preserved on downgrade

### Upgrade Psychology
- Free to Essential: one-time scans go stale, user wants daily sync and monthly re-scans. Hit 3-letter limit, want unlimited.
- Essential to Pro: want multiple bank accounts (families), unlimited scans, transaction detail.

---

## AI Executive Team (15 Agents on Railway)

All agents run on Railway (agent-server/), not Vercel cron. All use Haiku for cost efficiency ($0.10 budget cap per run). Only Charlie can email the founder. Riley and Drew have had email permissions removed (were sending unsolicited emails).

| Role | Name | Schedule | Emails To |
|------|------|----------|-----------|
| CFO | Alex | 3x daily (7am, 1pm, 6pm) | DB only |
| CTO | Morgan | 3x daily (8:30am, 2:30pm, 7:30pm) | DB only |
| CAO | Jamie | 3x daily (8am, 12pm, 5pm) | DB only |
| CMO | Taylor | 3x daily (7:30am, 1:30pm, 5:30pm) | DB only |
| Head of Ads | Jordan | 3x daily (8am, 2pm, 8pm) | DB only |
| CCO (Content) | Casey | Daily 7am | DB only |
| CGO (Growth) | Drew | Daily 8am | DB only (email removed) |
| CRO (Retention) | Pippa | Every 6 hours | DB only |
| CLO (Compliance) | Leo | Daily 6am | DB only |
| CIO (Intelligence) | Nico | Weekly Monday 7am | DB only |
| CXO (Experience) | Bella | Daily 9am | DB only |
| Exec Assistant | Charlie | 7x daily (7,9,11,1,3,5,7) | hello@paybacker.co.uk |
| Support Lead | Sam | Every 30 mins | DB only |
| Support Agent | Riley | Every 15 mins | DB only (email removed) |
| CFraudO | Finn | Daily + on signup | DB only |

**Separate API key:** `ANTHROPIC_AGENTS_API_KEY` for all agent calls, tracks AI staff costs separately from user-facing costs.

### Agent Responsibilities

**Alex (CFO):** MRR, ARR, API costs, revenue margins, tier distribution, financial recommendations.

**Morgan (CTO):** Agent success rates, API errors, cost efficiency, infrastructure recommendations.

**Jamie (CAO):** User growth, onboarding rates, feature adoption, churn signals, waitlist conversion.

**Taylor (CMO):** Social media performance, waitlist funnel, deal clicks, user acquisition, content recommendations.

**Jordan (Head of Ads):** Google Ads performance, signup attribution, CPA tracking, budget recommendations, campaign optimisation. Google Ads API fully connected (developer token, OAuth, customer ID).

**Charlie (Exec Assistant):** Reads ALL other agents' reports, checks support tickets, monitors metrics, scans for expiring contracts, compiles numbered task list for Paul 7x daily.

**Sam (Support Lead):** Triages tickets every 30 minutes, flags urgent/overdue, adjusts priorities, escalates to human.

**Riley (Support Agent):** Auto-responds to simple tickets every 15 minutes, escalates complex ones. Email permissions removed (was sending unsolicited emails).

**Casey (CCO):** Content calendar, fal.ai image/video generation, Late API posting, founder approval required before posting.

**Drew (CGO):** Funnel conversion analysis, PostHog events, behavioural email triggers. Email permissions removed (was sending unsolicited emails).

**Pippa (CRO):** Activity scores, churn detection, loyalty tier management, monthly user summaries.

**Leo (CLO):** Perplexity regulatory research, letter quality audits, GDPR checks, urgent compliance alerts.

**Nico (CIO):** Perplexity competitor research, competitive_intelligence table, weekly report.

**Bella (CXO):** Support ticket UX analysis, feature requests, weekly UX report to CTO, 90-day NPS surveys.

**Finn (CFraudO):** IP fraud checks via ipapi.co, abuse detection, over-limit flags.

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
4. **AI Team:** All 15 agents, status, reports, pause/resume, Run Now

### "Call a Meeting" Button
Full-screen boardroom: type a message, all 6 executive agents respond in character using Sonnet. "Make this a proposal" button on every agent message.

---

## Email Scanning (PENDING GOOGLE OAUTH)

Google OAuth verification submitted 24 March 2026. Until approved, email scanning shows "unverified app" warning (100 user cap). Available to all tiers (one-time for free, monthly for Essential, unlimited for Pro).

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

## Contract Tracking (UI LIVE)

16 categories of subscriptions (was 7). Subscriptions page now has full contract fields: type, end date, provider type, tariff, auto-renew. Collapsible "Contract Details" section in add/edit forms. "Renewing within 90 days" summary card with countdown badges. "Find Better Deal" button links to relevant /deals/ page.

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

## Deals System (LIVE)

59 affiliate deals across 9 categories. Awin publisher ID: 2825812.

### Awin Integration (Fully Working)
- Mastertag, S2S (awaited in webhook), client-side tracking, fallback pixel all live
- Both client-side and S2S fire with same transaction ref (sub-{subscription_id})
- Amounts sent as actual sale value (£4.99/£9.99), commission group rate handles percentage
- AWC cookie captured in middleware, passed through Stripe checkout metadata
- Oscar from Awin testing and signing off
- Lebara Mobile approved: 3 deals with promo codes (LEBARA5, LEBARA10, SAVE50)

### Categories
Energy (5), Broadband (10), Mobile (16), Insurance (6), Mortgages (5), Credit Cards (4), Loans (5), Car Finance (2), Travel (6)

### Revenue Strategy
1. **Affiliate deals:** 59 deals via Awin publisher account. Commission rates documented in docs/awin-commission-rates.md
2. **Awin Advertiser:** Influencer acquisition (£1 per signup, £2 Essential, £4 Pro)
3. **Subscription revenue:** £4.99-£9.99/month per user (founding member pricing)

### Deal Emails (LIVE)
- Targeted deal emails: Wed + Fri 9am, personalised by opportunity score
- Weekly deal alerts: identifies switchable subscriptions from bank data
- Both use bank scan + email scan data for personalisation

### Landing Pages (LIVE)
- 9 deal category pages at /deals/[category] (fixed await params for Next.js 16)
- 8 feature solution pages at /solutions/[slug] (fixed await params for Next.js 16)
- All 17 pages live and working (were 404, now fixed)
- Full sitemap at /sitemap.xml (dynamic, auto-includes blog posts from database)

---

## Advertising

### Google Ads
- Search campaign live (launched 23 March 2026)
- Budget: ~£10.60/day (~£322/month)
- Keywords: complaint letters, energy disputes, subscription tracking, debt disputes, flight compensation, parking appeals
- Conversion tracking: signup page + checkout page configured
- API fully connected: developer token, OAuth2, refresh token, customer ID
- Jordan (Head of Ads) monitors performance 3x daily

### Meta Pixel (LIVE)
- Pixel ID: 722806287584909
- Tracks Lead (signup) and Purchase (subscription) events

### Meta Ads
- Not yet launched
- Ad copy drafted: 3 variations (complaint angle, subscription angle, money recovery angle)

---

## Content Pages

- `/about` - What Paybacker is, how it works, trust and transparency
- `/blog` - Index with article cards, dynamic from Supabase blog_posts table
- `/blog/are-you-overpaying-on-energy` - Energy price cap guide (800 words)
- `/blog/broadband-contract-ended` - Broadband switching guide (800 words)
- `/privacy-policy` - Full UK GDPR privacy policy
- Header and footer links updated across all pages

### Blog System
- Automated publishing Mon/Wed/Fri at 7am via cron
- Dynamic blog posts from Supabase blog_posts table
- Sitemap auto-includes new posts

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
| NEXT_PUBLIC_AWIN_AFF_ID | Awin publisher affiliate links |
| NEXT_PUBLIC_META_PIXEL_ID | Meta Pixel (722806287584909) |
| IPAPI_KEY | IP fraud detection for Finn agent |
| PERPLEXITY_API_KEY | Web research for Leo + Nico agents |
| FAL_KEY | Image/video generation for Casey |
| LATE_API_KEY | Social media posting via Late API |
| POSTHOG_API_KEY | Product analytics for Drew |

---

## Stripe (LIVE MODE)

Both keys now live mode (pk_live_ and sk_live_). Webhook secret: whsec_uvlMiRed4Ky5LsWOHA5HLCzCwgsNm1zS

### Live Founding Member Price IDs
| Tier | Price ID | Amount |
|------|----------|--------|
| Essential Monthly | price_1TEsJe7qw7mEWYpyVIt4i2Iy | £4.99 |
| Essential Annual | price_1TEsJf7qw7mEWYpysxw2lnL3 | £44.99 |
| Pro Monthly | price_1TEsJf7qw7mEWYpy4alOarY6 | £9.99 |
| Pro Annual | price_1TEsJf7qw7mEWYpyJmrhcy8b | £94.99 |

---

## UTM Tracking (LIVE)

- UTM params + gclid captured as cookies in middleware on first landing
- Stored on profiles table on signup (utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, signup_source)
- signup_source auto-set to 'google_ads' if gclid present

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
| ai_executives | 15 agent definitions and config |
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
| blog_posts | Dynamic blog content |
| content_drafts | Casey social media drafts |
| compliance_log | Leo compliance findings |
| competitive_intelligence | Nico competitor research |
| nps_responses | Bella NPS survey data |
| agent_memory | Agent persistent memory |
| agent_tasks | Cross-agent task coordination |

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
- sitemap.xml generated at /src/app/sitemap.ts (dynamic, auto-includes blog posts)
- Open Graph tags added (title, description, image, locale en_GB)
- Twitter card tags added
- Canonical URLs set via metadataBase
- Keywords meta tag added
- robots meta set to index: true, follow: true
- Root cause of invisibility: /robots.txt was 404, which served a page containing noindex meta tag
- Structured data (JSON-LD): FAQPage, SoftwareApplication, BreadcrumbList schemas on landing pages

**Google Search Console (VERIFIED):**
- Verified via meta tag (verification code: uB2k37Gimef4Mgg5Owl5DbQgrilihlCLBLHafttoAv4)
- Sitemap submitted (dynamic, auto-includes blog posts from database)

**OG Image (LIVE):**
- Auto-generated 1200x630 via Next.js ImageResponse
- fal.ai/Imagen generated dark navy background with amber glow
- Shows on all social shares (WhatsApp, Facebook, Twitter, LinkedIn, etc.)

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

## AI Agent Team (15 Agents on Railway)

| # | Name | Role | Schedule | Model |
|---|------|------|----------|-------|
| 1 | Alex | CFO | 3x daily (7am, 1pm, 6pm) | Haiku |
| 2 | Morgan | CTO | 3x daily (8:30am, 2:30pm, 7:30pm) | Haiku |
| 3 | Jamie | CAO | 3x daily (8am, 12pm, 5pm) | Haiku |
| 4 | Taylor | CMO | 3x daily (7:30am, 1:30pm, 5:30pm) | Haiku |
| 5 | Jordan | Head of Ads | 3x daily (8am, 2pm, 8pm) | Haiku |
| 6 | Casey | CCO (Content) | Daily 7am | Haiku |
| 7 | Drew | CGO (Growth) | Daily 8am | Haiku |
| 8 | Pippa | CRO (Retention) | Every 6 hours | Haiku |
| 9 | Leo | CLO (Compliance) | Daily 6am | Haiku |
| 10 | Nico | CIO (Intelligence) | Weekly Monday 7am | Haiku |
| 11 | Bella | CXO (Experience) | Daily 9am | Haiku |
| 12 | Charlie | Exec Assistant | 7x daily | Haiku |
| 13 | Sam | Support Lead | Every 30 mins | Haiku |
| 14 | Riley | Support Agent | Every 15 mins | Haiku |
| 15 | Finn | CFraudO | Daily + on signup | Haiku |

---

## Completed Items (as of 25 March 2026)

- Agent system on Railway (15 agents, all running)
- Landing pages fixed (/solutions/ and /deals/ await params for Next.js 16)
- Meta Pixel installed (722806287584909)
- Google Search Console verified and sitemap submitted
- Structured data (JSON-LD) on landing pages
- Founding member programme built (currently paused for Awin testing)
- Contract tracking UI with 16 categories
- OG image (auto-generated 1200x630)
- Homepage stats counter (live from Supabase)
- UTM tracking (middleware cookies, stored on profiles)
- Onboarded_at fix
- Blog auto-publishing (Mon/Wed/Fri 7am)
- Awin integration fully working (mastertag, S2S, client-side, fallback pixel)

---

## Scanner Page

- Now shows bank connections with sync button (was just "Coming Soon")
- Email scanning still pending Google OAuth verification

---

## Mobile Navigation

Bottom nav: Home, Money Hub, Letters, Scanner, Subs (was Profile)

---

## Homepage

- Live stats counter (letters generated, subscriptions tracked from Supabase)
- Founding member banner (when active)
- Chatbot auto-engage teaser after 5 seconds

---

## Outstanding Items

### STILL OUTSTANDING
1. Re-enable founding member programme (after Oscar Awin sign-off)
2. Referral system frontend (backend built, no share UI)
3. Resend inbound MX for email-to-ticket
4. Charlie Telegram bot
5. Blog agent upgrade (Casey + Perplexity research)
6. Legal compliance monitoring (Leo CLO)
7. Page load speed optimisation
8. Instagram posting (pending Meta app review)
9. CJ Affiliate setup (British Gas)

### AWAITING EXTERNAL
1. **Oscar Awin sign-off** - testing and verifying tracking
2. **Google OAuth verification** - submitted 24 March 2026 for gmail.readonly scope. 3-5 business day review. Until approved, users see "unverified app" warning (100 user cap).
3. **Google Ads developer token basic access** - needed for full API capabilities
4. **Lebara campaign parameters from Michael** - for Lebara Mobile deals
