/**
 * Cron — UGC Creator Outreach Draft Generator
 *
 * Schedule: Mon / Wed / Fri 10:00 UK (see vercel.json).
 * Purpose:  Apify-scrape fresh UK consumer-rights TikTok creators, score them,
 *           and draft Paul-voice outreach DMs into ugc_creators with
 *           status='pending_send' for manual review and send.
 *
 * IMPORTANT — does NOT send anything. Platforms detect bot DMs within 20
 * messages. Paul reviews each draft in /admin/ugc-outreach, copies, and
 * sends manually via TikTok DM.
 *
 * Kill switch: VERCEL_UGC_CRON_ENABLED=false
 * Secret:      CRON_SECRET
 *
 * Template source: docs/marketing/templates/cron-ugc-outreach.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { scrapeTikTokCreators, type Creator } from '@/lib/apify/scrape-tiktok';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY!,
});

const TARGET_HASHTAGS = [
  'ukconsumer',
  'costoflivinguk',
  'ukbills',
  'ukrenters',
  'moneysavingtipsuk',
  'ukmoneytips',
];

const CONSUMER_RIGHTS_REGEX =
  /bill|fine|contract|refund|parking|broadband|energy|price rise|ripped off|ofcom|ofgem|council tax|rent/i;

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_UGC_CRON_ENABLED === 'false') {
    return NextResponse.json({ skipped: true, reason: 'kill_switch' });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let creators: Creator[] = [];
  try {
    creators = await scrapeTikTokCreators({
      hashtags: TARGET_HASHTAGS,
      minFollowers: 5_000,
      maxFollowers: 200_000,
      minEngagementRate: 0.04,
      limit: 25,
    });
  } catch (scrapeErr: any) {
    await logRun(supabase, 'scrape_failed', { error: scrapeErr?.message });
    return NextResponse.json({ error: 'scrape_failed', message: scrapeErr?.message }, { status: 500 });
  }

  // Filter out creators we've already contacted.
  const { data: existingRows } = await supabase.from('ugc_creators').select('handle');
  const existingHandles = new Set((existingRows ?? []).map((r: any) => r.handle));
  const fresh = creators.filter((c) => !existingHandles.has(c.handle));

  // Rank by fit score (engagement × relevance of their recent videos).
  const scored = fresh
    .map((c) => ({
      ...c,
      fitScore:
        c.engagementRate *
        (c.lastVideos.some((v) => CONSUMER_RIGHTS_REGEX.test(v.title)) ? 2 : 1),
    }))
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 10);

  const drafts: any[] = [];
  const failures: Array<{ handle: string; message: string }> = [];

  for (const creator of scored) {
    try {
      const { rate, bracket } = pickRate(creator.followers);
      const draftMessage = await draftOutreach(creator, rate);

      const { data, error } = await supabase
        .from('ugc_creators')
        .insert({
          name: creator.displayName,
          handle: creator.handle,
          platform: 'tiktok',
          followers: creator.followers,
          engagement_rate: creator.engagementRate,
          niche: creator.primaryNiche,
          fit_score: creator.fitScore,
          agreed_rate_gbp: rate,
          rate_bracket: bracket,
          status: 'pending_send',
          draft_message: draftMessage,
          notes: `Best recent video: ${creator.bestRecentVideo.slice(0, 240)}`,
        })
        .select()
        .single();

      if (error) {
        failures.push({ handle: creator.handle, message: error.message });
        continue;
      }
      drafts.push(data);
    } catch (err: any) {
      failures.push({ handle: creator.handle, message: err?.message ?? 'unknown' });
    }
  }

  await logRun(
    supabase,
    drafts.length > 0 ? 'success' : 'no_output',
    { drafts_created: drafts.length, failures },
  );

  return NextResponse.json({ success: true, drafts_created: drafts.length });
}

function pickRate(followers: number): { rate: number; bracket: string } {
  if (followers < 10_000) return { rate: 100, bracket: 'under_10k' };
  if (followers < 50_000) return { rate: 180, bracket: '10_50k' };
  if (followers < 150_000) return { rate: 325, bracket: '50_150k' };
  return { rate: 500, bracket: '150k_plus' };
}

async function draftOutreach(creator: Creator & { fitScore: number }, rate: number): Promise<string> {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-latest',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are Paul Airey, founder of Paybacker (a UK AI tool for drafting consumer-rights complaint letters — paybacker.co.uk), drafting a short personal outreach DM to a UK micro-influencer.

Creator: @${creator.handle} (${creator.followers.toLocaleString()} followers)
Recent video that caught Paul's eye: "${creator.bestRecentVideo.slice(0, 240)}"
Their primary content themes: ${creator.themes.join(', ') || 'consumer / money'}
Paid per-video rate to offer: £${rate}

Follow the Paybacker outreach principles:
- Short: 100-140 words max
- Reference the SPECIFIC recent video by title or gist
- Offer the rate + a free Paybacker Pro account
- End with: "reply and I'll send the brief + free Pro account"

Do NOT:
- Use emojis (except one 🙏 or 👋 max)
- Use marketing-speak
- Say "huge fan" or "love your content" generically
- Mention other brands
- Promise specific performance outcomes

Return the raw message text only. Start "Hi @${creator.handle} —" and sign off "Paul (Paybacker)".`,
      },
    ],
  });

  return (res.content[0] as any).text.trim();
}

async function logRun(supabase: any, status: string, output: Record<string, unknown>) {
  await supabase.from('agent_runs').insert({
    agent_name: 'cron-ugc-outreach',
    status,
    output,
  });
}
