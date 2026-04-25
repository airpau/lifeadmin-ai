# Pricing — Authoritative as of 2026-04-22

Source of truth: `src/lib/plan-limits.ts`. If your reasoning depends on tier limits, verify
against that file before writing recommendations.

## Free — £0
- 2 bank connections, daily auto-sync
- 1 email connection, 30-min Watchdog dispute-reply polling
- Unlimited dispute thread links
- 3 AI letters per month
- Unlimited manual subscription tracking
- Basic spending overview (top 5 categories)
- Pocket Agent (Telegram bot)
- AI chatbot

## Essential — £4.99/month or £44.99/year
- 3 bank connections, daily auto-sync
- 3 email connections, 30-min Watchdog polling
- Unlimited AI letters
- AI cancellation emails with legal context
- Renewal reminders (30/14/7 days)
- Full spending intelligence dashboard (20+ categories)
- Money Hub Budgets + Savings Goals
- Price-increase alerts via email
- Contract end-date tracking
- Pocket Agent (Telegram bot)

## Pro — £9.99/month or £94.99/year
- Unlimited bank connections
- Unlimited email connections
- Everything in Essential, plus:
- Money Hub Top Merchants
- Price-increase alerts via Telegram (instant)
- Export (CSV / PDF)
- Paybacker Assistant (MCP integration)
- Full transaction-level analysis
- Priority support
- On-demand bank sync (manual refresh)
- Automated cancellations (coming soon)

## Tier-logic rules — DO NOT VIOLATE
1. **Paid tiers are never auto-demoted.** `/api/stripe/sync` promotes only. Demotion is
   webhook-driven (`customer.subscription.deleted`).
2. **No 14-day Pro trial on signup** — it produced silent downgrades at expiry. `TrialBanner`
   still renders if `trial_ends_at` is explicitly set, but no automatic trial grant.
3. `getEffectiveTier(userId)` trusts `profile.subscription_tier` as source of truth. The single
   override: an active onboarding trial returns `'pro'` for the trial window.
4. Bank/email caps are enforced at connect endpoints (`/api/auth/truelayer`,
   `/api/auth/google`, `/api/auth/microsoft`, `/api/auth/yapily`) reading
   `PLAN_LIMITS[tier].maxBanks` / `maxEmails`. Over-cap returns 403 (banks) or redirects to
   `/dashboard/profile?email_limit_reached=1` (OAuth).
