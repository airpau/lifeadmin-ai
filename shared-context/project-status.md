# Project Status

*Last updated: 2026-03-26*

## Overview
Paybacker is live at paybacker.co.uk in waitlist mode. Core product is built and functional. Stripe billing is live with founding member pricing. AI agent team (15 agents) running on Railway. Social media posting automated to Facebook and Instagram.

## Current Sprint
- Awin affiliate integration testing (waiting Oscar sign-off)
- Founding member programme (paused during Awin testing)
- MCP server for cross-interface coordination
- ElevenLabs video content pipeline (planned)

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
- **TrueLayer:** Open Banking connected
- **Google OAuth:** Gmail inbox scanning
- **Resend:** Transactional emails + inbound
- **Meta:** Facebook + Instagram posting (system user token)
- **Awin:** Publisher + Advertiser accounts, S2S tracking
- **Google Ads:** Campaign running
- **Telegram:** Bot for founder notifications + agent triggering
- **Perplexity:** Agent research + blog content
- **PostHog:** Product analytics
- **fal.ai:** Image generation for social posts

## Blocking Issues
1. Awin sign-off from Oscar (blocks founding member re-enable)
2. Meta App Review (blocks Instagram API in production mode)
3. Google Ads developer token approval (blocks Jordan agent optimisation)

## Key Metrics
- Users: 27 (1 real external)
- MRR: ~100 (test accounts)
- Waitlist: active collection
- Social posts: daily automated
- Agent runs: 100+ daily across all agents
