# Google Ads — UK Consumer-Rights Keyword List

**Account context:** Google Ads developer token `jCSfgPvX1M1zrWb92a3Zyw`, customer ID `390-589-8717`, already live. This template defines the keyword and ad copy architecture for the launch sprint — not an account setup guide.

**Budget:** £15-30/day maximum during launch (£450-900/month). Paybacker is CPA-sensitive because the LTV is £4.99-9.99/mo subscription. Target: keep blended CAC under £8.

## Structure — 8 campaigns, each single-theme

Each campaign targets one specific consumer-rights problem. Lean single-keyword-per-ad-group (SKAG) where the volume supports it. Broad match is disabled by default.

| # | Campaign | Primary keywords (phrase or exact) | Landing page |
|---|---|---|---|
| 1 | Private parking fines | "appeal private parking fine", "parking charge notice appeal", "pofa 2012 appeal", "private parking fine uk" | `/dispute-parking-fine` |
| 2 | Energy bill disputes | "dispute energy bill", "energy back bill", "ofgem complaint", "energy overcharge" | `/dispute-energy-bill` |
| 3 | Broadband mid-contract rises | "broadband price rise", "ofcom broadband complaint", "exit broadband contract free", "cpi 3.9% broadband" | `/dispute-broadband` |
| 4 | Flight delay UK261 | "flight delay compensation uk", "uk261 claim", "airline compensation claim", "flight cancellation refund" | `/flight-delay-compensation` |
| 5 | Council tax band challenges | "council tax band challenge", "voa council tax appeal", "check council tax band", "council tax refund" | `/council-tax-challenge` |
| 6 | Gym/subscription cancellations | "cancel gym membership", "cancel sky subscription", "how to cancel [brand] subscription" (dynamic) | `/cancel-subscription` |
| 7 | Debt collection disputes | "dispute debt collection letter", "statute barred debt", "lowell debt letter", "debt collection complaint" | `/debt-collection-letter` |
| 8 | Brand — "Paybacker" | "paybacker", "paybacker.co.uk", "paybacker ai", "paybacker login" | `paybacker.co.uk` |

## Ad copy templates

Three Responsive Search Ads per ad group. Each has 15 headlines and 4 descriptions.

### Example — Campaign 1, Private parking fines

**Headlines (headline 1-15, pick top 3 for Google):**
1. Fight a Private Parking Fine
2. AI Appeal Letter in 30 Seconds
3. Free to Use, UK Consumer Law
4. 87% of Appeals Succeed
5. Cite POFA 2012 Correctly
6. Don't Pay Until You've Tried
7. Paybacker — FCA Authorised
8. Draft Your Appeal in Minutes
9. No Solicitor, No Fee
10. Free UK Complaint Letter AI
11. Stop Paying Unfair Fines
12. Written By AI, Read By The Operator
13. Beat Your PCN — Free
14. Includes Every Legal Ground
15. Paybacker.co.uk — Try Free

**Descriptions (pick 2):**
1. Paybacker drafts your formal parking appeal citing POFA 2012 and the exact procedural grounds. Free to try, 3 letters a month on the free plan, forever. FCA authorised.
2. UK-registered AI that writes your parking appeal in 30 seconds. Cites the legislation, includes the right procedural points. Free tier — no card. Start at paybacker.co.uk.
3. 87% of formally-appealed private parking charges are cancelled. The hard part is writing the letter. Paybacker does that in 30 seconds, for free. Try it now.
4. Stop paying unfair parking fines. Our AI reads UK consumer law and drafts your appeal letter — citing POFA 2012, signage issues, and GPEOL — in 30 seconds.

Reuse this pattern for every campaign, swapping the specific law (UK261, Ofgem, VOA, etc.) and hook percentage.

## Negative keyword list (apply at account level)

Block junk queries that burn budget:

- parking ticket [city] (too local/commercial — lawyers bid)
- solicitor, lawyer, barrister, attorney
- free lawyer, pro bono
- how to pay, how much is
- scam, scam alert, is paybacker a scam
- software engineer, developer, career, job
- api, pricing api
- [all competitor names exactly]: donotpay, resolver, which, citizens advice

## Bid strategy

- **Launch sprint (days 1-30):** Manual CPC, £1.50-3.00 max bid per keyword depending on commercial intent. Manual mode lets you spot burn-rate issues in week 1.
- **Days 30-90:** Switch to Maximize Conversions with target CPA of £8 once we have ≥30 conversions per campaign.
- **Brand campaign (Paybacker):** always Maximize Clicks, £0.20-0.50 cap — cheap, just defending brand.

## Conversion tracking

Set these conversion actions in Google Ads (imported from GA4 or PostHog):

1. **Signup** (primary) — user creates free account, value £8 (implied LTV of free user who converts)
2. **Paid conversion** (bonus) — Stripe `checkout.session.completed`, value £60 (implied 1-yr average for Essential)
3. **Letter generated** (micro-conversion for ad optimisation, not reporting) — first complaint letter drafted, value £4

GA4 event configuration is already set up in the existing codebase (check `src/lib/analytics`); if not, the cron `cron-content-generator.md` is a bad fit for this — this is a separate one-time setup.

## Landing page requirements per campaign

Every campaign lands on a dedicated page (listed in the table above). Each page must:

- Repeat the exact keyword/theme in H1 (e.g. "Fight a Private Parking Fine in 30 Seconds")
- State the specific UK legislation up front (e.g. "Appeal under POFA 2012")
- Include a free-tier CTA above the fold
- Include one real case-study (name, amount, outcome, "happy to be contacted" disclosure)
- Include the "Free, 3 letters per month forever" disclosure in the hero
- Include trust signals: FCA authorised via Yapily, ICO registered, UK-registered Ltd company

If any of these pages don't exist yet at `src/app/(marketing)/`, building them is a launch-blocker.

## Performance review cadence

- **Daily (days 1-14):** 10-min review of spend, click-through rate, top search-term report. Add negatives as they show up.
- **Weekly (days 15-60):** 30-min review. Pause ad groups with CPA > £15. Double down on ad groups with CPA < £5.
- **Monthly (day 60+):** Full QBR — keyword expansion, landing page optimisation, negative list audit.

## What NOT to do

- Don't bid on competitor brand names (Martin Lewis, MoneySavingExpert, DoNotPay, Resolver). Expensive, often poor quality score, plus it invites retaliation.
- Don't use broad match during launch — lets Google waste budget on loosely-related queries.
- Don't run Dynamic Search Ads until the site has a strong content footprint (month 3+).
- Don't import "smart" campaigns from Google's recommendations — they optimise for clicks, not CAC.
