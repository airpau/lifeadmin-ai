# PostHog → Google Ads + Meta Ads (server-side conversion forwarding)

This is a **no-code** setup that complements the client-side conversion tags I shipped in #34-#37. PostHog is already integrated app-wide (`@/lib/posthog`), so this just turns on its built-in Destinations to forward signup + upgrade events to Google Ads and Meta server-to-server.

## Why bother (if we already have client-side tags)

| Channel | Reaches Google Ads / Meta? | Survives… |
|---|---|---|
| Browser pixel (Meta Pixel, gtag.js) | ✅ for users without ad blockers | iOS Safari ITP cookies expire after 7d. Brave/uBlock just block. |
| **PostHog server forwarding** | ✅ via Conversions API + Enhanced Conversions | Always. Server→server, no cookies required. |

You want both. Browser tags catch most users instantly; server forwarding picks up the 20-30% lost to blockers and Safari ITP.

## Pre-reqs (confirm these exist)

- [x] PostHog project on EU instance (`https://eu.posthog.com`) — already in use
- [ ] Google Ads account ID `AW-XXXXXXXXXX` (waiting on task #49)
- [ ] Meta Conversions API access token (Meta Business Settings → Data Sources → Datasets → your Pixel → Conversions API → Generate access token)
- [ ] Meta Pixel ID `722806327584909` — already known

## Step 1: PostHog event taxonomy (10 min)

Confirm the following events are firing in PostHog Live Events. If any are missing, see "Event firing locations" at the bottom of this doc and add them.

| PostHog event | Fires on | Maps to Google Ads | Maps to Meta CAPI |
|---|---|---|---|
| `signup_completed` | Post-signup landing page | Conversion: "Signup" | `CompleteRegistration` |
| `paid_upgrade` | Stripe checkout success page | Conversion: "Paid upgrade" with revenue | `Purchase` with value |
| `letter_generated` | First successful AI letter | Conversion: "Activated user" (optional) | `Lead` (optional) |
| `bank_connected` | First Yapily success | Conversion: "Activated user" (optional) | `Lead` (optional) |

Each event must include `$user_id` (PostHog auto-sets this if you call `posthog.identify()` after auth) and an `email` property (PostHog hashes it before forwarding to ad platforms — required for Enhanced Conversions matching).

## Step 2: Add the Google Ads destination (5 min)

PostHog UI → Data pipeline → Destinations → New destination → "Google Ads Conversions".

Fill in:
- **Customer ID**: digits-only version of `AW-XXXXXXXXXX` (i.e. drop the `AW-` prefix and any dashes)
- **Developer token**: from Google Ads → Tools → API Center
- **OAuth refresh token**: PostHog walks you through the OAuth flow
- **Login Customer ID**: same as Customer ID for non-MCC accounts

Then map events:

```
signup_completed   →  conversion action "Signup",
                      value: 0,
                      currency: GBP

paid_upgrade       →  conversion action "Paid upgrade",
                      value: ${value} (the property),
                      currency: GBP,
                      transaction_id: ${stripe_session_id}
```

Toggle "Enhanced conversions for leads" on so the email is hashed and matched against Google's user graph.

## Step 3: Add the Meta CAPI destination (5 min)

PostHog UI → Destinations → "Meta Ads Conversions API".

Fill in:
- **Pixel ID**: `722806327584909`
- **Access token**: from Meta Business Settings (see pre-reqs)
- **Test event code** (optional): use Meta's Event Manager test events tab to verify

Map events:

```
signup_completed   →  CompleteRegistration
                      content_name: "Paybacker free signup"

paid_upgrade       →  Purchase
                      value: ${value}
                      currency: GBP
                      content_ids: [paybacker-${tier}-${billingPeriod}]
```

PostHog automatically generates `event_id` from the PostHog event UUID, which Meta uses to dedupe against the browser pixel that fires the same event with the same id from `<UpgradeConversionTracker dedupeKey={...}>`.

## Step 4: Verify dedupe is working (10 min, run after first real conversion)

For Google Ads: Conversions → click your conversion action → look for "Verification" tab. After 24-48h, "Click ID match rate" should be > 70%.

For Meta: Events Manager → your pixel → Diagnostics. Look for "Browser & Server" overlap rate ≥ 80% (means dedupe is working — events from both sources are being matched on `event_id`).

If dedupe rate is low: confirm `dedupeKey` in `<SignupConversionTracker />` and `<UpgradeConversionTracker />` matches the `$insert_id` PostHog uses for the corresponding event. Adjust the helper to pass `posthog.get_distinct_id()` if needed.

## Event firing locations (where to add posthog.capture)

If any events from Step 1 aren't firing in PostHog yet, add them here:

| Event | File | What to add |
|---|---|---|
| `signup_completed` | `src/app/dashboard/page.tsx` (post-signup landing) | `useEffect(() => { capture('signup_completed', { email: user.email }); posthog.identify(user.id, { email: user.email }); }, [user.id]);` (only on first visit; gate with sessionStorage like `<SignupConversionTracker>` does) |
| `paid_upgrade` | `src/app/dashboard/billing/success/page.tsx` (Stripe success) | `useEffect(() => { capture('paid_upgrade', { value: amountGbp, currency: 'GBP', tier, billing_period: billingPeriod, stripe_session_id: session.id }); }, [session.id]);` |
| `letter_generated` | `src/app/dashboard/complaints/page.tsx` (already has `capture` import) | `capture('letter_generated', { topic: complaint.topic });` after successful letter creation |
| `bank_connected` | `src/lib/yapily/callback.ts` or wherever Yapily success redirect handles | `captureServer('bank_connected', { user_id: userId, bank_name: bankName });` |

## Cost note

PostHog's destinations cost £0 on the free tier up to 1M events/month (which is plenty for v1). Server→server conversion forwarding doesn't itself cost anything from Google/Meta — it just improves your CPA reporting.

## When NOT to use this

If you decide to fire conversions exclusively via the Stripe webhook (`customer.subscription.created` event in `/api/webhooks/stripe`), you can skip the Stripe-success-page client tracker AND the PostHog `paid_upgrade` event — push directly to Google Ads via `google-ads-api` (already a dependency in package.json) and to Meta via the CAPI HTTP endpoint. That's the most accurate setup but more code to maintain. PostHog destinations are the fastest path to "good enough" attribution.
