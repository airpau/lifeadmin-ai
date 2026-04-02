# CLAUDE.md — Paybacker AI Operating Manual
# Read this file at the start of every session. This is the single source of truth for the entire project.

---

## UNIFIED SYSTEM — READ FIRST

This project uses a unified system across three Claude interfaces (Code, Desktop, Browser Extension). At the START of every session:

1. Read `shared-context/active-sessions.md` to see what other interfaces have done
2. Read `shared-context/handoff-notes.md` for the latest handoff
3. Read `shared-context/task-queue.md` for current priorities
4. Check `gh pr list -R airpau/lifeadmin-ai --state open` for developer agent PRs
5. Check `business_log` table in Supabase for recent agent activity

At the END of every session:
1. Update `shared-context/active-sessions.md` with what you did
2. Append to `shared-context/handoff-notes.md` with summary and next steps
3. Update `shared-context/task-queue.md` with any new/completed tasks
4. Update `business_log` table so AI agents have current context
5. Commit and push all changes

The MCP server at `/mcp-server/` provides tools for all interfaces to read/write shared context, post to social media, check infrastructure, and manage tasks.

---

## CRITICAL — READ THIS FIRST

This project has an existing production codebase with real users and live data. Before making ANY change:

1. Audit what already exists — never assume something needs to be built if it might already exist
2. Never use DROP TABLE or ALTER TABLE to remove columns under any circumstances
3. Always use CREATE TABLE IF NOT EXISTS for any new tables
4. All database changes must be written as migration files in /supabase/migrations
5. New agents are additive only — never modify existing agent files
6. When in doubt, ask before you build
7. The existing codebase is sacred — new features must never break what already works

---

## PRODUCT OVERVIEW

**Company:** Paybacker LTD (UK registered)
**Website:** paybacker.co.uk
**Founded:** March 2026
**Contact:** hello@paybacker.co.uk

Paybacker is an AI-powered savings platform for UK consumers. It helps people dispute unfair bills, track every subscription and contract, scan their bank account and email inbox for hidden costs, and take control of their finances. The AI generates professional complaint letters citing exact UK consumer law in 30 seconds.

**Target audience:** UK consumers aged 25-50, tech-savvy professionals who are time-poor and overpaying on bills without realising it.

---

## PRICING

**Free:**
- 3 AI letters per month
- Unlimited manual subscription tracking
- One-time bank scan
- One-time email inbox scan
- One-time opportunity scan
- Basic spending overview (top 5 categories)
- AI chatbot

**Essential — £4.99/month or £44.99/year (Founding Member Pricing):**
- Unlimited AI letters
- 1 bank account with daily auto-sync
- Monthly email and opportunity re-scans
- Full spending intelligence dashboard
- Cancellation emails with legal context
- Renewal reminders (30/14/7 days)
- Contract end date tracking

**Pro — £9.99/month or £94.99/year (Founding Member Pricing):**
- Everything in Essential
- Unlimited bank accounts
- Unlimited email and opportunity scans
- Full transaction-level analysis
- Priority support
- Automated cancellations (coming soon)

---

## TECH STACK

- **Framework:** Next.js 15, React, TypeScript, Tailwind CSS
- **Database:** Supabase (PostgreSQL + Auth)
- **AI:** Claude API (complaint letters, chatbot, email scanning, agent intelligence)
- **Billing:** Stripe
- **Email:** Resend
- **Open Banking:** TrueLayer
- **Hosting:** Vercel Pro
- **Analytics:** PostHog
- **Image/Video Generation:** fal.ai (primary), Runway ML (backup)
- **Social Posting:** Late API (getlate.dev) — ALL platforms via one integration
- **Web Research:** Perplexity API (used by Leo and Nico agents)
- **IP Intelligence:** ipapi.co (used by Finn agent)

---

## CRITICAL ARCHITECTURE RULES — NEVER VIOLATE THESE

