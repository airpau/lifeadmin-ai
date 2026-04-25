# Data Model — Key Tables

This is the abridged data-model map. Source of truth lives in `supabase/migrations`. When
in doubt, read the migration files. NEVER drop columns, never DROP TABLE. New tables MUST
use `CREATE TABLE IF NOT EXISTS`.

## Identity & access
- `auth.users` — Supabase Auth (managed, do not modify schema).
- `profiles` — extension of auth.users. Key columns:
  `id`, `email`, `subscription_tier` (free | plus | pro and possibly others),
  `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`,
  `trial_converted_at`, `trial_expired_at`, `onboarded_at`, `created_at`,
  `activity_score`, `opportunity_score`.

## Subscriptions / billing
- `subscriptions` — user-tracked recurring payments (the product feature). Each row is
  a subscription the USER pays externally (Netflix, gym, etc.), NOT a Stripe subscription
  for Paybacker itself.
- `plan_downgrade_events` — records every time `subscription_tier` decreased. Used by
  finance-analyst for churn signals.
- `subscriptions_expiring_soon` — view (not table) of subs ending in next 30 days.
- `upcoming_payments` — view of due payments in the next window.
- `subscription_comparisons` — ad-hoc switching/savings analyses.

## Disputes / complaint letters
- `tasks` — stores complaint letters with `type='complaint_letter'` plus other tasks.
- `disputes` — disputes raised by users. Status: open / in_progress / awaiting_reply /
  resolved / dismissed.
- `agent_runs` — every invocation of `complaint_writer` and any other AI agent, with
  status, latency, error, output ref. Source-of-truth for "did this fire".

## Email & banking integrations
- `email_connections` — OAuth tokens for Gmail/Outlook (encrypted at rest).
- `email_threads` — scanned threads, status, opportunity flags.
- `email_opportunities` — Opportunity Scanner findings.
- `bank_connections` — TrueLayer/Yapily OAuth refs.
- `bank_transactions` — parsed transactions (read-only mirror).

## Money Hub
- `budgets` — user-set category limits.
- `savings_goals` — user goals with progress.
- `transaction_categories` — user-overridable categorisation.

## Loyalty & growth
- `loyalty_points` — point balance per user per category.
- `loyalty_redemptions` — redemption history.
- `referrals` — unique referral links + conversion tracking.
- `waitlist_signups` — pre-launch email list (still in use for some flows).

## Content & marketing
- `content_drafts` — drafts produced by the email-marketer agent. Status: pending |
  approved | posted | rejected. Critical: NEVER auto-post — founder approves.
- `email_drafts` — same shape, dedicated to email lifecycle drafts (some deployments
  fold these into content_drafts).
- `blog_posts` — published SEO content. Status: draft | published.
- `compliance_log` — privacy / GDPR / consumer-law compliance notes.
- `competitive_intelligence` — daily competitor watch entries.
- `provider_intelligence` — aggregated provider cancellation info, written by
  `/api/cron/aggregate-provider-intelligence`.

## Agent system
- `ai_executives` — registry of legacy executives (Casey, Charlie, Sam, etc.). After
  the 2026-04-25 migration, all 14 legacy roles have `status='disabled'` with
  `config.replaced_by` set. Riley (`support_agent` role) is preserved.
- `agent_memory` — homegrown memory used by the legacy executives. Still queried by the
  bootstrap script for high-importance learnings (importance >= 8, types learning + decision).
- `executive_reports` — per-session reports from agents. Read by
  `/api/cron/agent-digest` and `/api/cron/daily-ceo-report`.
- `business_log` — structured findings. Columns: `id, category, title, content,
  created_by, expires_at, created_at`. Categories that escalate in the digest:
  alert, critical, warn, finding, recommendation, escalation, agent_governance.
  All managed agents call `append_business_log` once per session.
- `agent_messages` — tracks message events for managed-agent sessions.

## NPS / feedback
- `nps_responses` — scores + free-text feedback.

## Telegram
- `telegram_sessions` — per-user Pocket Agent sessions for Pro tier.

## DO NOT touch (production)
- `complaint_writer` source files (`src/app/api/complaints/generate/route.ts`,
  `src/lib/agents/complaints-agent.ts`).
- `riley-support-agent` source file (`src/app/api/cron/support-agent/route.ts`).
- `auth.users` schema.
- Stripe-webhook handler (`src/app/api/webhooks/stripe/route.ts`) — all subscription
  state mutations flow through here.
- `plan-limits.ts` (`src/lib/plan-limits.ts`) — pricing and tier-cap source of truth.
