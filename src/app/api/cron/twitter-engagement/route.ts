import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getMentions, replyToTweet, searchTweets, likeTweet } from '@/lib/twitter';
import { PRODUCT_CONTEXT } from '@/lib/product-context';

export const runtime = 'nodejs';
export const maxDuration = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SEARCH_QUERIES = [
  '"energy bill" complaint UK',
  '"cancel subscription" UK help',
  '"overcharged" bill UK',
  '"flight delay" compensation UK',
  '"consumer rights" UK',
  '"broadband complaint" UK',
];

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.TWITTER_CONSUMER_KEY) {
    return NextResponse.json({ error: 'Twitter not configured' }, { status: 503 });
  }

  const supabase = getAdmin();
  const results = { mentions_replied: 0, tweets_liked: 0, tweets_replied: 0, leads_captured: 0 };

  // 1. Fetch mentions (no Anthropic needed yet)
  let mentions: any[] = [];
  let sinceId: string | undefined;
  try {
    const { data: lastMention } = await supabase
      .from('business_log')
      .select('content')
      .eq('category', 'context')
      .eq('title', 'twitter_last_mention_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    sinceId = lastMention?.content || undefined;
    mentions = await getMentions(sinceId);
  } catch (err: any) {
    console.error('[twitter-engagement] Mentions fetch error:', err.message);
  }

  // 2. Find relevant tweets, handle likes and lead capture (no Anthropic needed)
  const questionTweets: any[] = [];
  try {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    const searchResults = await searchTweets(query, 5);

    for (const tweet of searchResults.slice(0, 3)) {
      const liked = await likeTweet(tweet.id);
      if (liked) results.tweets_liked++;

      // Capture as lead for all search tweets
      await supabase.from('leads').upsert({
        platform: 'twitter',
        platform_user_id: tweet.author_id,
        first_message: tweet.text.substring(0, 500),
        status: 'new',
      }, { onConflict: 'platform,platform_user_id' }).then(() => {});

      const isQuestion = tweet.text.includes('?') || /how do i|can i|help|anyone know|any advice/i.test(tweet.text);
      if (isQuestion) questionTweets.push(tweet);
    }
  } catch (err: any) {
    console.error('[twitter-engagement] Search error:', err.message);
  }

  // Early exit if there's nothing requiring AI
  if (mentions.slice(0, 5).length === 0 && questionTweets.length === 0) {
    return NextResponse.json({ success: true, ...results });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 3. Reply to mentions
  try {
    for (const mention of mentions.slice(0, 5)) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 280,
        system: `You are the Paybacker social media team replying to a tweet that mentioned us. Be helpful, friendly, and concise. UK English. Never use em dashes. Max 280 characters. If they have a consumer rights question, give a brief helpful answer and mention paybacker.co.uk can help further. If it's just a mention/shoutout, thank them warmly.\n\n${PRODUCT_CONTEXT}`,
        messages: [{ role: 'user', content: `Reply to this tweet: "${mention.text}"` }],
      });

      const reply = response.content.find(b => b.type === 'text');
      if (reply?.type === 'text') {
        const result = await replyToTweet(mention.id, reply.text);
        if (result) results.mentions_replied++;
      }

      await supabase.from('leads').upsert({
        platform: 'twitter',
        platform_user_id: mention.author_id,
        first_message: mention.text.substring(0, 500),
        status: 'new',
      }, { onConflict: 'platform,platform_user_id' }).then(() => { results.leads_captured++; });
    }

    if (mentions.length > 0) {
      await supabase.from('business_log').insert({
        category: 'context',
        title: 'twitter_last_mention_id',
        content: mentions[0].id,
        created_by: 'system',
      });
    }
  } catch (err: any) {
    console.error('[twitter-engagement] Mentions error:', err.message);
  }

  // 4. Reply to question tweets
  try {
    for (const tweet of questionTweets) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 280,
        system: `You are Paybacker's social media team. Someone tweeted about a UK consumer issue. Write a genuinely helpful reply (max 280 chars). Give useful advice first, then briefly mention paybacker.co.uk only if relevant. Do NOT be salesy. UK English. Never use em dashes. Be warm and empathetic.`,
        messages: [{ role: 'user', content: `Reply helpfully to: "${tweet.text}"` }],
      });

      const reply = response.content.find(b => b.type === 'text');
      if (reply?.type === 'text') {
        const result = await replyToTweet(tweet.id, reply.text);
        if (result) results.tweets_replied++;
      }
    }
  } catch (err: any) {
    console.error('[twitter-engagement] Search reply error:', err.message);
  }

  return NextResponse.json({ success: true, ...results });
}