1. **ALL image and video generation goes through fal.ai only.** Never integrate directly with OpenAI image generation, Stability AI, Midjourney, or any other image/video API. One fal.ai key accesses everything.
2. **ALL social media posting goes through Late API (getlate.dev) only.** Never build direct integrations with Meta Graph API, TikTok Content Posting API, LinkedIn Marketing API, or X/Twitter API. Late handles all platforms via one endpoint.
3. **ALL real-time web research by agents uses Perplexity API.** Not web scraping, not Google Search API, not Bing — Perplexity only.
4. **ALL product analytics and funnel tracking uses PostHog.** Never add Google Analytics or Mixpanel.
5. **ALL transactional and lifecycle emails use Resend.** Already integrated — never add SendGrid, Mailchimp, or any other email provider.
6. **ALL agent output is stored in the agent_reports Supabase table** and included in Charlie's daily digest email to the founder.
7. **Casey (CCO) requires founder approval before any content is posted.** Approve/reject links in the digest email update content_drafts.status. Never auto-post without approval.
8. **Never expose API keys in client-side code.** All API calls to external services must be server-side only.

## Project Structure
```
src/
├── app/
│   ├── page.tsx                    # Waitlist landing page
│   ├── layout.tsx                  # Root layout
│   ├── api/
│   │   ├── waitlist/route.ts       # Waitlist form submission
│   │   ├── webhooks/stripe/route.ts # Stripe webhooks
│   │   └── agents/                 # AI agent endpoints
│   ├── dashboard/                  # User dashboard (post-launch)
│   └── auth/                       # Authentication pages
├── components/                     # React components
├── lib/
│   ├── supabase/                   # Supabase client & helpers
│   ├── stripe/                     # Stripe configuration
│   ├── claude/                     # Claude API helpers
│   └── resend/                     # Email helpers
└── types/                          # TypeScript types
```

## Development Conventions

### Code Style
- Use TypeScript for all files
- Use 'use client' directive only when necessary (forms, interactive components)
- Server Components by default
- Functional components with hooks
- Import aliases: @/ for src directory

### Component Patterns
- Extract reusable UI into components/ui/
- Co-locate component-specific logic
- Use Server Actions for form submissions where possible
- Validate all user input with Zod or similar

### API Routes
- Use Next.js App Router API routes (route.ts)
- Return proper HTTP status codes
- Include error handling and validation
- Use TypeScript types for request/response

### Database (Supabase)
- Row-level security (RLS) enabled on all tables
- Use Supabase client from @supabase/ssr for server-side
- Use @supabase/auth-helpers-nextjs for auth
- Migration files in supabase/migrations/

### Environment Variables
```env
# Core
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_AGENTS_API_KEY=       # Separate key for AI agent cost tracking
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=

# Content Generation (Casey)
FAL_KEY=                        # fal.ai/dashboard
RUNWAY_API_KEY=                 # app.runwayml.com/account/api-keys

# Social Media Posting (Casey) — all platforms via one key
LATE_API_KEY=                   # getlate.dev/dashboard

# Product Analytics (Drew)
POSTHOG_API_KEY=                # app.posthog.com/project/api-keys
POSTHOG_HOST=https://app.posthog.com

# Real-time Web Research (Leo + Nico)
PERPLEXITY_API_KEY=             # perplexity.ai/settings/api

# IP Fraud Detection (Finn)
IPAPI_KEY=                      # ipapi.co/account (free tier available)
```

### AI Agent Guidelines
- Use Claude 3.5 Sonnet for letter writing and decision-making
- Always cite UK consumer law (Consumer Rights Act 2015, etc.)
- Generate professional, formal complaint letters
- Include specific UK regulatory references (Ofcom, Ofgem, etc.)
- Save all AI interactions for audit trail

### Design System
- Dark, premium aesthetic (target: affluent UK professionals)
- Tailwind CSS utility classes
- Color palette: Deep navy, gold accents, white text
- Typography: Clean, modern sans-serif
- UK-specific copy (£ symbols, British spelling)

### Git Workflow & Deployment Safety
- Main branch is production — every commit is a backup point
- Feature branches: feature/description
- Commit messages: Conventional Commits format
- Always include Co-Authored-By: Claude when pair programming

### CRITICAL: Deployment Safety Rules
1. **NEVER deploy without a clean git state** — all changes must be committed before deploying
2. **ALWAYS run `npx tsc --noEmit` before deploying** — zero type errors required
3. **Tag releases before major deploys** — `git tag v[date]-[description]` for easy rollback
4. **If a deploy breaks something** — revert immediately with `vercel rollback` or `git revert`
5. **Database migrations are additive only** — never DROP columns/tables in production, only ADD
6. **Test API routes locally before deploying** — especially agent changes
7. **The AI proposal system must NEVER auto-execute code changes** — only config/prompt/schedule changes can auto-execute; code changes create GitHub issues for human review

