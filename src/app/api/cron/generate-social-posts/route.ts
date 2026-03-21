import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { generateSocialImage, buildBrandedPrompt } from '@/lib/generate-image';

// Runs daily at 8am (see vercel.json)
// Generates one post per platform across rotating pillars, saves as drafts for review

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// facebook and instagram get images; twitter and linkedin are text-only (APIs not set up yet)
const PLATFORMS = ['twitter', 'facebook', 'instagram', 'linkedin'] as const;
type Platform = typeof PLATFORMS[number];

const IMAGE_PLATFORMS: Platform[] = ['facebook', 'instagram'];

const PILLARS = ['money_tip', 'complaint_win', 'product_feature', 'consumer_rights'] as const;
type Pillar = typeof PILLARS[number];

const PILLAR_CONTEXT: Record<Pillar, string> = {
  money_tip:
    'A practical money-saving tip for UK consumers. Focus on actionable advice about bills, refunds, or overpayments.',
  complaint_win:
    'A success story (written as if real but anonymised) about a UK consumer recovering money via a complaint. Include approximate amount recovered.',
  product_feature:
    'A Paybacker product feature highlight. Explain what it does and why it saves users time or money.',
  consumer_rights:
    'A UK consumer rights fact. Reference real UK legislation (Consumer Rights Act 2015, Consumer Contracts Regulations 2013, Ofgem, Ofcom, etc.).',
};

const PLATFORM_RULES: Record<Platform, string> = {
  twitter:
    'Max 280 characters. Punchy, conversational. Use 1–2 emojis max. End with a hook or question if appropriate. No markdown.',
  facebook:
    '100–200 words. Friendly, informative tone. Use emojis sparingly. Include a clear call to action at the end.',
  instagram:
    '100–150 words of caption. Warm, friendly tone. Use emojis. 3–5 hashtags inline. End with a question to drive comments.',
  linkedin:
    '150–300 words. Professional but approachable tone. Use line breaks for readability. Include a brief story or stat. Call to action at end.',
};

// Topic rotation — cycles daily so content stays varied
const DAILY_TOPICS = [
  'energy bills',
  'broadband overcharges',
  'subscription creep',
  'council tax appeals',
  'mobile contract overcharges',
  'insurance renewal price hikes',
  'gym membership cancellations',
  'streaming subscriptions',
  'water bill disputes',
  'parking charge appeals',
  'bank charges',
  'flight delay compensation',
  'faulty goods refunds',
  'direct debit errors',
];

function getDailyTopic(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_TOPICS[dayOfYear % DAILY_TOPICS.length];
}

function getDailyPillarForPlatform(platform: Platform): Pillar {
  const platformIndex = PLATFORMS.indexOf(platform);
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return PILLARS[(dayOfYear + platformIndex) % PILLARS.length];
}

async function generatePost(
  platform: Platform,
  pillar: Pillar,
  topic: string
): Promise<{ content: string; hashtags: string; image_prompt: string }> {
  const prompt = `You are a social media copywriter for Paybacker — a UK AI service that helps consumers recover money from incorrect bills and cancel subscriptions.

Content pillar: ${PILLAR_CONTEXT[pillar]}
Focus specifically on: ${topic}

Platform rules: ${PLATFORM_RULES[platform]}

Brand voice: Smart, trustworthy, slightly bold. Never preachy. Always specific (use £ amounts, real law names, real companies when relevant). Target audience: UK professionals aged 25–45.

IMPORTANT — PRE-LAUNCH CONTEXT: Paybacker is launching soon. Every post MUST include a pre-launch CTA directing people to join the waitlist at paybacker.co.uk. Use phrases like "Join the waitlist", "Sign up for early access", "Be first in line", "Launching soon". ALWAYS use paybacker.co.uk (NOT paybacker.com). Never mention a free trial — say "early access" or "join the waitlist" instead.

Generate the post content. Return a JSON object with exactly these three keys:
- "content": the post text (follow platform rules strictly)
- "hashtags": a string of 3–6 relevant hashtags separated by spaces
- "suggested_image_prompt": a short prompt (1–2 sentences) for generating a matching image — dark premium aesthetic, deep navy background, gold accents

Return only valid JSON. No markdown code fences.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0];
  if (text.type !== 'text') throw new Error('Unexpected Claude response type');

  const jsonMatch = text.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse JSON from Claude response');

  const result = JSON.parse(jsonMatch[0]);
  return {
    content: result.content,
    hashtags: result.hashtags,
    image_prompt: result.suggested_image_prompt,
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const topic = getDailyTopic();
  const results: Array<{ platform: string; pillar: string; ok: boolean; imageGenerated?: boolean; error?: string }> = [];

  for (const platform of PLATFORMS) {
    const pillar = getDailyPillarForPlatform(platform);
    try {
      const post = await generatePost(platform, pillar, topic);

      // Generate image for facebook and instagram
      let imageData: string | null = null;
      let imageGeneratedAt: string | null = null;

      if (IMAGE_PLATFORMS.includes(platform)) {
        try {
          const brandedPrompt = buildBrandedPrompt(post.image_prompt);
          const { imageBase64 } = await generateSocialImage(brandedPrompt);
          imageData = imageBase64;
          imageGeneratedAt = new Date().toISOString();
        } catch (imgErr: any) {
          // Image generation failure must not block text post
          console.error(`Image generation failed for ${platform} post:`, imgErr.message);
        }
      }

      const { error } = await supabase.from('social_posts').insert({
        platform,
        pillar,
        content: post.content,
        hashtags: post.hashtags,
        image_prompt: post.image_prompt,
        image_data: imageData,
        image_generated_at: imageGeneratedAt,
        status: 'draft',
      });

      if (error) throw new Error(error.message);
      results.push({ platform, pillar, ok: true, imageGenerated: imageData !== null });
    } catch (err: any) {
      console.error(`Failed to generate ${platform} post:`, err.message);
      results.push({ platform, pillar, ok: false, error: err.message });
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  const imagesGenerated = results.filter((r) => r.imageGenerated).length;
  console.log(
    `generate-social-posts: topic="${topic}" generated=${results.length - failed} failed=${failed} images=${imagesGenerated}`
  );

  return NextResponse.json({ ok: true, topic, results });
}
