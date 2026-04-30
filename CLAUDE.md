# CLAUDE.md — Paybacker AI Operating Manual
# Read this file at the start of every session. This is the single source of truth for the entire project.

---

## UNIFIED SYSTEM — READ FIRST

This project uses a unified system across three Claude interfaces (Code, Desktop, Browser Extension). At the START of every session:

1. **Call `get_project_briefing` (paybacker MCP)** — one call returns all shared-context files, git status, open PRs, and recent business_log rows. This is the fastest way to pick up where the last session left off.
2. If the MCP is unavailable, fall back to reading manually: `shared-context/active-sessions.md`, `shared-context/handoff-notes.md`, `shared-context/task-queue.md`, then `gh pr list -R airpau/lifeadmin-ai --state open` and the `business_log` table.

At the END of every session:
1. Call `log_session` (paybacker MCP) to record what you did
2. Call `log_handoff` (paybacker MCP) with summary and next steps for the next chat
3. Update `shared-context/task-queue.md` with any new/completed tasks
4. Commit and push all changes

The MCP server at `/mcp-server/` provides tools for all interfaces to read/write shared context, post to social media, check infrastructure, and manage tasks. The new `get_project_briefing` tool bundles the read-side of that into a single call so every new chat starts with full context without burning tokens on repeated reads.

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

## SURFACE CHECK — DO THIS BEFORE EVERY EDIT

Paybacker ships **two distinct products from one codebase**: a B2C consumer app and a B2B engineering-buyer API. They are separate businesses sharing a repo. **Mixing them is a deploy-blocking mistake** — wrong voice, wrong audience, wrong contract.

Before editing any file, identify the surface and stay in lane:

| Surface | Paths (exhaustive) | Voice | Audience |
|---|---|---|---|
| **B2B (engineering buyer)** | `src/app/for-business/**`, `src/app/api/v1/**`, `src/lib/b2b/**`, `src/app/dashboard/api-keys/**`, `src/app/dashboard/admin/b2b/**` | Precise, evidence-led, no consumer empathy. Talk request shape, latency, error contract, integration cost. | UK fintechs, insurers, energy retailers, claims platforms, MGAs, CX vendors, AI agent builders |
| **B2C (consumer)** | Everything else under `src/app/**` and `src/lib/**` — including `src/app/page.tsx`, `src/app/dashboard/**` (except api-keys/admin-b2b), `src/app/blog/**`, `src/lib/agents/**`, `src/lib/telegram/**`, `src/lib/whatsapp/**`, `src/lib/dispute-sync/**`, all consumer crons | "Fight unfair bills", first-person empathy, household savings stories | UK consumers aged 25-50, time-poor professionals overpaying on bills |

**Rules:**
1. **Don't bundle B2C and B2B work in the same PR** unless the change genuinely touches both. Split by surface.
2. **Don't apply consumer voice to B2B paths.** No "fight unfair bills" copy on `/for-business`. No founder savings stories on `/for-business/docs`.
3. **Don't apply B2B engineering voice to B2C paths.** No "request shape" jargon on `/dashboard`.
4. **Shared engine is `generateComplaintLetter` only** (`src/lib/agents/complaints-agent.ts`). Both products call it. Any change to its contract must keep both call-sites working.
5. **`legal_references` is a shared table.** Schema changes affect both products.
6. **`DisputeResponse` shape (`src/lib/b2b/disputes.ts`)** is a public contract. Don't break it without `/v2`. Additive optional fields are fine.

When ambiguous (e.g. shared utility, marketing surface), ask before editing.

For deeper guidance per directory, see the `SCOPE.md` file at the root of each major tree.

---

## PRODUCT OVERVIEW

**Company:** Paybacker LTD (UK registered)
**Website:** paybacker.co.uk
**Founded:** March 2026
**Contact:** hello@paybacker.co.uk (consumer) · business@paybacker.co.uk (B2B)

Paybacker ships **two products from one codebase**:

### 1. Consumer app (B2C) — paybacker.co.uk
AI-powered savings platform for UK consumers. Disputes unfair bills, tracks every subscription / contract, scans bank + email inbox for hidden costs. The AI generates professional complaint letters citing exact UK consumer law in 30 seconds. **Target audience:** UK consumers aged 25-50, time-poor professionals overpaying on bills.

