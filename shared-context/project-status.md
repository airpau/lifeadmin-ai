# Project Status

*Last updated: 2026-03-26*

## Overview
Paybacker is live at paybacker.co.uk in waitlist mode. Core product is built and functional. Stripe billing is live with founding member pricing. AI agent team (15 agents) running on Railway. Social media posting automated to Facebook and Instagram.

## Current Sprint
PRE-LAUNCH MODE (target launch: ~2 April 2026)
- Build ad campaigns in PAUSED state (Google Ads + Meta Ads)
- Build referral system, SEO content, daily metrics cron
- Bug fixes from UX review (38 bugs logged, fixing in priority order)
- Interactive chatbot Phase 1 implementation
- Pre-launch prep: influencer research, PR pitch drafting, MSE editorial outreach prep
- Awin affiliate integration testing (waiting Oscar sign-off)

## What's Live
- Landing page with waitlist signup
- Full auth flow (signup, login, password reset)
- Dashboard with sidebar navigation
- AI complaint letter generator (Claude 3.5 Sonnet, UK consumer law)
- Subscription tracking (CRUD, manual + bank-detected)
- AI cancellation emails with legal context
- Bank connection via TrueLayer (Open Banking)
- Email inbox scanning (Gmail OAuth)
- Opportunity scanner (overcharges, flight delays, forgotten subs)
- Money Hub financial intelligence dashboard
- Budget planner with category-linked limits
- Savings goals tracker
- Contract tracking with end dates and renewal reminders
- AI support chatbot on every page
- Support ticketing system with email inbound
- Loyalty rewards programme (Bronze/Silver/Gold/Platinum)
- Deals page with affiliate links (Awin, Lebara)
- Solutions pages (energy, broadband, mobile, insurance)
- SEO landing pages (dispute energy bill, flight delay, etc.)
- Blog with Perplexity-researched content
- Pricing page (Free / Essential 4.99 / Pro 9.99)
- Stripe checkout and billing portal
- Referral programme with unique links
- OG image for social sharing
- Dynamic sitemap
- Google Search Console verified
- UTM and gclid tracking on signup

## AI Agent Team (Railway)
| Agent | Role | Status |
|-------|------|--------|
| Alex | CFO | Running 3x daily |
| Morgan | CTO | Running 3x daily |
| Jamie | CAO | Running 3x daily |
| Taylor | CMO | Running 3x daily |
| Jordan | Head of Ads | Running 3x daily |
| Charlie | EA | Running 7x daily |
| Sam | Support Lead | Every 30 mins |
| Riley | Support Agent | Every 15 mins |
| Casey | CCO | Daily 7am + autonomous posting |
| Drew | CGO | Daily 8am |
| Pippa | CRO | Every 6 hours |
| Leo | CLO | Daily 6am |
| Nico | CIO | Weekly Monday 7am |
| Bella | CXO | Daily 9am |
| Finn | CFraudO | Daily + on signup |

## Integrations
- **Stripe:** Live mode, founding member prices, webhook processing
- **Supabase:** Full schema deployed, RLS enabled
- **TrueLayer:** Open Banking connected (DEV MODE — awaiting production approval)
- **Google OAuth:** Gmail inbox scanning (AWAITING VERIFICATION — submitted 24 Mar)
- **Resend:** Transactional emails + inbound
- **Meta:** Facebook + Instagram posting (system user token, never-expiring)
- **Awin:** Publisher 2825812, Advertiser 125502, S2S tracking
- **Google Ads:** Explorer access only (awaiting Basic upgrade). Dev token: jCSfgPvX1M1zrWb92a3Zyw. Customer ID: 390-589-8717. 2,880 ops/day limit.
- **Telegram:** Bot @PaybackerAssistantBot, Founder chat ID 1003645878
- **Perplexity:** Agent research + blog content
- **PostHog:** Product analytics
- **fal.ai:** Image generation for social posts

## Blocking Issues
## HARD BLOCKERS — must clear before launch (~2 April 2026)
1. **Google Ads API Basic access** — Explorer only, need Basic for campaign management at scale
2. **Google OAuth verification** — Submitted 24 March, pending (blocks Gmail scanning)
3. **TrueLayer production approval** — Blocks Open Banking features for real users

## Soft Blockers
4. Awin sign-off from Oscar (blocks founding member re-enable)
5. Meta App Review (blocks Instagram API in production mode)

