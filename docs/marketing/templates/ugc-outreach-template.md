# UGC Outreach — Direct Creator Email

**When to use:** For creators Paul spots organically on TikTok/Instagram (outside JoinBrands/Collabstr). Particularly relevant for consumer-rights, personal-finance, or UK-lifestyle creators with 10k-200k followers who've already posted angry-consumer content.

**Don't use for:** JoinBrands or Collabstr jobs — those have the brief attached directly and need no outreach email.

## Principles

- **Short and paid.** UGC creators get 50+ DMs a week. Offer the rate up front. No "let's chat first."
- **Specific about what you saw.** Reference the exact video that made you want to work with them. Copy-paste won't cut it.
- **One video, one rate, one deadline.** No retainers on first contact. Test with a single video.
- **Paid-in-pounds.** No "exposure" offers. Ever.

## Rate card (as of April 2026)

| Creator size | Per-video rate | Turnaround |
|---|---|---|
| Under 10k | £80-120 | 7 days |
| 10-50k | £150-220 | 7 days |
| 50-150k | £250-400 | 10 days |
| 150k+ | Case-by-case, starts £500 | 10-14 days |

Payment by bank transfer or PayPal within 5 business days of approval. Two rounds of revisions included.

## The DM / email

**Subject / opener (email) or first line (DM):** Love your [specific video reference]

---

Hi [FIRST NAME / @handle],

I watched your [video on the Sky broadband price rise / Euston parking fine / Tesco Mobile charge — BE SPECIFIC] last week and it's exactly the tone we're looking for.

I'm Paul, founder of Paybacker (paybacker.co.uk) — a UK AI tool that writes formal complaint letters citing consumer law in 30 seconds. FCA-authorised via Yapily, ICO registered. Real regulated product, not vaporware.

Would you be up for a single 30-60 second UGC video about it? We'd pay **£[RATE based on audience]** for a completed video. Full brief attached, two rounds of revisions included.

If yes — reply and I'll send the brief and a free Pro account so you can test the product first and make it real (we'd rather you tried it on an actual situation and filmed your honest reaction than script it).

If not — no worries, keep up the brilliant work.

Best,
Paul Airey
Paybacker · paybacker.co.uk

---

## Follow-up (once only, after 5 working days)

**Subject:** Re: [original]

Hi [FIRST NAME] — bumping this in case it got lost. Same offer (£[RATE], single video, brief attached). Completely fine to say no; just wanted to make sure you'd seen it.

Paul

---

## If they say yes

Send within 2 hours:

1. `ugc-creator-brief.md` as PDF attachment
2. A free Pro account set up with their email, 90-day complimentary access
3. Clear payment terms (when, how, how much)
4. Deadline (one week from brief receipt, negotiable to 10 days)
5. Asset handoff location (ugc@paybacker.co.uk or shared Dropbox)

Log in `ugc_creators` table (new — add migration):

```sql
CREATE TABLE IF NOT EXISTS ugc_creators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  handle TEXT,
  platform TEXT,
  followers INTEGER,
  niche TEXT,
  agreed_rate_gbp INTEGER,
  brief_sent_at TIMESTAMPTZ,
  video_received_at TIMESTAMPTZ,
  status TEXT DEFAULT 'contacted',  -- contacted / agreed / brief_sent / delivered / rejected / ghosted
  repost_url TEXT,
  ad_performance JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Sourcing list (ongoing)

Paul maintains a rolling list of 50+ UK creators. Criteria:

- UK-based (check bio / accent / location clues)
- 5k-200k followers on TikTok or Instagram (Reels)
- Has posted at least one angry-consumer, budget, or cost-of-living video in the last 90 days
- Reasonable engagement (5%+ likes/view ratio)
- No blatant brand-deal-per-post feed (diminishing returns, looks sponsored)

Rolling search queries (check weekly):

- TikTok: `#ukconsumer`, `#ukbills`, `#costoflivinguk`, `#ukrenters`, `#moneysavingtipsuk`
- Instagram: `#ukmoney`, `#ukdebt`, `#britishbills`
- Twitter/X: people complaining publicly about specific UK bill issues (often pivotable into a paid UGC deal)

## Batching for efficiency

Don't send one-offs. Batch outreach into cohorts of 10-15 creators per week. This means:

- One weekly sourcing sprint (90 min): find 15 creators, record into `ugc_creators` with 'contacted' status
- One weekly outreach sprint (45 min): send 15 personalised DMs/emails using the template above
- One follow-up sprint on Wednesdays: follow up anyone from 5+ days ago
- One admin sprint on Fridays: send briefs, Pro accounts, and payments for anyone who agreed

Expected conversion: 20-30% agree. So 15/week contacted → 3-5 videos/month at £150-300 average. Monthly UGC spend: £500-1,500, producing 3-5 ad creatives for paid testing.

## Automation option

Once the workflow is stable, `cron-ugc-outreach.md` describes a daily cron that drafts outreach messages using this template + creator bio/recent-video context from an Apify TikTok scrape. Drafts queue in a Supabase table for Paul to approve and send manually. Never auto-send — DMs that smell templated kill the relationship.