### 2. UK Consumer Rights API (B2B) — paybacker.co.uk/for-business
The same engine exposed as a single REST endpoint for UK fintechs, insurers, energy retailers, and claims platforms. `POST /v1/disputes` returns the cited statute, sector classification, regulator, entitlement summary, customer-facing response, agent talking points, claim value estimate, time sensitivity, escalation path, and draft letter — in one call. Launched 2026-04-28.

- **Tiers:** Starter (free, 1k calls/mo, self-serve mint), Growth (£499/mo, 10k calls), Enterprise (£1,999/mo, 100k calls + SLA).
- **Decision rule:** 10 qualified UK fintech signups in 30 days post-launch (≈ 28 May 2026) → green-light deeper build. <10 → archive `/for-business`.
- **Tables:** `b2b_waitlist`, `b2b_api_keys`, `b2b_api_usage`, `b2b_portal_tokens`.
- **Key files:** `src/lib/b2b/{auth,disputes,stripe-webhook,key-reveal}.ts`, `src/app/api/v1/{disputes,checkout,free-pilot,portal-login,portal-keys,key-reveal}/route.ts`, `src/app/for-business/{page,docs,coverage,thanks}/`, `src/app/dashboard/api-keys/`, `src/app/dashboard/admin/b2b/`.
- **Auth model:** bearer token `pbk_<8hex>_<32hex>`; SHA-256 hash + 8-char prefix in DB. Plaintext shown ONCE via single-use email link, never persisted, never logged.
- **Stripe:** live products `prod_UPqX0DuQzRRqjI` (Growth) and `prod_UPqXc86ZeTqXFL` (Enterprise). Env vars `STRIPE_PRICE_API_GROWTH_MONTHLY`, `STRIPE_PRICE_API_ENTERPRISE_MONTHLY`. Webhook `we_1TDVvr7qw7mEWYpy2hLTs9S3` subscribes to `checkout.session.{completed,expired}` + sub lifecycle. **Always idempotent on `checkout.session.completed`** (Stripe replays).
- **Crons:** `/api/cron/b2b-nurture` daily 10:00 UTC drips d1/d3/d7/d14 emails to non-converters; uses `notes` column tag like `[nurture:d3]` for dedup.
- **Daily B2B alerts** (Telegram + founder email): free-pilot mint, Stripe checkout started, sale, abandonment.
- **Customer portal:** `/dashboard/api-keys` (token-gated via passwordless email link, 30-min expiry, single-use on mutating actions). Reveal/Re-issue/Revoke.

### Treat B2C and B2B as two separate businesses sharing one codebase

The two products are **functionally distinct** — different audiences, different
voices, different inboxes, different feature sets, different pricing logic.
Future Claude sessions MUST treat them as two entities and avoid crossover:

| Aspect | Consumer (B2C) | Business (B2B) |
|---|---|---|
| **Domain surface** | `/`, `/dashboard`, `/blog`, `/pricing`, `/deals`, etc. | `/for-business`, `/for-business/{docs,coverage,thanks}`, `/dashboard/admin/b2b`, `/dashboard/api-keys` |
| **Audience** | UK households, individual consumers | UK fintechs, insurers, energy retailers, claims platforms, CX/eng teams |
| **Tone of voice** | "Fight unfair bills", first-person empathy, household savings stories | Engineering buyer voice — precise, evidence-led, no consumer empathy copy |
| **From-email** | `Paybacker <noreply@paybacker.co.uk>` (consumer) / `hello@paybacker.co.uk` (founder) | `Paybacker for Business <noreply@paybacker.co.uk>` with `replyTo: business@paybacker.co.uk` |
| **Founder inbox** | Consumer → `aireypaul@googlemail.com` only when explicitly required | B2B → `business@paybacker.co.uk` (set via `FOUNDER_EMAIL` env) |
| **Telegram** | Consumer flow alerts | B2B flow alerts — different message prefixes (🛒 / 💰 / 🛒💀) |
| **Auth** | Supabase Auth (sign up / log in / OAuth) | Bearer API key + passwordless portal magic link (no Supabase user account) |
| **Tables** | `profiles`, `subscriptions`, `complaints`, `tasks`, `bank_*`, `gmail_*`, `whatsapp_*` etc. | `b2b_waitlist`, `b2b_api_keys`, `b2b_api_usage`, `b2b_portal_tokens` |
| **Pricing** | Free / Essential £4.99/mo / Pro £9.99/mo (per individual) | Starter free / Growth £499/mo / Enterprise £1,999/mo (per company) |
| **Stripe metadata** | No `product` tag (default consumer flow) | `metadata.product = 'b2b_api'` — webhook routes by this tag |
| **Demotion logic** | Webhook-driven, never auto-demote (see "System rules" above) | Webhook revokes the linked B2B key on `customer.subscription.deleted` |
| **Marketing channels** | r/ukpersonalfinance, MoneySavingExpert, Reddit, consumer TikTok | LinkedIn DMs, Show HN, dev blogs, fintech newsletters |
| **Crons** | Bank sync, digest, price alerts, etc. | `b2b-nurture` only — separate from consumer crons |

