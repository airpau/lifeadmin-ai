# Cron — UGC Creator Outreach Draft Generator

**Purpose:** Three times a week (Mon/Wed/Fri at 10:00 UK), pull a fresh list of UK micro-influencers in consumer-rights / personal-finance / cost-of-living niches, draft personalised outreach messages using `ugc-outreach-template.md`, and queue them in Paul's admin dashboard for manual review and send.

**Why manual send:** Platforms detect bot-sent DMs/emails within 20 messages. A draft-then-send-by-human workflow keeps the outreach platform-safe while still saving ~90% of Paul's time.

## File: `src/app/api/cron/ugc-outreach/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { scrapeTikTokCreators } from '@/lib/apify'; // new helper

const CRON_SECRET = process.env.CRON_SECRET!;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AGENTS_API_KEY! });

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient();

  // 1. Source new creators via Apify TikTok scraper
  //    Search hashtags that signal ICP: #ukconsumer, #costoflivinguk, #ukbills, etc.
  const creators = await scrapeTikTokCreators({
    hashtags: ['ukconsumer', 'costoflivinguk', 'ukbills', 'ukrenters', 'moneysavingtipsuk'],
    minFollowers: 5000,
    maxFollowers: 200000,
    minEngagementRate: 0.04,
    limit: 25,
  });

  // 2. Filter out creators we've already contacted
  const existingHandles = (await supabase
    .from('ugc_creators')
    .select('handle'))
    .data?.map(c => c.handle) ?? [];

  const fresh = creators.filter(c => !existingHandles.includes(c.handle));

  // 3. Pick top 10 by "fit score"
  //    Fit score = engagement_rate × (has_consumer_rights_video ? 2 : 1)
  const scored = fresh.map(c => ({
    ...c,
    fitScore: c.engagementRate * (c.lastVideos.some((v: any) =>
      /bill|fine|contract|refund|parking|broadband|energy|price rise|ripped off/i.test(v.title)
    ) ? 2 : 1),
  })).sort((a, b) => b.fitScore - a.fitScore).slice(0, 10);

  // 4. For each: draft personalised outreach, insert into ugc_creators (status: 'pending_send')
  const drafts = [];
  for (const creator of scored) {
    const draftMessage = await draftOutreach(creator);
    const rateBracket = pickRate(creator.followers);

    const { data, error } = await supabase.from('ugc_creators').insert({
      name: creator.displayName,
      handle: creator.handle,
      platform: 'tiktok',
      followers: creator.followers,
      niche: creator.primaryNiche,
      agreed_rate_gbp: rateBracket.suggestedRate,
      status: 'pending_send',
      notes: `Draft ready. Fit score ${creator.fitScore.toFixed(2)}. Best recent video: ${creator.bestRecentVideo}`,
      draft_message: draftMessage,
    }).select().single();

    if (!error) drafts.push(data);
  }

  await supabase.from('agent_runs').insert({
    agent_name: 'cron-ugc-outreach',
    status: drafts.length > 0 ? 'success' : 'no_fresh_creators',
    output: { drafts_created: drafts.length },
  });

  return NextResponse.json({ success: true, drafts_created: drafts.length });
}

function pickRate(followers: number): { suggestedRate: number; bracket: string } {
  if (followers < 10000) return { suggestedRate: 100, bracket: 'under_10k' };
  if (followers < 50000) return { suggestedRate: 180, bracket: '10_50k' };
  if (followers < 150000) return { suggestedRate: 325, bracket: '50_150k' };
  return { suggestedRate: 500, bracket: '150k_plus' };
}

