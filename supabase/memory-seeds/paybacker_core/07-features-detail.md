# Features — Technical Detail

This is the granular breakdown of every Paybacker feature. Use it when you need to know
which file a feature lives in, which endpoint it calls, or which Supabase table backs it.

## 1. AI Complaint Letters
- Endpoint: `src/app/api/complaints/generate/route.ts` (the `complaint_writer` worker).
- Generator: `src/lib/agents/complaints-agent.ts`.
- Cites: Consumer Rights Act 2015, Consumer Credit Act 1974, EU261/UK261, Ofcom rules,
  Ofgem rules. Coverage: energy disputes, broadband complaints, debt-dispute responses,
  parking appeals, flight-delay compensation (up to £520), council-tax band challenges,
  HMRC tax rebates, DVLA, NHS, refunds.
- Free tier: 3 letters/month. Essential + Pro: unlimited.
- Storage: each letter is a row in `tasks` with `type='complaint_letter'`. Generation is
  also logged to `agent_runs`.

## 2. Subscription Tracking
- Manual add UI: `/dashboard/subscriptions`.
- Auto-detection: bank-connect data flows into `subscriptions` via the bank-sync cron.
- API CRUD: `src/app/api/subscriptions/route.ts`, `src/app/api/subscriptions/[id]/route.ts`.
- AI cancellation email: `src/app/api/subscriptions/cancellation-email/route.ts` (Essential
  + Pro).

## 3. Bank Connection (TrueLayer / Yapily)
- OAuth: `src/app/api/auth/truelayer/route.ts`, fallback `src/app/api/auth/yapily/route.ts`.
- Cap enforcement: at connect endpoints reading `PLAN_LIMITS[tier].maxBanks`. Over-cap
  returns 403.
- Daily sync cron: `/api/cron/bank-sync` (3am, 2pm, 7pm UTC).
- Pro tier: on-demand manual refresh.
- Spending categorisation: 20+ categories powered by Claude.

## 4. Email Inbox Scanning
- OAuth: `src/app/api/auth/google/route.ts` (Gmail), `src/app/api/auth/microsoft/route.ts`
  (Outlook).
- Cap enforcement: as bank cap, but redirects to
  `/dashboard/profile?email_limit_reached=1`.
- 30-min Watchdog dispute-reply polling for Free + Essential + Pro.
- Opportunity Scanner: finds overcharges, forgotten subs, flight-delay opportunities,
  debt disputes. Smart action buttons in the UI.
- Backed by `email_threads`, `email_opportunities` tables (verify in
  `supabase/migrations`).

## 5. AI Cancellation Emails (Essential + Pro)
- Generates cancellation email citing UK consumer law.
- Provider-specific advice via the `provider_intelligence` cache.

## 6. Renewal Reminders (Essential + Pro)
- Cron: `/api/cron/renewal-reminders` (daily 8am UTC).
- Sends at 30, 14, 7 days before any contract renews.
- Uses Resend.

## 7. Contract Tracking
- Stored in `contracts` (or via `subscriptions.contract_*` columns).
- Tracks: type, start/end dates, term length, annual cost, interest rates, remaining
  balance, provider type, tariff, postcode, property details.

## 8. Government / Regulatory Forms
- HMRC tax rebates, council-tax challenges, DVLA, NHS complaints, parking appeals,
  flight comp, debt disputes, refunds.
- All generated via the same complaint-writer pipeline with form-specific prompts.

## 9. AI Support Chatbot
- Available on every page.
- Endpoint: `src/app/api/chatbot/route.ts`.
- Escalation: creates a support ticket; Riley auto-responds via 15-min cron.
- Gap analysis cron: `/api/cron/analyze-chatbot-gaps` (Mon 6am).

## 10. Loyalty Rewards
- Points for every action.
- Tiers: Bronze, Silver, Gold, Platinum.
- Redemption: subscription discounts.
- Backed by `loyalty_points`, `loyalty_redemptions`.

## 11. Money Hub Financial Intelligence Centre
- Income tracking, spending intelligence, net worth.
- AI-powered transaction categorisation with user recategorisation.
- Interactive monthly trends with hover tooltips.
- Full budget planner (category-linked limits + email/push alerts).
- Savings goals with progress visualisation.
- Financial Action Centre with email-scan integration.
- Guided walkthrough tour for new users.
- Pro AI chatbot: dashboard customisation (pie charts, bar charts via conversation),
  dynamic widget generation through chat.

## Cron-driven intelligence (preserve, don't duplicate)

| Cron | Schedule | Purpose |
|---|---|---|
| `/api/cron/discover-features` | Daily 02:00 UTC | Scans `src/` for new routes |
| `/api/cron/analyze-chatbot-gaps` | Mon 06:00 UTC | Groups unanswered chatbot questions |
| `/api/cron/daily-ceo-report` | Daily | CEO summary email |
| `/api/cron/aggregate-provider-intelligence` | Sun 00:00 UTC | Provider competitive analysis |
| `/api/cron/refresh-cancellation-info` | Mon 03:00 UTC | Refresh provider cancellation info |
| `/api/cron/dispute-reply-sync` | Every 30 min | Watchdog email-thread polling |
| `/api/cron/waitlist-emails` | Mon + Thu 09:00 | Waitlist drip |
| `/api/cron/onboarding-emails` | Tue + Fri 10:00 | Onboarding drip |
| `/api/cron/bank-sync` | 03:00 / 14:00 / 19:00 UTC | TrueLayer/Yapily sync |
| `/api/cron/renewal-reminders` | Daily 08:00 UTC | 30/14/7-day renewal alerts |
| `/api/cron/telegram-morning-summary` | Daily 07:30 UTC | Pro user morning digest |
| `/api/cron/telegram-evening-summary` | Daily 20:00 UTC | Pro user evening digest |
| `/api/cron/telegram-weekly-summary` | Mon 07:00 UTC | Pro user weekly digest |
| `/api/cron/managed-agents` | Hourly :00 | Fires the Claude Managed Agents whose schedule matches now |
| `/api/cron/agent-digest` | 07:00 / 12:30 / 19:00 UTC | Sends consolidated managed-agent digest to founder via Telegram |

If you propose a new feature that overlaps with any of these, surface the overlap before
recommending the work.