---

## CORE FEATURES

### 1. AI Complaint and Form Letters
- Generates formal complaint letters in 30 seconds
- Cites exact UK legislation: Consumer Rights Act 2015, Consumer Credit Act 1974, EU261/UK261, Ofcom rules, Ofgem rules
- Covers: energy bill disputes, broadband complaints, debt dispute responses, parking charge appeals, flight delay compensation (up to £520), council tax band challenges, HMRC tax rebates, DVLA issues, NHS complaints, refund requests
- Free users get 3 letters per month, paid users get unlimited

### 2. Subscription Tracking
- Track every subscription, direct debit, and recurring payment in one dashboard
- Add manually or detect automatically via bank connection
- Shows monthly and annual spend totals

### 3. Bank Connection (Open Banking via TrueLayer)
- Securely connects bank accounts (read-only)
- Automatically detects all subscriptions and recurring payments
- Spending intelligence dashboard with 20+ categories
- Free: one-time scan. Essential: 1 bank with daily sync. Pro: unlimited banks

### 4. Email Inbox Scanning
- Connect Gmail or Outlook (read-only, Google OAuth verified)
- Scans up to 2 years of email history
- Opportunity Scanner: finds overcharges, forgotten subscriptions, flight delay opportunities, debt disputes
- Smart action buttons: Add to Subscriptions, Write Complaint Letter, Claim Compensation, Create Task, Dismiss
- Free: one-time scan. Essential: monthly. Pro: unlimited

### 5. AI Cancellation Emails
- Generates cancellation email citing UK consumer law for any subscription
- Provider-specific advice. Available on Essential and Pro plans

### 6. Renewal Reminders
- Email alerts at 30, 14, and 7 days before any contract renews. Essential and Pro plans.

### 7. Contract Tracking
- Contract type, start/end dates, term length, annual cost, interest rates, remaining balance, provider type, tariff, postcode, property details

### 8. Forms and Government Letters
- HMRC tax rebates, council tax challenges, DVLA issues, NHS complaints, parking appeals, flight compensation, debt disputes, refund requests

### 9. AI Support Chatbot
- Available on every page. Answers UK consumer rights questions. Escalates to human support via ticketing system.

### 10. Loyalty Rewards
- Points for every action. Tiers: Bronze, Silver, Gold, Platinum. Redeem for subscription discounts.

### 11. Money Hub Financial Intelligence Centre
- Complete financial dashboard with income tracking, spending intelligence, and net worth
- AI-powered transaction categorisation with user recategorisation
- Interactive monthly trends with hover tooltips
- Full budget planner with category-linked limits and email/push alerts
- Savings goals tracker with progress visualisation
- Financial Action Centre with email scan integration
- Guided walkthrough tour for new users
- Pro AI chatbot with dashboard customisation (pie charts, bar charts via conversation)
- Dynamic widget generation through AI conversation

---

## AI AGENT TEAM

All agents follow the same architectural pattern. Every agent must:
- Log run status and output to Supabase executive_reports table
- Feed output into Charlie's daily digest email
- Run on a defined schedule via cron
- Be built as a standalone file — never modify existing agent files

### EXISTING AGENTS — DO NOT MODIFY THESE

| Agent | Role | Schedule |
|-------|------|----------|
| Alex | CFO — financial reports | 3x daily |
| Morgan | CTO — tech health monitoring | 3x daily |
| Jamie | CAO — operations | 3x daily |
| Taylor | CMO — marketing strategy | 3x daily |
| Jordan | Head of Ads — advertising performance | 3x daily |
| Charlie | EA — compiles task list, emails founder | 7x daily |
| Sam | Support Lead — ticket triage | Every 30 mins |
| Riley | Support Agent — auto-responds to tickets | Every 15 mins |

### NEW AGENTS — BUILD AS NEW FILES ONLY

**Casey (CCO)** — daily 7am. Content calendar, fal.ai images/video, Late API posting, founder approval required.

**Drew (CGO)** — daily 8am. Funnel conversion, PostHog events, Resend behavioural email triggers.

**Pippa (CRO)** — every 6 hours. Activity scores, churn detection, loyalty tier management, monthly user summaries.

