# LifeAdminAI — AI-Powered Life Admin for UK Consumers

## Product Vision
LifeAdminAI is an AI-powered service that helps UK consumers get money back and reduce admin burden. Our AI agents automatically:
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

## Next Steps (Waitlist Phase)
- [x] Scaffold Next.js app
- [x] Install dependencies
- [ ] Create waitlist landing page
- [ ] Deploy to Vercel
- [ ] Set up domain (lifeadmin.ai or similar)
- [ ] Launch waitlist campaign
- [ ] Build MVP dashboard + first AI agent (bill dispute)