**Concrete rules to enforce the separation:**

1. **Never link consumer dashboards from B2B surfaces or vice versa.** A B2B
   customer should never land on `/dashboard/complaints`; a consumer should
   never land on `/for-business/docs` from the consumer dashboard.
2. **Never copy consumer marketing copy into B2B surfaces.** The £2,000+
   founder-recovery story belongs on consumer pages and the LinkedIn
   personal profile — not on `/for-business`. The "10 qualified signups"
   gate is B2B-only and must not appear on consumer pages.
3. **Consumer-tier helpers (`canUseWhatsApp`, `getEffectiveTier`,
   `PLAN_LIMITS`) must not be called from B2B routes.** B2B uses its own
   tier model in `b2b_api_keys.tier`.
4. **`generateComplaintLetter` is the ONLY shared helper** — it's the
   engine. Both products call it. Any change to its contract must keep
   both call-sites working. Run `grep -r "generateComplaintLetter" src/`
   before touching it.
5. **`legal_references` table is shared.** A schema change affects both
   products. Always check both `/api/complaints/generate` (consumer) and
   `/lib/b2b/disputes.ts` (B2B) when migrating it.
6. **Don't bundle B2C and B2B work in the same PR** unless the change
   genuinely touches both. Split PRs by product surface for cleaner
   review and rollback.
7. **The B2B API response shape (`DisputeResponse` in
   `src/lib/b2b/disputes.ts`) is a public contract.** Don't break it
   without a `/v2` path.
8. **Keep this CLAUDE.md updated** when new B2B endpoints, env vars,
   Stripe products, or crons are added.

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
- **Pocket Agent on WhatsApp** (Pro-only — Telegram remains across all tiers)
- Money Hub Top Merchants
- Price-increase alerts via Telegram + WhatsApp (instant)
- Daily morning brief + weekly recovery digest via WhatsApp
- Export (CSV / PDF)
- Paybacker Assistant (MCP integration)
- Full transaction-level analysis
- Priority support
- On-demand bank sync (manual refresh)
- Automated cancellations (coming soon)

### WhatsApp Pocket Agent — tier policy (2026-04-27)

WhatsApp is Pro-only because every outbound template costs us £0.003-£0.06
per send via Meta. Telegram is free for us so it stays on every tier as
the no-cost Pocket Agent. Enforcement points:

1. `canUseWhatsApp(userId)` in `src/lib/plan-limits.ts` is the
   single source of truth.
2. `/api/whatsapp/opt-in` returns 403 with `upgradeUrl` for non-Pro.
3. `/api/whatsapp/webhook` sends ONE upgrade nudge per non-Pro number
   (tracked via `whatsapp_sessions.upgrade_nudge_sent_at`), then silently
   logs further inbounds.
4. `/api/cron/whatsapp-alerts` filters recipients by tier before sending.

Trial Pro users (active onboarding trial via `getEffectiveTier`) inherit
WhatsApp during the trial window only. Demotion mid-trial is webhook-driven
(no auto-demote — same rule as bank/email caps).

Template registry lives at `src/lib/whatsapp/template-registry.ts`. 16
templates submitted to Meta on 2026-04-27: 14 utility, 1 authentication
(OTP — not Pro-gated), 1 marketing (`paybacker_better_deal_found` — needs
separate marketing opt-in before send).

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
6. **ALL agent output is stored in Supabase** (`executive_reports`, `agent_runs`, or `business_log`) so status is auditable from SQL. Note: Charlie's daily digest email is currently dormant (see AI AGENT TEAM section) — do not assume digests are reaching the founder unless verified.
7. **Casey (CCO) requires founder approval before any content is posted.** Approve/reject links update `content_drafts.status`. Never auto-post without approval. Note: Casey is currently dormant — content drafting is manual until a cron trigger is wired up.
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