## CRITICAL INSTRUCTION FOR CLAUDE CODE:
**Build ad campaigns and automation NOW, but set everything to PAUSED/DRAFT status. Nothing goes live until Paul explicitly approves after all 3 blockers are cleared.**
- Google Ads campaigns: Create in PAUSED state
- Meta Ads campaigns: Create in PAUSED state  
- Welcome emails: Build but don't trigger until real signups arrive
- Referral system: Build the infrastructure, don't promote yet
- All marketing automation: Build and test, but no live spend

## Key Metrics
- Users: 27 (1 real external)
- MRR: ~100 (test accounts)
- Waitlist: active collection
- Social posts: daily automated
- Agent runs: 100+ daily across all agents

## Automation System
### Cowork Scheduled Tasks (Pre-Launch Mode as of 26 Mar)
1. **Daily Morning Briefing** — 8:30am — Pre-launch prep tasks, blocker status updates
2. **Daily Social Media** — 10am — ACTIVE (brand awareness, continues through pre-launch)
3. **Midday Ad Monitor** — 12pm — PAUSED (no ads running yet)
4. **Weekly Performance Review** — Monday 9am — PAUSED (no ads to review yet)
5. **Influencer/PR Pipeline** — Wednesday 2pm — Research mode only: finding creators, drafting outreach
6. **Monthly P&L** — 1st of month 10am — Active

### Gmail Integration
- Connected: hello@paybacker.co.uk
- Active drafts: MSE pitch, Guardian Money pitch, BBC Money Box pitch, Which? pitch, Meaningful Money podcast pitch
- All PR drafts ready — DO NOT SEND until product is live and tested

### Claude Code Requirements (build NOW, all in PAUSED/DRAFT state)
- Google Ads: 3 search campaigns (CREATE PAUSED)
- Meta Ads: 2 conversion campaigns (CREATE PAUSED)
- Daily ad metrics logging cron (build it — will return empty until ads run)
- Weekly auto-optimisation cron (build it — won't fire until ads are live)
- Referral system upgrade (dual-sided £5 reward)
- 4 SEO blog articles (1500+ words — these CAN go live immediately)
- Signup attribution tracking (utm → user profile + business_log)

## Active Scheduled Tasks (Cowork)
1. **Daily Morning Briefing** — 8:30am — Tells Paul his tasks, reports metrics, drafts outreach emails
2. **Daily Social Media** — 10am — Auto-posts to Facebook + Instagram via MCP
3. **Midday Ad Monitor** — 12pm — Checks ad performance, flags issues, coordinates with Claude Code
4. **Weekly Performance Review** — Monday 9am — Full channel analysis, budget recommendations
5. **Influencer/PR Pipeline** — Wednesday 2pm — Tracks creator ROI, manages PR outreach, drafts follow-ups
6. **Monthly P&L** — 1st of month 10am — Full profit & loss, actuals vs forecast

## Gmail Integration
- Connected: hello@paybacker.co.uk
- Capability: Read incoming mail, create drafts for Paul to review/send
- Active drafts: Which? pitch, Meaningful Money podcast pitch, MSE Deals submission

## Claude Code Requirements (pending build)
- Daily ad metrics logging to Supabase + MCP (7am cron)
- Weekly auto-optimisation of Google Ads + Meta Ads (Monday 6am)
- Signup attribution tracking (utm params → user profile + business_log)
- Referral system
- Churn prevention emails

## Data Flow
Claude Code (6-7am: pull ad data, optimise) → MCP (data store) → Cowork (8:30am: read data, brief Paul, draft emails) → Paul (acts on briefing) → Gmail (outreach) → Cowork (monitors replies)

## £100K MRR Growth Model
- Starting budget: £5K/mo, reinvest 80% of MRR, cap at £18K/mo
- Ramp-up: M1=25%, M2=50%, M3=75%, M4+=100% efficiency
- Signups per £1: 0.52 (influencer-led)
- Conversion: 8.5% free-to-paid | Churn: 2.5% monthly
- Budget split: Influencers 40%, Google 20%, Meta 15%, TikTok 10%, SEO 10%, Tools 5%
- M12 projection: ~£69K MRR paid channels + £15K+ PR = £100K+ MRR
- Full model: paybacker-100k-mrr-execution-plan.xlsx
- 90-day ops plan: paybacker-90-day-operations-plan.xlsx
