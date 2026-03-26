import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

const API = 'https://graph.facebook.com/v25.0';
const PAGE_ID = '1056645287525328';
const IG_ID = '17841440175351137';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getPageToken(systemToken: string): Promise<string> {
  const res = await fetch(`${API}/${PAGE_ID}?fields=access_token&access_token=${systemToken}`);
  const data = await res.json();
  return data.access_token || systemToken;
}

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: `Dark navy blue background (#0f172a), mint green accents (#34d399), soft orange highlights (#FB923C), ${prompt}, absolutely no text no words no letters, premium fintech aesthetic, clean modern design` }],
          parameters: { sampleCount: 1, aspectRatio: '1:1' },
        }),
      }
    );
    const data = await res.json();
    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) return null;

    // Upload to Supabase storage
    const supabase = getAdmin();
    const fileName = `social-auto-${Date.now()}.png`;
    const buffer = Buffer.from(base64, 'base64');

    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/social-images/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'image/png',
      },
      body: buffer,
    });

    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/social-images/${fileName}`;
  } catch {
    return null;
  }
}

/**
 * Daily social media post cron - runs at 10am UK time.
 * Researches trending UK consumer topics via Perplexity, writes a relevant post,
 * generates a branded image, publishes to Facebook + Instagram.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const systemToken = process.env.META_ACCESS_TOKEN;
  if (!systemToken) {
    return NextResponse.json({ error: 'META_ACCESS_TOKEN not configured' }, { status: 503 });
  }

  const supabase = getAdmin();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Deduplication: skip if we already posted to Facebook today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayPosts } = await supabase
    .from('content_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('platform', 'facebook')
    .eq('status', 'posted')
    .gte('posted_at', todayStart.toISOString());

  if ((todayPosts || 0) > 0) {
    return NextResponse.json({ skipped: true, reason: 'Already posted to Facebook today' });
  }

  // Step 1: Research trending UK consumer topics via Perplexity
  let researchContext = '';
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (perplexityKey) {
    try {
      const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const researchRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{
            role: 'user',
            content: `What are the top UK consumer news stories today (${today})? Focus on: energy prices, broadband/mobile changes, flight disruptions, new consumer regulations, price increases, bank charges, subscription scams, cost of living, insurance changes, mortgage rates. Give me 3-5 current stories with specific details, figures, and company names.`,
          }],
        }),
      });
      if (researchRes.ok) {
        const data = await researchRes.json();
        researchContext = data.choices?.[0]?.message?.content || '';
      }
    } catch {}
  }

  // Step 2: Get recent posts to avoid repetition
  const { data: recentPosts } = await supabase
    .from('content_drafts')
    .select('caption')
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(5);
  const recentTopics = (recentPosts || []).map(p => p.caption?.substring(0, 100)).join('\n');

  // Step 3: Use Claude to write a topical, engaging post based on research
  const postRes = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    system: `You are Casey, the Chief Content Officer for Paybacker, a UK consumer rights fintech platform. You write social media posts that are timely, relevant, and engaging.

Your job: write ONE social media post based on today's UK consumer news. Connect the news to how Paybacker helps.

Paybacker features you can mention:
- Free AI complaint letters citing UK consumer law (energy, broadband, flights, debt, parking, council tax)
- Bank scanning to detect all subscriptions and recurring payments
- 53+ deals from UK providers (energy, broadband, mobile, insurance, mortgages, loans)
- Contract tracking with renewal alerts (30/14/7 days before)
- AI cancellation emails with legal context
- Spending intelligence dashboard with category breakdown
- First 25 members get Pro free for 30 days

Brand identity: Calm, trustworthy, modern fintech. Colours are deep navy and mint green, not gold/amber.

Rules:
- British English, £ symbols
- Never use em dashes
- Keep it under 2000 characters
- Start with a strong hook related to today's news
- Be specific (use real figures, company names, dates from the research)
- End with "Try it free at paybacker.co.uk"
- Add 8-12 relevant hashtags at the end
- Do NOT repeat topics from recent posts

