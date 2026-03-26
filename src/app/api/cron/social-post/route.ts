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
          instances: [{ prompt: `Dark navy blue background (#0f172a), gold amber accents (#f59e0b), ${prompt}, absolutely no text no words no letters, premium fintech aesthetic` }],
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

// Topic pool for daily posts
const TOPICS = [
  { theme: 'energy', prompt: 'glowing lightbulb with golden electricity sparks', caption: 'Your energy supplier could owe you money right now. Millions of UK households have credit balances they have never claimed. Paybacker writes the formal complaint citing Ofgem rules in 30 seconds.' },
  { theme: 'broadband', prompt: 'golden wifi signal radiating outward with data particles', caption: 'Your broadband provider raised your price mid-contract? Under Ofcom rules, you may be entitled to exit penalty-free or claim compensation. Paybacker writes the complaint for you.' },
  { theme: 'flight', prompt: 'golden airplane silhouette with trailing sparkles', caption: 'Flight delayed or cancelled? Under UK261 regulations you could be owed up to £520 per person. You can claim for flights in the last 6 years. Paybacker generates the claim letter in 30 seconds.' },
  { theme: 'subscriptions', prompt: 'golden calendar with alert notification icons floating', caption: 'How many subscriptions are you paying for that you have forgotten about? Connect your bank to Paybacker and we find every single recurring payment. Cancel what you do not need with one AI-generated email.' },
  { theme: 'deals', prompt: 'golden shopping tag with discount percentage floating', caption: 'Compare 59+ deals from verified UK providers. Energy, broadband, mobile, insurance, mortgages, loans, and more. Find cheaper alternatives to what you are paying right now.' },
  { theme: 'debt', prompt: 'golden shield protecting against dark arrows', caption: 'Received a debt collection letter? Do not panic. Under the Consumer Credit Act 1974, you have rights. Paybacker writes the formal response citing the exact law that protects you.' },
  { theme: 'rights', prompt: 'golden scales of justice with balanced coins', caption: 'Most UK consumers do not know their rights. The Consumer Rights Act 2015 protects you more than you think. Paybacker uses AI to cite the exact law for your situation.' },
];

/**
 * Daily social media post cron - runs at 10am UK time.
 * Generates a branded image, writes a post, publishes to Facebook + Instagram.
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

  // Pick today's topic based on day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const topic = TOPICS[dayOfYear % TOPICS.length];

  // Use Claude to enhance the caption
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const enhanced = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: 'You write social media posts for Paybacker, a UK consumer rights fintech. Keep it punchy, relatable, and practical. British English. Never use em dashes. End with "Try it free at paybacker.co.uk" and 8-12 relevant hashtags. Max 2000 characters total.',
    messages: [{ role: 'user', content: `Enhance this post for Facebook and Instagram. Make it engaging and add a hook at the start: "${topic.caption}"` }],
  });

  const captionBlock = enhanced.content.find(b => b.type === 'text');
  const caption = captionBlock?.type === 'text' ? captionBlock.text : topic.caption + '\n\nTry it free at paybacker.co.uk\n\n#consumerrights #fintech #moneysaving #ukfinance #paybacker';

  // Generate image
  const imageUrl = await generateImage(topic.prompt);

  const results: Record<string, any> = {};

  // Post to Facebook
  try {
    const pageToken = await getPageToken(systemToken);
    const params = new URLSearchParams({
      message: caption,
      link: 'https://paybacker.co.uk',
      access_token: pageToken,
    });
    const res = await fetch(`${API}/${PAGE_ID}/feed`, { method: 'POST', body: params });
    const data = await res.json();
    results.facebook = data.error ? { error: data.error.message } : { ok: true, postId: data.id };
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
    const msg = `Daily social post published:\n\nFB: ${results.facebook?.ok ? 'Posted' : results.facebook?.error || 'Failed'}\nIG: ${results.instagram?.ok ? 'Posted' : results.instagram?.error || results.instagram?.skipped || 'Failed'}\n\nTopic: ${topic.theme}\nCaption: ${caption.substring(0, 100)}...`;
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(founderChatId), text: msg }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, topic: topic.theme, ...results });
}
