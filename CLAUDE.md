# Paybacker LTD — AI-Powered Money Recovery for UK Consumers

## Product Vision
Paybacker is an AI-powered service that helps UK consumers get money back and reduce admin burden. Our AI agents automatically:
- Dispute incorrect bills (energy, council tax, broadband, etc.)
- Write formal complaints to service providers
- Cancel forgotten subscriptions
- Challenge unfair charges
- Handle customer service interactions on behalf of users

## Tech Stack
- **Frontend**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Supabase (PostgreSQL + Auth)
- **AI**: Claude API (@anthropic-ai/sdk) for intelligent letter writing and decision-making
- **Payments**: Stripe (subscription billing + success fees)
- **Email**: Resend (transactional emails, complaint letters)
- **Hosting**: Vercel (Next.js), Supabase (database + auth)

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
Required in .env.local:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
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

### Git Workflow
- Main branch is production
- Feature branches: feature/description
- Commit messages: Conventional Commits format
- Always include Co-Authored-By: Claude when pair programming

## Monetization Strategy
1. **Waitlist Phase**: Collect emails, validate demand
2. **MVP Launch**: £9.99/month subscription + 20% success fee on money recovered
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
- [x] Pricing page (3 tiers: Free / Essential £9.99/mo / Pro £19.99/mo)
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