## AI AGENT TEAM — HONEST STATE (verified 17 April 2026)

This section was overhauled on 17 April 2026 after a tool-grounded audit. Earlier versions of this file described an "executive C-suite" (Alex, Morgan, Jamie, Taylor, Jordan, Charlie, Casey, Drew, Pippa, Leo, Nico, Bella, Finn) as if they were firing daily. That was aspirational and is no longer true — the Railway agent-server that ran them was disabled around 5 April 2026 (see shared-context/handoff-notes.md) and nothing replaced the schedule. Do not assume any agent named below is running unless it appears in the "Active" table.

When writing about agents, always check `agent_runs`, `executive_reports`, and `business_log` before stating an agent's status. Configured ≠ firing.

### Active agents (verified firing in last 7 days)

| Worker | Trigger | Source | What it does | Last seen |
|---|---|---|---|---|
| `complaint_writer` | On-demand (user clicks) | `src/app/api/agents/complaints/route.ts` | Generates UK-legislation-cited complaint letters | Active — 33 runs in last 30d |
| `riley-support-agent` | Vercel cron | `vercel.json` | Support ticket auto-response | Active today |
| `discover_features_cron` | Vercel cron | `vercel.json` | Feature discovery | Active today |
| `dev-sprint-runner` | Vercel cron | `vercel.json` | Dev sprint bookkeeping | Active this week |
| `analyze_chatbot_gaps_cron` | Vercel cron | `vercel.json` | Chatbot gap analysis | Active this week |
| `paperclip-business-monitor` | External monitor | Paperclip | Business monitoring | Active this week |

### Dormant agents (configured but not firing)

These rows exist in `ai_executives` and have `executive_reports` history, but have produced no output since the Railway disable:

| Agent | Role | Last report | Status |
|---|---|---|---|
| Casey | CCO | 2026-04-06 | Dormant — no cron trigger |
| Charlie | EA | 2026-04-06 | Dormant — no cron trigger |
| Sam | Support Lead | 2026-04-04 | Dormant — no cron trigger |
| Alex | CFO | 2026-04-03 | Dormant — no cron trigger |
| Jordan | Head of Ads | 2026-03-25 | Dormant — no cron trigger |
| Morgan | CTO | 2026-03-24 | Dormant — no cron trigger |
| Jamie | CAO | 2026-03-24 | Dormant — no cron trigger |
| Taylor | CMO | 2026-03-24 | Dormant — no cron trigger |
| Drew | CGO | 2026-03-24 | Dormant — no cron trigger |
| Pippa | CRO | 2026-03-24 | Dormant — no cron trigger |
| Leo | CLO | 2026-03-26 | Dormant — no cron trigger |
| Nico | CIO | 2026-03-24 | Dormant — no cron trigger |
| Bella | CXO | 2026-03-24 | Dormant — no cron trigger |
| Finn | CFraudO | 2026-03-24 | Dormant — no cron trigger |

Assume none of these will run unless a Vercel cron entry is added to trigger them. Do not cite their outputs in any summary without first checking `executive_reports` for a recent row.

### Claude Managed Agents (platform.claude.com) — configured, not scheduled

Nine agents are registered in `src/lib/managed-agents/config.ts`:

`alert-tester`, `digest-compiler`, `support-triager`, `email-marketer`, `ux-auditor`, `feature-tester`, `bug-triager`, `reviewer`, `builder`.

There is an endpoint at `src/app/api/cron/managed-agents/route.ts`, but it is NOT listed in `vercel.json`, so Vercel cron never invokes it. `agent_messages` has 0 rows in the last 30 days, confirming no sessions have fired. These agents are fully configured and ready to run — they just need cron entries to wake them up.

### Disabled systems

- **Railway agent-server** — legacy, flagged for disable 5 April 2026 (see handoff-notes.md). Do not restart.
- **`/api/cron/executive-agents`** — returns `{status: 'deprecated'}`. Do not wire anything to it.

### Rules for agents going forward

1. Before describing an agent as "running", verify with `agent_runs`, `executive_reports`, or `business_log`.
2. New agents must be registered in `vercel.json` with an explicit cron schedule — otherwise they are dormant by default.
3. All agent output must land in Supabase (`executive_reports`, `agent_runs`, or `business_log`) so status is auditable from SQL.
4. Never modify `complaint_writer` or Riley without explicit user approval — these are the two workers actually serving users.
5. When in doubt, ask before you build.

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
