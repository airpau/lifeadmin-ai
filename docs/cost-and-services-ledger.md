# Paybacker Cost & Services Ledger

This is the **canonical, living ledger** of every third-party service Paybacker depends on, the cost of running each, and how (or whether) we pull spend programmatically. It is founder-editable and version-controlled — when a service is added, removed, or repriced, update this file in the same PR as the code change.

It pairs with two database tables:

- **`api_cost_ledger`** — append-only log of *live* per-call spend for services we have wired into [`cost-ledger.ts`](../src/lib/cost-ledger.ts) (currently Anthropic and Perplexity, landed in PR #370).
- **`manual_cost_estimates`** — founder-entered monthly fixed costs for services that don't expose a billing API (e.g. Google Ads, Yapily flat fee, accountant retainer). Schema lives in [`supabase/migrations/20260430040000_manual_cost_estimates.sql`](../supabase/migrations/20260430040000_manual_cost_estimates.sql).

The admin **Business Costs** tab (gated by `NEXT_PUBLIC_ADMIN_EMAILS`) renders a unified monthly burn view by reading from this doc (for service inventory), `api_cost_ledger` (live spend), and `manual_cost_estimates` (founder estimates).

Status legend:
- ✅ **wired** — live spend flowing into `api_cost_ledger`
- 🟡 **manual** — tracked via `manual_cost_estimates`, founder updates monthly
- 🔴 **not started** — no integration and no estimate entered yet

---

## Section 1 — Service inventory

### AI / LLM

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Anthropic (main) — `ANTHROPIC_API_KEY` | AI/LLM | Claude API for email scan, deals analysis, support agent | Per-token usage | https://console.anthropic.com | Admin API + per-call ledger | TBD | ✅ wired |
| Anthropic (agents) — `ANTHROPIC_AGENTS_API_KEY` | AI/LLM | Separate key for managed agent runs | Per-token usage | https://console.anthropic.com | Admin API + per-call ledger | TBD | ✅ wired |
| Perplexity — `PERPLEXITY_API_KEY` | AI/LLM | Live web research for deals + support context | Per-request | https://www.perplexity.ai/settings/api | Per-call ledger | TBD | ✅ wired |
| fal.ai — `FAL_KEY` | AI/LLM | Image/video generation for marketing assets | Per-inference | https://fal.ai/dashboard | Dashboard only | TBD | 🟡 manual |
| Runway ML — `RUNWAY_API_KEY` | AI/LLM | Video generation for marketing | Subscription + credits | https://app.runwayml.com | Dashboard only | TBD | 🟡 manual |
| Google Gemini / Imagen 4 — `GEMINI_API_KEY` | AI/LLM | Backup LLM + image generation | Per-token / per-image | https://aistudio.google.com | GCP billing API | TBD | 🟡 manual |

### Infrastructure

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Vercel Pro | Infrastructure | App hosting, edge functions, preview deploys | $20/seat + usage | https://vercel.com/dashboard | Dashboard only | TBD | 🟡 manual |
| Supabase | Infrastructure | Postgres + Auth + Storage | Tiered subscription | https://supabase.com/dashboard | Dashboard only | TBD | 🟡 manual |
| GitHub | Infrastructure | Source control + Actions CI | Per-seat subscription | https://github.com/settings/billing | Dashboard only | TBD | 🟡 manual |
| Domain registrar (paybacker.co.uk) | Infrastructure | Domain registration + DNS | Annual flat | (registrar dashboard) | Annual invoice | TBD | 🟡 manual |
| Railway | Infrastructure | Background workers / scheduled jobs | Usage-based | https://railway.app | Dashboard only | TBD | 🟡 manual |

### Payments / Banking

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Stripe — `STRIPE_SECRET_KEY` (live) | Payments | Checkout + subscription billing | % + per-transaction | https://dashboard.stripe.com | Stripe Reporting API | TBD | 🟡 manual |
| TrueLayer — `TRUELAYER_CLIENT_ID/_SECRET` | Banking | Open banking aggregation (current prod provider) | Per-connection / tiered | https://console.truelayer.com | Dashboard only | TBD | 🟡 manual |
| Yapily | Banking | Open banking aggregation (built, awaiting approval) | £600/mo flat when active | https://dashboard.yapily.com | Flat invoice | £600 (when active) | 🟡 manual |

### Email / Comms

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Resend — `RESEND_API_KEY` | Email/Comms | Transactional email (auth, receipts, alerts) | Per-email tiers | https://resend.com/overview | Resend usage API | TBD | 🟡 manual |
| Twilio | Email/Comms | Auth (verify) + SMS notifications | Per-message + verify fee | https://console.twilio.com | Twilio Usage API | TBD | 🟡 manual |
| Meta WhatsApp Business | Email/Comms | WhatsApp template messages to users | Per-template / per-conversation | https://business.facebook.com | Graph API billing endpoint | TBD | 🟡 manual |
| Telegram Bot | Email/Comms | Founder ops notifications | Free | https://core.telegram.org/bots | n/a | £0 | 🟡 manual |
| Late API — `LATE_API_KEY` | Email/Comms | Scheduled social posts | Subscription | https://getlate.dev | API + dashboard | TBD | 🟡 manual |
| Meta Graph API | Email/Comms | FB/IG posting + WhatsApp delivery | Bundled with WhatsApp/Ads | https://developers.facebook.com | Graph API | TBD | 🟡 manual |

### Auth / Integrations

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Google OAuth (Workspace + Cloud) | Auth/Integrations | Google sign-in + Gmail/Calendar scopes | Free (within quotas) | https://console.cloud.google.com | GCP billing API | TBD | 🟡 manual |
| Microsoft Entra (Outlook) | Auth/Integrations | Outlook sign-in + Mail scopes | Free tier | https://entra.microsoft.com | Dashboard only | £0 | 🟡 manual |
| ipapi.co — `IPAPI_KEY` | Auth/Integrations | IP geolocation for fraud / pricing | Tiered subscription | https://ipapi.co/dashboard | Dashboard only | TBD | 🟡 manual |
| Firebase | Auth/Integrations | Push notifications (mobile apps) | Spark/Blaze tiers | https://console.firebase.google.com | GCP billing API | TBD | 🟡 manual |

### Analytics

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| PostHog — `POSTHOG_API_KEY` | Analytics | Product analytics + session replay | Per-event tiers | https://eu.posthog.com | PostHog billing API | TBD | 🟡 manual |
| Vercel Analytics | Analytics | Web vitals + traffic | Included in Vercel Pro | https://vercel.com/analytics | n/a (bundled) | £0 | 🟡 manual |

### Productivity / Dev

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Google Workspace (hello@/business@/noreply@ paybacker.co.uk) | Productivity/Dev | Email + Drive + Calendar | Per-seat subscription | https://admin.google.com | Dashboard only | TBD | 🟡 manual |
| Apple Developer | Productivity/Dev | iOS App Store distribution | $99/yr | https://developer.apple.com/account | Annual invoice | ~£8 | 🟡 manual |
| Google Play Developer | Productivity/Dev | Play Store distribution | $25 one-off | https://play.google.com/console | One-off | £0 (paid) | 🟡 manual |
| Cursor / Claude Code subscriptions | Productivity/Dev | Founder dev tooling | Per-seat subscription | (per provider) | Dashboard only | TBD | 🟡 manual |
| Paperclip team API | Productivity/Dev | Internal team API utility | Per-call / subscription | (vendor dashboard) | Dashboard only | TBD | 🟡 manual |

### Marketing

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Google Ads | Marketing | Paid search acquisition | CPC | https://ads.google.com | Google Ads API | TBD | 🟡 manual |
| Meta Ads | Marketing | FB/IG paid acquisition | CPM/CPC | https://business.facebook.com | Marketing API | TBD | 🟡 manual |
| Awin | Marketing | Affiliate network (cashback partner) | Commission + tenancy | https://ui.awin.com | Awin reporting API | TBD | 🟡 manual |
| TikTok Ads | Marketing | Short-form paid acquisition | CPM/CPC | https://ads.tiktok.com | Marketing API | TBD | 🟡 manual |
| Reddit Ads | Marketing | Subreddit paid acquisition | CPM/CPC | https://ads.reddit.com | Dashboard only | TBD | 🟡 manual |
| X/Twitter Ads | Marketing | X paid acquisition | CPM/CPC | https://ads.twitter.com | Dashboard only | TBD | 🟡 manual |
| Influencer payments | Marketing | Ad-hoc creator partnerships | Per-deal | n/a | Manual entry | TBD | 🟡 manual |

### Legal / Compliance

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Companies House | Legal/Compliance | Annual confirmation statement | £13/yr | https://www.gov.uk/government/organisations/companies-house | Annual invoice | ~£1 | 🟡 manual |
| ICO data protection | Legal/Compliance | Data controller registration | ~£40/yr | https://ico.org.uk | Annual invoice | ~£3 | 🟡 manual |
| Accountant retainer | Legal/Compliance | Bookkeeping + year-end accounts | Monthly retainer | n/a | Manual entry | TBD | 🟡 manual |
| Professional indemnity insurance | Legal/Compliance | PI cover for SaaS / advice | Annual premium | (broker portal) | Manual entry | TBD | 🟡 manual |
| Cyber liability insurance | Legal/Compliance | Breach + cyber cover | Annual premium | (broker portal) | Manual entry | TBD | 🟡 manual |
| Trademark filing | Legal/Compliance | UK trademark registration | One-off ~£170/class | https://www.gov.uk/how-to-register-a-trade-mark | One-off | £0 (amortised) | 🟡 manual |
| DPA / T&Cs legal review | Legal/Compliance | Solicitor review of terms | Per-engagement | n/a | Manual entry | TBD | 🟡 manual |

### Other

| Service | Category | What it does | Pricing model | Console URL | Billing access method | Est. monthly cost | Integration status |
|---|---|---|---|---|---|---|---|
| Logo / brand design | Other | One-off brand assets | One-off | n/a | Manual entry | £0 (amortised) | 🟡 manual |
| Domain renewal | Other | Annual domain renewals | Annual flat | (registrar) | Manual entry | TBD | 🟡 manual |
| Founder phone bill (if business) | Other | Phone line if expensed to business | Monthly | (carrier) | Manual entry | TBD | 🔴 not started |

---

## Section 2 — Cost-pull integration plan

**Have a public billing/usage API — wire into `cost-ledger.ts` or a scheduled puller:**

- **Stripe** — Reporting API + Balance Transactions; pull MRR + Stripe fees nightly.
- **Anthropic (main + agents)** — already wired per-call; Admin API can backstop with an authoritative monthly figure.
- **Perplexity** — already wired per-call.
- **PostHog** — Billing API exposes current period spend; nightly cron.
- **Resend** — Usage endpoint; nightly cron for emails-sent + tier cost.
- **Twilio** — Usage Records API; nightly cron for SMS + Verify spend.
- **Late API** — exposes account/usage endpoints; nightly cron.
- **Awin** — Reporting API for commissions paid out (negative cost / partner revenue).
- **Google Ads / Meta Ads / TikTok Ads** — each has a Marketing/Reporting API; medium-term pull. Until then, dashboard-only.
- **GCP-billed (Gemini, Firebase, Google OAuth)** — GCP Cloud Billing API, single integration covers all three.

**Dashboard-only — needs monthly manual entry via `manual_cost_estimates`:**

- TrueLayer (no public billing API)
- Yapily (flat invoice)
- Vercel, Supabase, GitHub (no public per-account billing API on current plans)
- Google Workspace (admin console only)
- ICO, Companies House, accountant, insurance premiums, legal fees
- fal.ai, Runway ML, Cursor / Claude Code subs, Paperclip
- Reddit Ads, X Ads, influencer payments
- Domain registrar, Apple/Google Developer, founder phone

**Defer (low priority / negligible):**

- Telegram Bot (free)
- Microsoft Entra (free tier)
- Vercel Analytics (bundled)
- One-off costs (logo, trademark) — amortise once a quarter rather than build pulls.

---

## Section 3 — How to update this doc

When **adding a new service**:

1. Add a row to the appropriate sub-table in **Section 1**, including env var name (never the secret), console URL, and a realistic monthly estimate.
2. Decide the integration path:
   - If the service has a billing/usage API and is material to burn, wire it into [`src/lib/cost-ledger.ts`](../src/lib/cost-ledger.ts) and mark the row ✅ wired.
   - Otherwise add (or update) a row in `manual_cost_estimates` via the admin **Business Costs** tab and mark the row 🟡 manual.
3. If a service is being evaluated but not yet paid for, mark it 🔴 not started so it shows up in the "to action" view.

When **removing a service**: leave the row in place but strike through the name and add a "decommissioned YYYY-MM-DD" note in the `notes` column — this preserves the audit trail of what we used to spend.

When **repricing**: update the estimate in `manual_cost_estimates` (which timestamps `updated_at` automatically) and update the row in this doc in the same PR.
