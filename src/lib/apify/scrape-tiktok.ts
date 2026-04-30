/**
 * Apify TikTok creator scraper.
 *
 * Used by /api/cron/ugc-outreach to source UK micro-influencers in
 * consumer-rights / personal-finance / cost-of-living niches.
 *
 * Actor: clockworks/free-tiktok-scraper (free tier) — upgrade to
 * clockworks/tiktok-scraper for higher rate limits once volume justifies it.
 *
 * Called via Apify REST rather than apify-client to avoid adding a dep.
 */

const APIFY_ENDPOINT = 'https://api.apify.com/v2';
const ACTOR_ID = 'clockworks~free-tiktok-scraper';

export interface ScrapeInput {
  hashtags: string[];
  minFollowers: number;
  maxFollowers: number;
  minEngagementRate: number;
  limit: number;
}

export interface Creator {
  handle: string;
  displayName: string;
  followers: number;
  engagementRate: number;
  bestRecentVideo: string;
  themes: string[];
  lastVideos: Array<{ title: string }>;
  primaryNiche: string;
}

const CONSUMER_RIGHTS_KEYWORDS =
  /bill|fine|contract|refund|parking|broadband|energy|price rise|ripped off|ofcom|ofgem|cost of living|rent|council tax/i;

export async function scrapeTikTokCreators(input: ScrapeInput): Promise<Creator[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN env var missing');
  }

  // Synchronous run-and-wait (Apify returns dataset when done, up to 5 min).
  const runRes = await fetch(
    `${APIFY_ENDPOINT}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hashtags: input.hashtags,
        resultsPerPage: 30,
        maxProfilesPerQuery: Math.max(30, Math.ceil(input.limit * 3)),
        proxyConfiguration: { useApifyProxy: true },
      }),
    },
  );

  if (!runRes.ok) {
    const body = await runRes.text();
    throw new Error(`Apify actor failed ${runRes.status}: ${body.slice(0, 300)}`);
  }

  const items: any[] = await runRes.json();
  const creatorsMap = new Map<string, Creator>();

  for (const post of items) {
    const author = post.authorMeta ?? {};
    const handle = author.name;
    if (!handle) continue;

    const followers = Number(author.fans ?? 0);
    const engagementRate =
      Number(post.diggCount ?? 0) / Math.max(Number(post.playCount ?? 1), 1);

    if (followers < input.minFollowers || followers > input.maxFollowers) continue;
    if (engagementRate < input.minEngagementRate) continue;

    const title = String(post.text ?? '');
    const tags: string[] = (post.hashtags ?? [])
      .map((h: any) => (typeof h === 'string' ? h : h?.name))
      .filter(Boolean);

    const next: Creator = {
      handle,
      displayName: author.nickName ?? handle,
      followers,
      engagementRate,
      bestRecentVideo: title,
      themes: tags.slice(0, 6),
      lastVideos: [{ title }],
      primaryNiche: inferNiche(tags),
    };

    // Dedupe by handle, keep whichever sample has higher engagement.
    const existing = creatorsMap.get(handle);
    if (!existing || next.engagementRate > existing.engagementRate) {
      creatorsMap.set(handle, next);
    }
  }

  const creators = Array.from(creatorsMap.values());

  // Rough fit-score sort so the caller's top-N is already sensible.
  const scored = creators
    .map((c) => ({
      creator: c,
      score:
        c.engagementRate *
        (c.lastVideos.some((v) => CONSUMER_RIGHTS_KEYWORDS.test(v.title)) ? 2 : 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit)
    .map((s) => s.creator);

  return scored;
}

function inferNiche(tags: string[]): string {
  const joined = tags.join(' ').toLowerCase();
  if (/finance|money|budget|saving/.test(joined)) return 'personal_finance';
  if (/rent|housing|tenant/.test(joined)) return 'housing';
  if (/bill|energy|broadband/.test(joined)) return 'household_bills';
  if (/parent|mum|dad|family/.test(joined)) return 'parenting_money';
  return 'cost_of_living';
}

export function tiktokDmUrl(handle: string): string {
  // Opens the TikTok profile — DM is then one click away. TikTok does not
  // expose a direct DM deep-link that works reliably on desktop web.
  return `https://www.tiktok.com/@${handle.replace(/^@/, '')}`;
}