async function draftOutreach(creator: any) {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are Paul Airey, founder of Paybacker (a UK AI tool for drafting consumer-rights complaint letters), drafting a personal outreach DM to a UK micro-influencer.

Creator: @${creator.handle} (${creator.followers} followers)
Recent video that caught your eye: "${creator.bestRecentVideo}"
Their primary content themes: ${creator.themes.join(', ')}

Using the Paybacker UGC outreach template principles:
- Short, 100-140 words max
- Reference the SPECIFIC recent video by title or content
- Paid per-video rate: £${pickRate(creator.followers).suggestedRate}
- End with "reply and I'll send the brief + a free Pro account"

Do NOT:
- Use emojis (except one 🙏 or 👋 max)
- Use marketing-speak
- Say "huge fan" or "love your content" in a generic way
- Mention other brands
- Promise specific performance outcomes

Return the raw message text only. Starts "Hi @${creator.handle} —".`
    }],
  });

  return (res.content[0] as any).text.trim();
}
```

## vercel.json entry

```json
{
  "path": "/api/cron/ugc-outreach",
  "schedule": "0 10 * * 1,3,5"
}
```

## New table — ugc_creators

Already defined in `ugc-outreach-template.md`. Add `draft_message TEXT` column:

```sql
ALTER TABLE ugc_creators ADD COLUMN IF NOT EXISTS draft_message TEXT;
```

## Apify helper (new file)

`src/lib/apify/scrape-tiktok.ts`:

```typescript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN! });

export async function scrapeTikTokCreators({ hashtags, minFollowers, maxFollowers, minEngagementRate, limit }) {
  // Use Apify's TikTok Hashtag Scraper actor: clockworks/free-tiktok-scraper or paid equivalent
  const run = await client.actor('clockworks/free-tiktok-scraper').call({
    hashtags,
    resultsPerPage: 30,
    maxProfilesPerQuery: Math.ceil(limit * 3),
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const creators = items
    .map((post: any) => ({
      handle: post.authorMeta.name,
      displayName: post.authorMeta.nickName,
      followers: post.authorMeta.fans,
      engagementRate: post.diggCount / Math.max(post.playCount, 1),
      bestRecentVideo: post.text,
      themes: extractThemes(post.hashtags),
      lastVideos: post.authorMeta.recentVideos || [{ title: post.text }],
      primaryNiche: inferNiche(post.hashtags),
    }))
    .filter(c => c.followers >= minFollowers && c.followers <= maxFollowers && c.engagementRate >= minEngagementRate);

  // Dedupe by handle, keep highest-engagement
  const unique = Array.from(
    creators.reduce((m, c) => {
      const existing = m.get(c.handle);
      if (!existing || c.engagementRate > existing.engagementRate) m.set(c.handle, c);
      return m;
    }, new Map()).values()
  );

  return unique.slice(0, limit);
}

function extractThemes(hashtags: any[]) { /* ... */ }
function inferNiche(hashtags: any[]) { /* ... */ }
```

Apify free tier gives ~5k actor runs/month which is plenty for 3 runs/week. Token: set `APIFY_TOKEN` in Vercel env (new key — Apify free account to be created separately).

## Admin UI — outreach review page

`/admin/ugc-outreach` — lists creators in `status = 'pending_send'`:

- Creator handle, follower count, fit score, recent video preview
- Pre-drafted message in editable textarea
- Rate input (pre-filled from bracket)
- Buttons: Send (copies message to clipboard + opens TikTok DM in new tab + updates status to `'contacted'`) / Edit / Reject

On Send: status moves to `'contacted'`, `brief_sent_at` set to now. Paul then pastes into TikTok's DM manually.

## Estimated cost

- Apify TikTok scrape: free tier ample (under 100 actor runs/month)
- Anthropic: ~10 drafts × 600 tokens = 6k tokens × 3x/week = ~72k tokens/month ≈ £0.25/month
- **Total: ≈ £0.25/month**

## Failure modes

- **Apify rate-limit / scraper broken:** fail gracefully, log, continue. Alternative: manual creator input from `/admin/ugc-outreach/new`.
- **Creator not found by scraper:** many UK creators show up irregularly. Accept low-yield weeks.
- **Duplicate contact:** existing-handle check prevents this but Paul should scan before sending.
- **DM box closed / message undelivered:** log on manual send — some creators restrict DMs. Fall back to their Instagram or contact email if one exists in bio.

## What this cron does NOT do

- Does NOT auto-send messages. Manual send only. Paul is the sender.
- Does NOT track replies — replies land in Paul's TikTok/Instagram inbox. Next step after reply is handled in the UGC workflow (send brief, payment, video).
- Does NOT handle follow-ups — `cron-journalist-followup.md` pattern could be adapted for this in month 3 once the initial outreach volume is stable.

## Kill switch

`VERCEL_UGC_CRON_ENABLED=false` env var disables the cron.
