# Consumer abandonment nurture — system design

Implementation contract for the B2C abandoned-cart / abandoned-checkout CRM. Companion to `consumer-abandonment-research.md`.

**Scope guard:** Consumer (B2C) only. Anything tagged `metadata.product='b2b_api'` or routed via `src/lib/b2b/**`, `src/app/api/v1/**`, `src/app/for-business/**` is untouched. The B2B founder-direct Telegram + email path remains.

## 1. Data model

The existing `public.leads` table is the social-DM lead funnel (Instagram, Facebook DMs, comments — different schema, different lifecycle). To avoid mixing concerns, this feature adds a **new table `consumer_leads`** plus an audit table `consumer_lead_email_log`.

### `consumer_leads`

| column | type | notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `email` | text NOT NULL | lower-cased on insert |
| `name` | text | nullable |
| `phone` | text | nullable |
| `source` | text | `signup_form` \| `stripe_checkout_abandoned` \| `pricing_page_exit` \| `onboarding_dropoff` |
| `stripe_checkout_session_id` | text | nullable, unique partial |
| `stripe_customer_id` | text | nullable |
| `stripe_recovery_url` | text | nullable, taken from `session.after_expiration.recovery.url` |
| `intended_tier` | text | `essential` \| `pro` |
| `intended_billing_interval` | text | `monthly` \| `yearly` |
| `funnel_stage` | text | see stages below; default `new` |
| `captured_at` | timestamptz | default now() |
| `last_emailed_at` | timestamptz | nullable |
| `email_count` | integer | default 0 |
| `discount_code` | text | nullable; Stripe promotion code (human-readable) |
| `discount_coupon_id` | text | nullable; Stripe coupon id (machine) |
| `discount_code_expires_at` | timestamptz | nullable |
| `discount_redeemed_at` | timestamptz | nullable |
| `converted_at` | timestamptz | nullable |
| `converted_user_id` | uuid | nullable; FK soft-link to `profiles.id` |
| `unsubscribed_at` | timestamptz | nullable |
| `unsubscribe_token` | text NOT NULL | random URL-safe token, indexed unique |
| `ip_address` | inet | nullable |
| `user_agent` | text | nullable |
| `utm_source` / `utm_medium` / `utm_campaign` | text | nullable |
| `notes` | text | founder manual notes |
| `last_contacted_via` | text | `email` \| `manual_note` \| `phone` |
| `created_at` / `updated_at` | timestamptz | trigger `updated_at` |

### Funnel stages

`new` → `email_1_sent` → `email_2_sent` → `email_3_sent` → `email_4_sent` → terminal (`converted_paid` | `converted_free` | `unsubscribed` | `expired` | `manual_handling`).

### `consumer_lead_email_log`

Append-only audit. ICO-friendly:

- `id` uuid PK
- `consumer_lead_id` uuid FK consumer_leads(id) on delete cascade
- `template` text — `email_1_soft_reminder` | `email_2_value_nudge` | `email_3_discount` | `email_4_final` | `manual_followup`
- `subject` text
- `resend_message_id` text
- `sent_at` timestamptz default now()
- `metadata` jsonb

### Indexes

- `consumer_leads(email)` — dedupe lookups
- `consumer_leads(funnel_stage)` — dashboard filter + cron sweep
- `consumer_leads(captured_at)` — recency
- `consumer_leads(unsubscribe_token)` UNIQUE — public unsub endpoint lookup
- `consumer_leads(stripe_checkout_session_id)` UNIQUE WHERE NOT NULL — webhook idempotency
- `consumer_lead_email_log(consumer_lead_id)`

### RLS

`enable rls`. Single permissive policy: service-role only (admin endpoints use service-role client; admin UI calls go through API routes guarded by `authorizeAdminOrCron`). No anon access. The unsubscribe endpoint uses the service role + token match.

## 2. Capture points