**Leo (CLO)** — daily 6am. Perplexity regulatory research, letter quality audits, GDPR checks, urgent compliance alerts.

**Nico (CIO)** — weekly Monday 7am. Perplexity competitor research, competitive_intelligence table, weekly report.

**Bella (CXO)** — daily 9am. Support ticket UX analysis, feature requests, weekly UX report to CTO, 90-day NPS surveys.

**Finn (CFraudO)** — daily + on signup. IP fraud checks via ipapi.co, abuse detection, over-limit flags.

---

## COMPETITORS

- **DoNotPay** — US-focused, not UK law specific
- **Resolver** — manual process, no AI
- **Emma** — subscription tracking only, no complaints
- **Snoop** — bill tracking, no legal letters

**Paybacker's advantage:** AI-powered letters citing exact UK legislation, combined with subscription tracking, bank scanning, and email scanning in one platform.

---

## COMING SOON

- Deal comparison and switching (energy, broadband, insurance) via Switchcraft API
- Automated cancellations
- Instagram posting (pending Meta app review)
- Self-learning from user feedback
- WhatsApp integration for budget alerts, dispute tracking, and complaint letters via chat
- Telegram integration for budget alerts, dispute tracking, and complaint letters via chat
- SMS notifications for urgent financial alerts (budget exceeded, contract expiring)
- Native mobile app (iOS and Android) with push notifications
- In-app push notifications for real-time budget tracking alerts
- Savings goal affiliate links — contextual deals matching user goals (holiday savings → travel deals, car fund → car finance, wedding → venue/service deals)
- Pro financial reports — automated email reports (daily/weekly/monthly) with budget progress, spending analysis, and savings tracking
- Smart budget alerts — email/SMS/push notifications when approaching or exceeding budget limits

---

## REVENUE STREAMS

1. Subscription revenue (primary): £4.99-9.99/month per user
2. Affiliate commissions (coming soon): earn per switch via comparison API partners
3. Awin Advertiser: paying influencers £1-4 per conversion

---

## SEO LANDING PAGES TO BUILD

- /dispute-energy-bill — "How to dispute an energy bill UK"
- /flight-delay-compensation — "Flight delay compensation claim UK" (up to £520)
- /cancel-gym-membership — "How to cancel gym membership UK"
- /council-tax-challenge — "Council tax band challenge UK"
- /debt-collection-letter — "Debt collection letter response UK"

Each needs: H1, meta title, meta description, Open Graph tags, JSON-LD schema markup, CTA to sign up free.

---

## MARKETING CONTEXT

**Core value proposition:** "Most UK households are being overcharged by £1,000+ a year. Paybacker finds it, disputes it, and cancels it in minutes."

**Primary acquisition channels:** Google Ads (live), influencer marketing via Awin, Reddit organic, SEO content.

**Referral programme:** Users get 1 free month of Essential per referred paying subscriber. Unique referral links tracked in Supabase.

---

## DATABASE TABLE SCHEMAS (new tables — use CREATE TABLE IF NOT EXISTS only)

