# Infrastructure

*Last updated: 2026-03-26*

## Hosting
- **Vercel Pro:** paybacker.co.uk (Next.js 15 app)
- **Railway:** Agent server (15 AI agents on cron schedules)
- **Supabase:** PostgreSQL database + Auth + Storage (eu-west-2, project ID: kcxxlesishltdmfctlmo)

## Domains
- paybacker.co.uk (primary, Vercel)
- paybacker.com (NOT owned, never use)

## Environment Variables
All env vars set in Vercel dashboard and Railway dashboard. Key vars:
- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY / ANTHROPIC_AGENTS_API_KEY
- STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
- RESEND_API_KEY
- TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET
- META_ACCESS_TOKEN / META_APP_ID / META_APP_SECRET / META_PAGE_ID / META_INSTAGRAM_ACCOUNT_ID
- FAL_KEY
- PERPLEXITY_API_KEY
- POSTHOG_API_KEY
- LATE_API_KEY
- AWIN_PUBLISHER_ID / AWIN_ADVERTISER_ID
- TELEGRAM_BOT_TOKEN / TELEGRAM_FOUNDER_CHAT_ID
- CRON_SECRET (protects all cron endpoints)
- GEMINI_API_KEY (image generation)

## Database Tables (Key)
- profiles, waitlist_signups, tasks, agent_runs
- subscriptions, contracts, bank_accounts, transactions
- complaints, support_tickets, ticket_messages
- executive_reports, content_drafts, compliance_log
- competitive_intelligence, nps_responses
- loyalty_points, referrals
- email_scans, opportunities

## Deployment
- Main branch = production (auto-deploys to Vercel)
- Always run `npx tsc --noEmit` before deploying
- Tag releases: `git tag v[date]-[description]`
- Railway auto-deploys from main branch

## Monitoring
- Agent runs logged to executive_reports table
- Charlie compiles daily digest email to founder
- Telegram bot sends real-time notifications
- PostHog tracks product analytics
