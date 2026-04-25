# Tech Stack & Architecture Rules

## Stack
- Framework: Next.js 15, React, TypeScript, Tailwind CSS
- Database: Supabase (Postgres + Auth), project id `kcxxlesishltdmfctlmo`, region `eu-west-2`
- AI: Claude API (Sonnet 3.5 for letters/chatbot, Managed Agents for ops)
- Billing: Stripe
- Email: Resend
- Open Banking: TrueLayer (primary), Yapily (fallback)
- Hosting: Vercel Pro
- Analytics: PostHog
- Image / Video: fal.ai (primary), Runway ML (backup)
- Social posting: Late API (getlate.dev) — all platforms via one integration
- Web research: Perplexity API
- IP intelligence: ipapi.co

## NEVER-VIOLATE Architecture Rules
These are absolute. Flag any violation immediately, even in your own draft suggestions.

1. **All image/video generation goes through fal.ai only.** Never integrate OpenAI image gen,
   Stability AI, Midjourney, or any other provider directly.
2. **All social media posting goes through Late API (getlate.dev) only.** No direct Meta Graph
   API, TikTok Content Posting API, LinkedIn Marketing API, X/Twitter API.
3. **All real-time web research uses Perplexity API.** Not scraping, not Google Search API,
   not Bing.
4. **All product analytics and funnel tracking uses PostHog.** No GA, no Mixpanel.
5. **All transactional and lifecycle emails use Resend.** No SendGrid, Mailchimp, etc.
6. **All agent output is stored in Supabase** (`executive_reports`, `agent_runs`, or
   `business_log`) so status is auditable from SQL.
7. **Casey (CCO, dormant) required founder approval before any content was posted.** Any new
   content-drafting agent (e.g. email-marketer) inherits this rule. Approve/reject links
   update `content_drafts.status`. Never auto-post.
8. **Never expose API keys in client-side code.** All external API calls are server-side only.

## Database rules
- **Never use DROP TABLE or ALTER TABLE to remove columns under any circumstances.**
- **Always use CREATE TABLE IF NOT EXISTS for any new tables.**
- **All database changes must be written as migration files in `/supabase/migrations`.**
- Row-level security (RLS) is enabled on all tables.
- Migrations are additive only — never drop columns or tables in production, only add.