1. **Stripe webhook `checkout.session.expired`** (`src/app/api/webhooks/stripe/route.ts`). Existing handler already filters `metadata.product==='b2b_api'` to the B2B path. We add a B2C branch immediately after that check: pull `customer_details.email`, line-item price → tier, session id; upsert into `consumer_leads` keyed on `stripe_checkout_session_id`. Source = `stripe_checkout_abandoned`.

2. **Pricing-page subscribe click → /api/leads/capture** — lightweight POST endpoint that accepts `{ email, intended_tier, intended_billing_interval, utm_* }` and inserts `consumer_leads` with source `signup_form`. Called from `PricingCTA.tsx` only when the user is logged-out (logged-in users will hit the Stripe webhook path naturally). Best-effort, fire-and-forget — errors don't block the redirect to `/auth/signup`.

3. **Onboarding drop-off** — out of scope for v1 (would need new step-by-step capture). Listed as a follow-up; wires are designed to support it later by passing `source='onboarding_dropoff'`.

## 3. Email sequence

Daily cron `/api/cron/consumer-nurture` at **10:00 UTC**.

For each non-terminal lead:

| email_count + age | action |
|-------------------|--------|
| 0 sent + age ≥ 1h | Send Email 1; stage → `email_1_sent` |
| 1 sent + age since last_emailed ≥ ~22h | Send Email 2; stage → `email_2_sent` |
| 2 sent + age since last_emailed ≥ ~46h | Generate Stripe coupon (10%, once, max_redemptions=1, redeem_by=+7d); send Email 3; stage → `email_3_sent` |
| 3 sent + age since last_emailed ≥ ~5d | Send Email 4 (discount expiring); stage → `email_4_sent` |
| 4 sent + age ≥ 14d total | stage → `expired` |

Hard skips: `unsubscribed_at IS NOT NULL`, `funnel_stage IN ('converted_paid','converted_free','expired','manual_handling','unsubscribed')`.

Cron concurrency: limit batch to 200 per run; cron runs daily so backlog grows < cap easily.

## 4. Subject lines (chosen)

1. **Email 1** — `Did you forget something?`
2. **Email 2** — `Why most LifeAdmin users pick {tier_name}`
3. **Email 3** — `A small thank-you: 10% off LifeAdmin (7 days)`
4. **Email 4** — `Last call — your 10% code expires soon`

British copy throughout. £ symbol. Dark-mode-safe HTML using the same wrap/header/footer pattern as `dispute-reminders.ts`. Plain-text alternative provided to Resend.

## 5. Stripe coupon flow

Helper `src/lib/stripe/coupons.ts → createOneOffDiscountCoupon(email, percentOff=10, durationDays=7)`:

1. Create Coupon: `percent_off=percentOff`, `duration='once'`, `max_redemptions=1`, `redeem_by=floor((now+7d)/1000)`, `name='LifeAdmin abandonment recovery 10%'`, `metadata.lead_email=email`.
2. Create Promotion Code: `coupon=<id>`, `code='WELCOME10-' + 6 random A-Z0-9 chars`, `max_redemptions=1`, `expires_at=redeem_by`, `metadata.lead_email=email`.
3. Return `{ coupon_id, promo_code, expires_at }`.

Stripe Checkout sessions on the consumer side are created by `/api/stripe/checkout`. The user pastes `WELCOME10-XXXXXX` in the Stripe Checkout promo box. We don't auto-attach — pasting matches the consumer mental model and keeps the coupon redemption traceable.

Naming pattern: `WELCOME10-<6 base32 chars>` e.g. `WELCOME10-A7K2QF`. Friendly, screams "welcome offer", easy to read aloud.

## 6. Admin dashboard

Existing admin sidebar already routes to `/dashboard/admin/leads` (social DM leads). To avoid mixing models, add a sibling route **`/dashboard/admin/consumer-leads`** with its own sidebar entry "Consumer leads".

Page composition:

1. **Funnel bar** — horizontal stage counts: `new → email_1 → email_2 → email_3 → email_4 → converted`. Plus headline conversion rate (% converted_paid of all captured).
2. **Filterable table** — Email, Name, Source, Tier, Stage, Captured, Last emailed, # emails, Discount code (clickable to Stripe dashboard), Converted? Filters: stage, source, age range. Default sort: captured_at DESC.
3. **Drill-in drawer** — click row → side drawer:
   - Timeline of emails sent (from `consumer_lead_email_log`)
   - Discount code + expiry + redeemed?
   - Notes textarea (saves on blur)
   - Action buttons: Mark converted (paid), Mark unsubscribed, Send manual follow-up email, Generate fresh discount code, Move to manual_handling.
4. **Aggregate metric tiles** — Captured this week, Recovery rate (converted/captured all-time), Revenue recovered (count converted × headline tier price — quick-and-dirty proxy until we wire actual MRR), Cost per lead (`email_count × £0.0004`).

Backed by API routes under `/api/admin/consumer-leads/*` — all guarded by `authorizeAdminOrCron`.

## 7. GDPR/PECR compliance

Lawful basis = **PECR reg. 22(3) "soft opt-in"**, not raw legitimate-interest:

- Contact details captured during sale-or-negotiation (Stripe Checkout / pricing-page subscribe) ✔
- Marketing limited to similar products/services (the same SaaS plans) ✔
- Clear opt-out at point of collection (we add a microcopy under the pricing CTA: "By continuing you agree we may email you about your order. Unsubscribe in one click anytime.")
- One-click opt-out in every email — bottom-of-email primary footer link `https://paybacker.co.uk/api/unsubscribe?token=...`
- Honoured immediately (sets `unsubscribed_at`, stage→`unsubscribed`, audit row written)
- Email log retained 24 months for ICO audit; can be purged on data-subject request

Email 1 is framed transactionally where possible ("you started a checkout — here's how to finish") so even a strict reading gives us cover. Emails 2–4 are clearly soft-opt-in marketing.

## 8. PostHog events

Server-side, fire-and-forget via `captureServer`:

- `lead_captured` — props: source, intended_tier, intended_billing_interval
- `nurture_email_sent` — props: template, email_count_after, lead_id
- `discount_code_issued` — props: promo_code, percent_off, lead_id
- `lead_converted` — props: tier, lead_id
- `lead_unsubscribed` — props: lead_id, email_count_at_unsub

Distinct id = `consumer_lead:<id>` so the funnel renders cleanly in PostHog without polluting authenticated-user IDs.

## 9. vercel.json

Append:

```json
{ "path": "/api/cron/consumer-nurture", "schedule": "0 10 * * *" }
```

## 10. File map

New files:

- `supabase/migrations/20260430170000_consumer_leads_nurture.sql`
- `src/app/api/leads/capture/route.ts`
- `src/app/api/cron/consumer-nurture/route.ts`
- `src/app/api/unsubscribe/route.ts`
- `src/app/unsubscribe/page.tsx` (success page)
- `src/app/api/admin/consumer-leads/route.ts` (list/aggregate)
- `src/app/api/admin/consumer-leads/[id]/route.ts` (drill-in actions: notes, mark stages, fresh code, manual email)
- `src/app/dashboard/admin/consumer-leads/page.tsx`
- `src/app/dashboard/admin/consumer-leads/ConsumerLeadsClient.tsx`
- `src/lib/stripe/coupons.ts`
- `src/lib/email/consumer-nurture.ts`
- `src/lib/consumer-leads/capture.ts` (shared capture helper used by webhook + endpoint)

Modified files:

- `src/app/api/webhooks/stripe/route.ts` — add B2C `checkout.session.expired` capture branch
- `src/app/pricing/PricingCTA.tsx` — fire `/api/leads/capture` for logged-out subscribe clicks (best-effort)
- `src/app/dashboard/admin/layout.tsx` — sidebar entry "Consumer leads"
- `vercel.json` — new cron entry
- `CLAUDE.md` — FEATURES section update
