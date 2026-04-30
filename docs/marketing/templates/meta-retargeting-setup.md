# Meta (Facebook + Instagram) — Retargeting & Paid Ads Setup

**Launch budget:** £10-15/day Meta total during the 60-day launch (£300-450/month). Paybacker's first paid budget goes into Google Search because intent is stronger. Meta is for retargeting + lookalike scaling once we have enough conversions to feed the algorithm.

**Critical constraint:** Paul disabled Meta Ads previously per the project-status memory. Verify current account health before running — if the old ad account has holds or policy strikes, use a fresh Business Manager with the authenticated Paybacker LTD business. Never run personal-profile ads.

## Account architecture

| Asset | Status | Action needed |
|---|---|---|
| Meta Business Manager | Exists | Verify business — upload Companies House cert for Paybacker LTD |
| Facebook Page | Live (ID 1056645287525328) | No action |
| Instagram account | Live (@paybacker.co.uk) | Pending Meta app review approval for API posting |
| Ad account | Verify status | If old account has policy issues: create new; re-run domain verification for paybacker.co.uk |
| Pixel + Conversions API | Check `src/lib/posthog/` | If Meta Pixel + CAPI not yet installed, install (CAPI is critical post-iOS 14) |
| Product catalogue | No | Not needed — we don't do DPA |
| Domain verification | TBC | Verify paybacker.co.uk via DNS TXT record in Meta → Brand Safety |

## Install Meta Pixel + CAPI (blocker)

Before running any ads, install both:

- **Meta Pixel** — client-side script in `src/app/layout.tsx`
- **Conversions API (CAPI)** — server-side events from Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) fires `Purchase` event server-side; `/api/waitlist` fires `CompleteRegistration`

Events to send:

1. `PageView` (auto)
2. `ViewContent` when user hits `/pricing` or `/complaint-generator`
3. `CompleteRegistration` when user creates account (fired server-side from `/api/auth/signup`)
4. `InitiateCheckout` when user clicks subscribe button
5. `Purchase` when Stripe confirms (server-side from webhook, includes value + currency GBP)
6. `Subscribe` custom event for Stripe `customer.subscription.created`

Pass all server-side events with a hashed email match key and the `fbp`/`fbc` cookies from the original page view to maximise match quality. Target match quality: ≥7.0/10.

## Campaign structure

### Campaign 1 — Retargeting (primary Meta play)

**Objective:** Conversions
**Budget:** £5/day
**Audiences (as custom audiences in Meta):**
1. Website visitors 30 days, excl. converters
2. Free-tier users 14 days, excl. paid subscribers
3. Cart abandoners (InitiateCheckout without Purchase) 30 days
4. Engaged Instagram/Facebook visitors 90 days

**Ad sets:** one per audience, 3 ads each.

**Creative mix per ad set:**
- 1 UGC-style video (from UGC library, 20-30 sec)
- 1 static carousel (3-card, "problem → product → CTA")
- 1 single-image static (from fal.ai ad creative library — see `ad-creative-prompts.md`)

**Placements:** Advantage+ placements. Let Meta optimise.

**Bid strategy:** Lowest Cost (no cap) for first 30 conversions; switch to Cost Cap at £10 CPA once 30+ conversions reached in last 7 days.

### Campaign 2 — Cold acquisition (smaller test)

**Objective:** Conversions
**Budget:** £5/day
**Audience:** Lookalike 1-3% of "30-day paid subscribers" — only launch once we have ≥30 paid subscribers (week 4-6 at earliest).
**Creative:** winning retargeting creatives, extended 45-60 second cuts.
**Placements:** Reels + Feed only (not Stories, not Audience Network).

### Campaign 3 — Brand / awareness (deprioritised)

Don't run during launch. Run only at scale (month 4+) to support the UGC flywheel.

## Ad creative — weekly refresh

Meta fatigues creative fast. Refresh weekly:

- 2 new pieces of UGC per week (from `ugc-outreach-template.md`)
- 2 new statics per week (via `cron-content-generator.md` and the fal.ai prompt library)
- Pause ads with >£15 CPA or >3-day spend without conversion
- Keep top-3 performers live across 4-week cycles

## Creative format requirements

| Format | Aspect | Length | Required elements |
|---|---|---|---|
| Reels / TikTok | 9:16 | 15-30s | First 2s hook, URL in last 3s, burned captions |
| Stories ads | 9:16 | 15s | Minimal text, strong single frame |
| Feed video | 1:1 or 4:5 | 15-60s | Same as Reels, slightly longer tolerated |
| Feed image | 1:1 | N/A | See `ad-creative-prompts.md` |
| Carousel | 1:1 | 3-5 cards | "Problem → Wrong way → Right way (Paybacker) → CTA" |

## Compliance and policy

Meta's financial-products rules are strict. Required:

- "Paybacker LTD" legal name in ad footer
- FCA reference via Yapily in fine print: "Open Banking provided by Yapily Ltd, FCA reference 827001"
- No "guaranteed savings" language
- No "clickbait" disclaimers ("You won't believe…")
- Never direct-quote named UK companies in negative framing (instead: "a major UK broadband provider…")
- Crystal-clear "Not legal advice. Paybacker drafts letter templates you choose whether to send." in long-form descriptions

## Measurement

- Conversions → PostHog (already the agreed analytics stack per CLAUDE.md) + Meta's reported conversions
- Truth-source is PostHog → Supabase, not Meta's attribution (which over-claims)
- Weekly Meta review (Fridays, 30 min): spend, CPA, CTR, unique CPM, creative fatigue (frequency >3 = rotate)

## What NOT to do

- Don't use Advantage+ Shopping Campaigns (we're not e-com)
- Don't link directly to Stripe checkout from an ad — always through a landing page for pixel-fire and objection handling
- Don't run ads from Paul's personal page
- Don't target under-18s (platform policy + ICP mismatch)
- Don't use automated placement on the Audience Network — low-quality traffic, junk fraud
- Don't run Facebook Audience Optimisation in legacy mode — switch to Advantage+ Audience