Return JSON: {"caption": "the post text", "imagePrompt": "brief description for image generation, dark navy background with mint green and soft orange abstract shapes, no text no words no letters"}`,
    messages: [{
      role: 'user',
      content: `Today's UK consumer news:\n${researchContext || 'No research available - write about a general UK consumer rights topic.'}\n\nRecent posts (avoid repeating):\n${recentTopics || 'None yet'}`,
    }],
  });

  const postBlock = postRes.content.find(b => b.type === 'text');
  let caption = '';
  let imagePrompt = 'abstract mint green and navy blue financial symbols, clean modern fintech aesthetic, dark background';

  if (postBlock?.type === 'text') {
    try {
      let jsonText = postBlock.text;
      const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonText = fenceMatch[1];
      const parsed = JSON.parse(jsonText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      caption = parsed.caption || '';
      imagePrompt = parsed.imagePrompt || imagePrompt;
    } catch {
      caption = postBlock.text;
    }
  }

  if (!caption) {
    caption = 'UK consumers are owed billions in unclaimed refunds. Energy overcharges, broadband price rises, flight delay compensation. Paybacker writes the formal complaint letter for you, citing exact UK law, in 30 seconds.\n\nTry it free at paybacker.co.uk\n\n#consumerrights #fintech #moneysaving #ukfinance #paybacker';
  }

  // Generate image based on AI-chosen prompt
  const imageUrl = await generateImage(imagePrompt);

  const results: Record<string, any> = {};

  // Post to Facebook
  try {
    const pageToken = await getPageToken(systemToken);
    if (imageUrl) {
      // Photo post via /photos endpoint (proper image, no link preview)
      const params = new URLSearchParams({
        message: caption,
        url: imageUrl,
        access_token: pageToken,
      });
      const res = await fetch(`${API}/${PAGE_ID}/photos`, { method: 'POST', body: params });
      const data = await res.json();
      results.facebook = data.error ? { error: data.error.message } : { ok: true, postId: data.id };
    } else {
      const params = new URLSearchParams({
        message: caption,
        access_token: pageToken,
      });
      const res = await fetch(`${API}/${PAGE_ID}/feed`, { method: 'POST', body: params });
      const data = await res.json();
      results.facebook = data.error ? { error: data.error.message } : { ok: true, postId: data.id };
    }
  } catch (err: any) {
    results.facebook = { error: err.message };
  }

  // Post to Instagram (requires image)
  if (imageUrl) {
    try {
      const createParams = new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: systemToken,
      });
      const createRes = await fetch(`${API}/${IG_ID}/media`, { method: 'POST', body: createParams });
      const createData = await createRes.json();

      if (createData.id) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const publishParams = new URLSearchParams({
          creation_id: createData.id,
          access_token: systemToken,
        });
        const publishRes = await fetch(`${API}/${IG_ID}/media_publish`, { method: 'POST', body: publishParams });
        const publishData = await publishRes.json();
        results.instagram = publishData.error ? { error: publishData.error.message } : { ok: true, postId: publishData.id };
      } else {
        results.instagram = { error: createData.error?.message || 'Container creation failed' };
      }
    } catch (err: any) {
      results.instagram = { error: err.message };
    }
  } else {
    results.instagram = { skipped: 'No image generated' };
  }

  // Log to content_drafts
  await supabase.from('content_drafts').insert({
    platform: 'facebook',
    content_type: 'text_post',
    caption,
    asset_url: imageUrl,
    status: 'posted',
    posted_at: new Date().toISOString(),
  });

  // Notify founder via Telegram
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const founderChatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (telegramToken && founderChatId) {
    const msg = `Daily social post published:\n\nFB: ${results.facebook?.ok ? 'Posted' : results.facebook?.error || 'Failed'}\nIG: ${results.instagram?.ok ? 'Posted' : results.instagram?.error || results.instagram?.skipped || 'Failed'}\n\nCaption: ${caption.substring(0, 150)}...`;
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(founderChatId), text: msg }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, caption: caption.substring(0, 100), ...results });
}
