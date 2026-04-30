# Current State — Where Paybacker Is Today

_Snapshot as of the bootstrap re-run. The bootstrap script does NOT auto-update this file
on each agent session — refresh by re-running `scripts/bootstrap-managed-agents-memory.ts`
when major facts shift. Treat numbers as priors; verify against live Supabase before
acting on them._

## Stage
- Live product, paying users.
- UK-only consumer base.
- Founded March 2026; ~6 weeks live as of the April 2026 migration to managed agents.

## User base (April 2026 priors — verify before citing)
- Total profiles: ~46 (not all engaged).
- Tier mix: ~50% Free, ~37% Pro, ~13% Plus (Essential).
- Paying users: ~23 (any tier ≠ free with `stripe_subscription_id IS NOT NULL`).
- Test accounts present (test+awin1-14, googletest@) — these MUST be excluded from any
  user/MRR count. The MCP `get_finance_snapshot` filters them automatically.

## Revenue (priors — verify daily via finance-analyst)
- MRR is in the low-hundreds GBP range. Pro = £9.99, Plus = £4.99 (both monthly equivalent).
- Q1 target was MRR > £100; achieved late March 2026.
- ARR roughly = MRR × 12 (annual plans cost ~£44.99 / £94.99, slightly under monthly × 12).
- Revenue concentration: track if any single user > 20% of MRR — flag, don't act.

## Build progress (CLAUDE.md "Phase" tracking)
- **Phase 1 — Foundation**: complete. Next.js scaffold, Supabase live, full schema deployed
  (profiles, waitlist_signups, tasks, agent_runs, subscriptions), auth + dashboard layout.
- **Phase 2 — Core Features**: complete. Complaints generator, Opportunity Scanner UI,
  Subscriptions CRUD, Dashboard overview, Profile page, Pricing page, Stripe checkout +
  webhook, Tasks history API, AI cancellation email API.
- **Phase 3 — Live**: in progress. ANTHROPIC_API_KEY, real Stripe price IDs, Gmail OAuth
  inbox-scanner with real data, Vercel deploy + custom domain, waitlist campaign.

## Modes / flags
- `NEXT_PUBLIC_WAITLIST_MODE=false` — site is in LIVE mode showing free trial buttons.
  Waitlist mode is disabled. Don't propose flipping this without checking.

## Acquisition channels (live)
- Google Ads (live — budget tracked separately).
- Awin influencer marketing (£1–4 per conversion).
- Reddit organic.
- SEO content (`blog_posts` table).
- Referral programme: 1 free month of Essential per referred paying subscriber.

## Open Banking integration status
- TrueLayer: primary (live).
- Yapily: fallback (live).
- Daily auto-sync: 3am, 2pm, 7pm UTC.
- Pro on-demand sync: live.

## Email scanning
- Gmail: Google OAuth verified.
- Outlook: Microsoft OAuth.
- Watchdog dispute-reply polling: every 30 minutes for all tiers (Free gets 1 mailbox,
  Essential 3, Pro unlimited).

## Social posting
- Facebook: WORKING. Posts to page id `1056645287525328` via `META_ACCESS_TOKEN` (page
  token, not user token; needs periodic refresh). Page auto-posting via
  `/api/cron/post-social` daily 10am.
- Instagram: PENDING Meta App Review. Manual workflow (generate image, post via Telegram
  to Paul) until live.

## Telegram integration
- Founder admin chat: `TELEGRAM_FOUNDER_CHAT_ID` env var.
- Pocket Agent (per-Pro-user bot): live, session-based.
- Founder digest: `/api/cron/agent-digest` posts at 07:00, 12:30, 19:00 UTC summarising
  managed-agent activity. Mid-cycle critical pings via the `post_to_telegram_admin` MCP
  tool with mandatory `ask` field.

## Agent system (post 2026-04-25 migration)
- 9 Claude Managed Agents with memory, scheduled via `/api/cron/managed-agents` hourly
  trigger filtered by `agentsDueAt()`. NEW: `finance-analyst` brings the total to 10
  (placeholder agent_id in config until founder registers it on platform.claude.com).
- 14 legacy executives (Casey/Charlie/Sam/etc.) decommissioned via migration
  `20260425000000`. `replaced_by` field in `ai_executives.config` records the mapping.
- Riley (support_agent) and `complaint_writer` are the only user-facing workers. Do NOT
  modify without founder approval.
- Removed in this migration: `paperclip-business-monitor`, `dev-sprint-runner` (dead
  references). Admin team-status panel now monitors the 10 managed agents.

## What's still on the roadmap (see 11-coming-soon.md)
- Deal comparison + switching (Switchcraft API).
- Automated cancellations.
- Instagram posting (post Meta review).
- Self-learning from user feedback.
- WhatsApp integration.
- SMS notifications for urgent alerts.
- Native mobile app.
- Savings goal affiliate links.
- Pro financial reports (automated daily/weekly/monthly).
- Smart budget alerts.
