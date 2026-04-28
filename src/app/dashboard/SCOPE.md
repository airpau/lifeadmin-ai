# SCOPE — Consumer (B2C) dashboard

Everything under `src/app/dashboard/` is the **Paybacker consumer app** — UK households fighting unfair bills, tracking subs, recovering money. Read CLAUDE.md "Surface check" before editing.

## Two B2B carve-outs

These two subtrees are NOT consumer surfaces — they're the B2B customer portal and B2B founder admin:

- `src/app/dashboard/api-keys/` — B2B customer portal (token-gated passwordless login, key lifecycle, usage charts, webhooks, audit log, CSV export). Read `src/app/for-business/SCOPE.md`.
- `src/app/dashboard/admin/b2b/` — B2B founder admin. Read `src/app/for-business/SCOPE.md`.

Everything else under `dashboard/` is consumer.

## Audience

UK consumers aged 25-50, time-poor professionals overpaying on bills, often signed up via Google Ads, organic search, Reddit, MoneySavingExpert, or a referral link.

## Voice

- **"Fight unfair bills."** First-person empathy, household savings stories.
- **Plain English, no engineering jargon.** Don't talk about request shapes or rate limits. Talk about money saved, contracts ending, bills going up.
- **Pounds and pence, dates as DD/MM/YYYY**, British spelling.

## Tier model

Consumer tiers: `free` | `essential` (£4.99/mo) | `pro` (£9.99/mo). Source of truth in `src/lib/plan-limits.ts`. Use `getEffectiveTier(userId)` — it handles the onboarding-trial override.

**Never import B2B helpers** from `src/lib/b2b/**` here. B2B has its own tier model and auth.

## Auth

Supabase Auth (email + Google OAuth). User accounts live in `auth.users` and `profiles`. Never use the B2B passwordless magic-link flow here.

## Payments

Consumer Stripe checkout — no `metadata.product` tag (the absence is what routes to consumer in the webhook). B2B checkouts carry `metadata.product = 'b2b_api'`.

## Rules

1. Never link `/for-business` from a consumer dashboard panel without explicit reason.
2. Never copy B2B engineering-buyer copy into consumer pages.
3. Don't call B2B helpers from consumer routes; don't call consumer helpers from B2B routes.
