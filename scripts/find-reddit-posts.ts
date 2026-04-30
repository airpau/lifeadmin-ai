#!/usr/bin/env -S npx tsx
/**
 * Reddit beta-recruitment post finder.
 *
 * Scans r/UKPersonalFinance, r/CasualUK and r/UKJobs for posts that match
 * the launch-sprint candidate keywords (price increases, sneaky bills,
 * cancellation pain points). Inserts new candidates into the outreach_log
 * table with status = 'discovered' so Paul can review each morning.
 *
 * Reddit's public JSON endpoints are unauthenticated and rate-limited to
 * ~60 req/min. We poll the "new" sort of each subreddit, dedupe by
 * source_post_id (UNIQUE constraint), and stop early once we hit a post
 * we've already logged.
 *
 * Run from cron OR as a one-off:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     npx tsx scripts/find-reddit-posts.ts
 *
 * Output: writes to outreach_log + prints a summary table to stdout.
 */

import { createClient } from '@supabase/supabase-js';

const SUBREDDITS = ['UKPersonalFinance', 'CasualUK', 'UKJobs', 'HousingUK'];

// Keywords are matched case-insensitive against title + selftext.
// Group prefix is the "intent" — useful for picking the right DM template.
const KEYWORDS: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'price-increase', pattern: /\b(price (increase|hike|rise)|bill (went up|increased)|raised (the|my) price)\b/i },
  { tag: 'subscription', pattern: /\b(adobe|netflix|spotify|disney\+?|prime|sky|virgin)\b.*\b(price|increase|cancel|cost|expensive)\b/i },
  { tag: 'cancellation-pain', pattern: /\b(can('?| )?t cancel|stuck in (a |the )?contract|hard to cancel|tried to cancel)\b/i },
  { tag: 'energy', pattern: /\b(british gas|octopus|edf|eon|ovo|scottish power|bulb|shell energy).*\b(bill|increase|expensive|wrong|disputed?)\b/i },
  { tag: 'broadband', pattern: /\b(bt|virgin media|sky broadband|talktalk|plusnet|now broadband|community fibre).*\b(price|increase|mid-?contract|expensive|leaving|switch)\b/i },
  { tag: 'flight-delay', pattern: /\b(flight (delay|cancel|cancelled)|eu ?261|uk ?261|compensation)\b/i },
  { tag: 'council-tax', pattern: /\b(council tax|band challenge|valuation office|ctax)\b.*\b(wrong|disputed?|increased?|appeal)\b/i },
  { tag: 'parking-pcn', pattern: /\b(pcn|parking (charge|ticket|notice|fine)|appeal|euro car parks|ukpc)\b/i },
  { tag: 'overcharge', pattern: /\b(double charged|charged twice|wrong amount|refund|overcharged?|hidden fee)\b/i },
];

interface RedditChild {
  data: {
    id: string;
    name: string;
    title: string;
    selftext: string;
    permalink: string;
    author: string;
    created_utc: number;
    subreddit: string;
    over_18: boolean;
    stickied: boolean;
  };
}

interface RedditListing {
  data: { children: RedditChild[] };
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key);
}

async function fetchSubreddit(name: string, limit = 50): Promise<RedditChild[]> {
  const url = `https://www.reddit.com/r/${name}/new.json?limit=${limit}&raw_json=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'paybacker-recruitment/0.1 by /u/paybacker' },
  });
  if (!res.ok) {
    console.warn(`[reddit] ${name} returned ${res.status} — skipping`);
    return [];
  }
  const json = (await res.json()) as RedditListing;
  return json?.data?.children ?? [];
}

interface Candidate {
  source_post_id: string;
  post_title: string;
  post_excerpt: string;
  source_url: string;
  candidate_handle: string;
  source_subreddit: string;
  matched_keywords: string[];
  posted_at: string;
}

function matchPost(p: RedditChild['data']): string[] | null {
  if (p.over_18 || p.stickied) return null;
  const haystack = `${p.title}\n${p.selftext ?? ''}`;
  const matched = KEYWORDS.filter((k) => k.pattern.test(haystack)).map((k) => k.tag);
  return matched.length ? matched : null;
}

async function main() {
  const sb = admin();
  const candidates: Candidate[] = [];

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubreddit(sub);
    for (const child of posts) {
      const p = child.data;
      const matched = matchPost(p);
      if (!matched) continue;

      candidates.push({
        source_post_id: p.id,
        post_title: p.title,
        post_excerpt: (p.selftext ?? '').slice(0, 500),
        source_url: `https://www.reddit.com${p.permalink}`,
        candidate_handle: `u/${p.author}`,
        source_subreddit: p.subreddit,
        matched_keywords: matched,
        posted_at: new Date(p.created_utc * 1000).toISOString(),
      });
    }
    // Modest delay to stay under Reddit's rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (candidates.length === 0) {
    console.log('No matching posts found.');
    return;
  }

  // Bulk upsert. UNIQUE (source, source_post_id) handles dedupe.
  const rows = candidates.map((c) => ({
    source: 'reddit' as const,
    status: 'discovered' as const,
    ...c,
  }));

  const { data, error } = await sb
    .from('outreach_log')
    .upsert(rows, { onConflict: 'source,source_post_id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  const inserted = data?.length ?? 0;
  console.log(`\nFound ${candidates.length} candidates · ${inserted} new in outreach_log\n`);

  // Print top 10 candidates by recency for quick scanning
  const top = candidates
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
    .slice(0, 10);

  console.log('Newest candidates:');
  for (const c of top) {
    console.log(`  [${c.matched_keywords.join(', ')}] r/${c.source_subreddit} · ${c.candidate_handle}`);
    console.log(`    ${c.post_title}`);
    console.log(`    ${c.source_url}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