```sql
CREATE TABLE IF NOT EXISTS content_drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT,
  asset_url TEXT,
  status TEXT DEFAULT 'pending',
  scheduled_time TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  performance_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  source TEXT,
  summary TEXT,
  severity TEXT DEFAULT 'info',
  actioned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competitive_intelligence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  competitor TEXT,
  finding_type TEXT,
  summary TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  score INTEGER,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Monetization Strategy
1. **Waitlist Phase**: Collect emails, validate demand
2. **MVP Launch**: £4.99/month subscription + 20% success fee on money recovered
3. **Scale**: Add more agent types (insurance, parking tickets, refunds)

## Key Metrics
- Waitlist signups
- Conversion rate (waitlist → paid)
- Monthly recurring revenue (MRR)
- Average money recovered per user
- Agent success rate (complaints upheld)

## UK Market Context
- Target: 25-45 year olds, urban professionals, tech-savvy
- Pain point: Rising bills, subscription fatigue, admin burden
- Competitors: DoNotPay (US-focused), Resolver (manual process)
- Advantage: Fully automated with AI, UK-specific regulations

## Social Media Posting — How It Works

### Current Setup (21 Mar 2026)
Social media posting is **admin-only infrastructure** — no user-facing UI. All routes require `CRON_SECRET` Bearer token.

**Facebook posting: WORKING ✅**
- Posts go to Facebook Page ID: `1056645287525328`
- Page Access Token stored in `META_ACCESS_TOKEN` env var (expires — needs refreshing periodically)
- Token is a **Page Access Token** (not user token) — obtained by exchanging user token via `/v18.0/{page_id}?fields=access_token`
- Token refresh: go to developers.facebook.com → Graph API Explorer → Get Page Access Token → exchange via API → update Vercel env

**Instagram posting: PENDING ✅**
- Blocked until Meta App Review completes (requires incorporation documents for business verification)
- Instagram account: @paybacker.co.uk (ID: 17841440175351137)
- Will work once Meta app is published (Development → Live mode)

**Manual posting workflow (until Instagram API works):**
1. Generate image: `uv run ~/.openclaw/skills/nano-banana-pro/scripts/generate_image.py --prompt "..." --filename "docs/social-images/name.png" --resolution 2K --api-key $GEMINI_API_KEY`
2. Check image for text errors before using
3. Post to Facebook via API (see src/lib/meta-social.ts)
4. Send image to Paul via Telegram for manual Instagram posting

**Brand guidelines for all posts:**
- Dark navy (#0f172a) background, gold (#f59e0b) accents
- NO TEXT in generated images (AI hallucinates garbled text)
- Always use `paybacker.co.uk` (NEVER paybacker.com)
- All posts must include pre-launch waitlist CTA: "Join the waitlist at paybacker.co.uk"
- GEMINI_API_KEY is set in Vercel and .env.local (hello@paybacker.co.uk Google account)

**Key files:**
- `src/lib/meta-social.ts` — Facebook + Instagram Graph API posting
- `src/lib/generate-image.ts` — Google Imagen 4 image generation
- `src/lib/storage.ts` — Supabase Storage upload (bucket: social-images)
- `src/app/api/social/post/route.ts` — publish approved post
- `src/app/api/social/approve/route.ts` — approve draft post
- `src/app/api/social/generate-image/route.ts` — generate image for post
- `src/app/api/cron/generate-social-posts/route.ts` — 8am daily post generation
- `src/app/api/cron/post-social/route.ts` — 10am daily auto-post

**Meta App credentials:**
- META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN, META_PAGE_ID, META_INSTAGRAM_ACCOUNT_ID — all set in Vercel

### Current Mode
`NEXT_PUBLIC_WAITLIST_MODE=true` — site shows waitlist CTAs instead of free trial buttons.
To disable: set `NEXT_PUBLIC_WAITLIST_MODE=false` in Vercel env and redeploy.

---

## Build Progress

### Phase 1: Foundation ✅
- [x] Scaffold Next.js app
- [x] Install dependencies
- [x] Create waitlist landing page
- [x] Supabase project live (id: kcxxlesishltdmfctlmo, eu-west-2)
- [x] Full DB schema deployed (profiles, waitlist_signups, tasks, agent_runs, subscriptions)
- [x] Auth (login/signup) pages
- [x] Dashboard layout + sidebar navigation

### Phase 2: Core Features ✅
- [x] Complaints AI agent (Claude 3.5 Sonnet, UK consumer law, saves to DB)
- [x] Complaints page with generate + history tabs
- [x] Opportunity Scanner page (mock data - needs Gmail integration)
- [x] Subscriptions page — real Supabase data, add/delete, AI cancellation emails
- [x] Dashboard overview (stats from DB)
- [x] Profile page
- [x] Pricing page (3 tiers: Free / Essential £4.99/mo / Pro £9.99/mo)
- [x] Stripe checkout + webhook API routes (need real price IDs)
- [x] Tasks history API (/api/tasks)
- [x] Subscriptions CRUD API (/api/subscriptions, /api/subscriptions/[id])
- [x] AI cancellation email API (/api/subscriptions/cancellation-email)

### Phase 3: Next Up
- [ ] Set ANTHROPIC_API_KEY in .env.local (required for complaints + cancellation emails)
- [ ] Set real Stripe price IDs (currently placeholders)
- [ ] Gmail OAuth integration (inbox scanner - real data)
- [ ] Deploy to Vercel + set up custom domain
- [ ] Launch waitlist campaign
