# CLAUDE.md — Paybacker AI Operating Manual
# Read this file at the start of every session. This is the single source of truth for the entire project.

---

## UNIFIED SYSTEM — READ FIRST

This project uses a unified system across **all** Claude / agent interfaces:
- **Claude Code** (terminal)
- **Cowork mode** (Claude Desktop's file-mode)
- **Claude in Chrome** (browser extension)
- **Google Antigravity** (if Claude is the configured model)
- **10 Claude Managed Agents** (platform.claude.com, run via Vercel cron)

All of them read this file. The single source of truth for "what is this project, where is it, what's safe to do" is **THIS DOCUMENT plus the `paybacker_core` Anthropic memory store** (memstore_01WHPRJQTEnDX4WUFpE4WkXc) which mirrors the same content.

### At the START of every interactive session (Code / Cowork / Chrome / Antigravity):

1. **You're reading CLAUDE.md right now** — this is the canonical context. Read all of it.
2. **Call `get_project_briefing` (paybacker MCP)** — one MCP call returns all shared-context files, git status, open PRs, and recent business_log rows. Fastest way to see what the last session / managed agents have been doing.
3. If the local stdio paybacker MCP is unavailable in this interface, fall back to:
   - Reading `shared-context/active-sessions.md`, `shared-context/handoff-notes.md`, `shared-context/task-queue.md`
   - `gh pr list -R airpau/lifeadmin-ai --state open`
   - Querying `business_log` (last 24h) via Supabase MCP if you have it
4. **Read the latest agent-digest** — the system fires digests at 07:00 / 12:30 / 19:00 UTC into the founder's Telegram. The same content is in `business_log` rows from `created_by IN ('digest-compiler', 'agent-digest')` plus structured findings from each managed agent.

### Managed-agent memory layer (separate from this file, automatic)

Managed agents on platform.claude.com get **two memory stores attached at session-runtime** via the Paybacker MCP credential vault:

- **`paybacker_core`** (read-only, shared across all 10 agents) — 11 markdown files: 00-overview, 01-product, 02-pricing, 03-tech-stack, 04-deployment-safety, 05-agent-roster, 06-operating-principles, 07-features-detail, 08-data-model, 09-current-state (with verified-facts + confabulation guardrail), 10-coming-soon. Source: `supabase/memory-seeds/paybacker_core/*.md`.
- **`<agent-name>` per-role** (read-write) — each agent has its own store with `00-role.md` (mission) and `01-tools.md` (specific MCP tools and workflow). Plus any `learning` / `decision` files the agent has persisted.

Memory store IDs live in `src/lib/managed-agents/memory-stores.json`. Re-bootstrap via `npx tsx scripts/bootstrap-managed-agents-memory.ts` (idempotent — reuses existing store ids).

### At the END of every interactive session:

1. Call `log_session` (paybacker MCP) to record what you did
2. Call `log_handoff` (paybacker MCP) with summary and next steps for the next chat
3. Update `shared-context/task-queue.md` with any new/completed tasks
4. Append a `business_log` row via the public MCP `append_business_log` tool so the digest cron sees your work (use `created_by='cowork-session'` or `created_by='code-session'` or your tooling identifier)
5. Commit and push all changes

### The two MCP servers — know which is which

- **Local stdio MCP** at `/mcp-server/`. Used by Cowork mode and Claude Code on this machine. Has every tool including `git_push`, `post_to_facebook`, `get_project_briefing`, etc. Configured in your local Claude Desktop / Code MCP config.
- **Public HTTP MCP** at `https://paybacker.co.uk/api/mcp` (v2.2.0, 27 tools). Used by managed agents on platform.claude.com (auth via Bearer token in the credential vault). Hardened: rate-limited, allowlisted Supabase tables, no destructive tools, no social-media posting, no money moves. Tools include `get_finance_snapshot`, `list_github_issues`, `get_pr_diff`, `read_nps_responses`, `inspect_recent_complaint_letters`, `get_posthog_funnel`, `get_vercel_deployment_status`, `get_stripe_webhook_health`, `append_business_log`, `post_to_telegram_admin`, etc.

### Source of truth contradictions

If `paybacker_core` memory contradicts this CLAUDE.md, **memory wins** (it's updated more frequently via the Anthropic API). If both contradict live Supabase data, **live data wins**. If you spot the contradiction, write a `business_log` row with category='agent_governance' so the founder can reconcile.

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

_Updated 2026-04-22 after Emma-matched tier review — see
`src/lib/plan-limits.ts` for the authoritative matrix._

**Free — £0:**
- 2 bank connections with daily auto-sync
- 1 email connection with 30-min Watchdog dispute-reply polling
- Unlimited dispute thread links (email-thread monitoring)
- 3 AI letters per month
- Unlimited manual subscription tracking
- Basic spending overview (top 5 categories)
- Pocket Agent (Telegram bot)
- AI chatbot

**Essential — £4.99/month or £44.99/year:**
- 3 bank connections with daily auto-sync
- 3 email connections with 30-min Watchdog polling
- Unlimited AI letters
- AI cancellation emails with legal context
- Renewal reminders (30/14/7 days)
- Full spending intelligence dashboard with all 20+ categories
- Money Hub Budgets + Savings Goals
- Price-increase alerts via email
- Contract end-date tracking
- Pocket Agent (Telegram bot)

**Pro — £9.99/month or £94.99/year:**
- Unlimited bank connections
- Unlimited email connections
- Everything in Essential
- Money Hub Top Merchants
- Price-increase alerts via Telegram (instant)
- Export (CSV / PDF)
- Paybacker Assistant (MCP integration)
- Full transaction-level analysis
- Priority support
- On-demand bank sync (manual refresh)
- Automated cancellations (coming soon)

### System rules (tier logic)
- Paid tiers are **never auto-demoted**. `/api/stripe/sync` promotes
  only. Demotion is webhook-driven (`customer.subscription.deleted`).
- **No 14-day Pro trial** — it produced silent downgrades at expiry.
  `TrialBanner` still flags an active trial when `trial_ends_at` is
  explicitly set, but we don't grant trials automatically on signup.
- `getEffectiveTier(userId)` trusts `profile.subscription_tier` as
  source of truth. Single override: an active onboarding trial
  (`trial_ends_at > now() && !trial_converted_at && !trial_expired_at`)
  returns `'pro'` for the trial window.
- Bank/email caps are enforced at the connect endpoints
  (`/api/auth/truelayer`, `/api/auth/google`, `/api/auth/microsoft`,
  `/api/auth/yapily`) reading `PLAN_LIMITS[tier].maxBanks` /
  `maxEmails`. Over-cap attempts return 403 (bank APIs) or redirect
  to `/dashboard/profile?email_limit_reached=1` (OAuth flows).

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
6. **ALL agent output is stored in Supabase** (`executive_reports`, `agent_runs`, or `business_log`) so status is auditable from SQL. Managed agents call `append_business_log` every session; the digest cron at 07:00 / 12:30 / 19:00 UTC surfaces escalated rows to the founder via Telegram.
7. **Content drafting requires founder approval before any post or send.** Inherited from the original Casey (CCO) rule and now enforced by `email-marketer` (managed agent) which DRAFTS only — drafts land in `content_drafts` / `email_drafts` with `status='pending'`. Never auto-post without approval.
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

### Git Lock Prevention
- NEVER run multiple git operations on the main working directory simultaneously
- Always use git worktrees for parallel code tasks (Claude Code does this automatically)
- If you encounter a .git/index.lock error, check if the lock file is stale (> 5 min old) and remove it
- Never force-remove a fresh lock file — another operation may be in progress
- Use `scripts/git-safe.sh <git-args>` in scripts instead of calling git directly
- See `.claude/worktree-config.json` for full lock policy details

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
- Free: 2 banks with daily auto-sync. Essential: 3 banks with daily auto-sync. Pro: unlimited banks + on-demand manual sync.

### 4. Email Inbox Scanning
- Connect Gmail or Outlook (read-only, Google OAuth verified)
- Scans up to 2 years of email history
- Opportunity Scanner: finds overcharges, forgotten subscriptions, flight delay opportunities, debt disputes
- Smart action buttons: Add to Subscriptions, Write Complaint Letter, Claim Compensation, Create Task, Dismiss
- Free: 1 email account with 30-min auto-sync for dispute replies. Essential: 3 email accounts. Pro: unlimited.

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

## AI AGENT TEAM — HONEST STATE (last overhauled 25 April 2026)

This section was rewritten on 25 April 2026 after migrating from the dormant Railway-hosted "executive" agents to **Claude Managed Agents with native memory** (public-beta feature, beta header `managed-agents-2026-04-01`).

The 14 legacy executives (Casey, Charlie, Sam, Alex, Jordan, Morgan, Jamie, Taylor, Drew, Pippa, Leo, Nico, Bella, Finn) are **decommissioned**. Their `ai_executives.status` is `disabled` (migration `20260425000000_decommission_legacy_executives.sql`). Their high-importance learnings have been seeded into the new managed agents' memory stores. Their historical `executive_reports` rows remain for audit; do not cite anything dated after 5 April 2026 from them — there isn't any.

When writing about agents, always check `agent_runs`, `executive_reports`, and `business_log` before stating an agent's status. Configured ≠ firing.

### Layer 1 — User-facing workers (do not modify without founder approval)

| Worker | Trigger | Source | What it does |
|---|---|---|---|
| `complaint_writer` | On-demand (user clicks) | `src/app/api/complaints/generate/route.ts` | UK-legislation-cited complaint letters |
| `riley-support-agent` | Vercel cron `*/15` | `src/app/api/cron/support-agent/route.ts` | Support ticket auto-response |

### Layer 2 — Claude Managed Agents (active, with memory)

Ten agents on `platform.claude.com`. Each session is created by `/api/cron/managed-agents` (Vercel cron, hourly at :00, filtered by `agentsDueAt()`) with two memory stores attached: shared read-only `paybacker_core` + per-role `read_write`. Memory is provisioned via `scripts/bootstrap-managed-agents-memory.ts`; resulting store ids live in `src/lib/managed-agents/memory-stores.json`.

| Agent | Schedule (UTC) | Mission |
|---|---|---|
| `alert-tester` | `0 */6 * * *` | Monitor MCP server health + error logs |
| `digest-compiler` | `0 7,12,17,20 * * *` | Synthesise activity into handoff-notes |
| `support-triager` | `0 */6 * * *` | Triage tickets, queue priorities |
| `email-marketer` | `0 8 * * *` | Draft lifecycle emails (pending founder approval) |
| `ux-auditor` | `0 9 * * *` | Analyse friction patterns |
| `feature-tester` | `0 10 * * *` | Verify critical user flows |
| `finance-analyst` | `0 11 * * *` | Track MRR / churn / tier mix / Stripe webhook health |
| `bug-triager` | `0 */12 * * *` | Categorise issues + recommend fixes |
| `reviewer` | `0 */12 * * *` | Check open PRs against CLAUDE.md rules |
| `builder` | on-demand only | Pick top dev task, draft PR (founder reviews) |

`finance-analyst` calls the MCP `get_finance_snapshot` tool which returns paying-user counts by tier, MRR/ARR estimate, signups (7d/30d), active trials, trial conversions/expiries, plan_downgrade_events, expiring subscriptions, and upcoming payments. Test accounts (`test+%`, `googletest%`, `%@example.com`) are excluded automatically.

Every session ends by calling the paybacker MCP `append_business_log` tool, recording category + title + content + agent name. The digest cron `/api/cron/agent-digest` reads that table at 07:00, 12:30, and 19:00 UTC and posts a consolidated Telegram summary to `TELEGRAM_FOUNDER_CHAT_ID`.

For interventions that can't wait for the next digest, agents call the MCP `post_to_telegram_admin` tool. Severity `recommend|warn|critical` requires a non-empty `ask` field — the tool refuses without one.

### Layer 3 — Intelligence crons (preserve)

| Cron | Schedule | Purpose |
|---|---|---|
| `/api/cron/discover-features` | Daily 02:00 | Scans `src/` for new routes |
| `/api/cron/analyze-chatbot-gaps` | Mon 06:00 | Groups unanswered chatbot questions |
| `/api/cron/daily-ceo-report` | Daily | CEO summary email |
| `/api/cron/aggregate-provider-intelligence` | Sun 00:00 | Provider competitive analysis |

### Layer 4 — DECOMMISSIONED (do not cite, do not restart)

Casey, Charlie, Sam, Alex, Jordan, Morgan, Jamie, Taylor, Drew, Pippa, Leo, Nico, Bella, Finn. `ai_executives.config.replaced_by` records which managed agent absorbed each role.

### Disabled systems

- **Railway agent-server** — legacy, disabled 5 April 2026. Do not restart.
- **`/api/cron/executive-agents`** — returns `{status: 'deprecated'}`. Do not wire anything to it.

### Memory layer (Anthropic public beta, April 2026)

- 10 memory stores: 1 shared `paybacker_core` (read-only product/architecture/safety facts) + 9 per-role (read-write).
- Static seeds in `supabase/memory-seeds/<store-name>/*.md`. Bootstrap script reads these plus high-importance `agent_memory` rows from the legacy roles each managed agent absorbs.
- Re-seed by running `npx tsx scripts/bootstrap-managed-agents-memory.ts` (idempotent — reuses existing store ids on re-runs).
- Per-file 100 KB cap. Per-session up to 8 stores.
- Inspect / export via the Anthropic Console memory-store API; redact sensitive content via `memories.versions.redact`.

### Rules for agents going forward

1. Before describing an agent as "running", verify with `agent_runs`, `executive_reports`, or `business_log`.
2. New agents must be registered in `vercel.json` with an explicit cron schedule — otherwise they are dormant by default.
3. All agent output must land in Supabase (`executive_reports`, `agent_runs`, or `business_log`) so status is auditable from SQL. Managed agents call `append_business_log` every session.
4. Never modify `complaint_writer` or Riley without explicit user approval — these are the two workers actually serving users.
5. Managed agents are observe-and-recommend only. Code changes go through Builder which opens a PR; the founder approves merges. No auto-execution of code, content, or production data changes.
6. When in doubt, ask before you build.

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
- All posts must include a free signup CTA: "Sign up free at paybacker.co.uk" or "Try it free at paybacker.co.uk"
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
`NEXT_PUBLIC_WAITLIST_MODE=false` — site shows free trial buttons (live mode). Waitlist mode is disabled.

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
