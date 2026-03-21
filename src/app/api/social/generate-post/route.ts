import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PILLAR_CONTEXT: Record<string, string> = {
  money_tip:
    'A practical money-saving tip for UK consumers. Focus on actionable advice about bills, refunds, or overpayments.',
  complaint_win:
    'A success story (written as if real but anonymised) about a UK consumer recovering money via a complaint. Include approximate amount recovered.',
  product_feature:
    'A Paybacker product feature highlight. Explain what it does and why it saves users time or money.',
  consumer_rights:
    'A UK consumer rights fact. Reference real UK legislation (Consumer Rights Act 2015, Consumer Contracts Regulations 2013, Ofgem, Ofcom, etc.).',
};

const PLATFORM_RULES: Record<string, string> = {
  twitter:
    'Max 280 characters. Punchy, conversational. Use 1–2 emojis max. End with a hook or question if appropriate. No markdown.',
  linkedin:
    '150–300 words. Professional but approachable tone. Use line breaks for readability. Include a brief story or stat. Call to action at end.',
  instagram:
    '100–150 words of caption. Warm, friendly tone. Use emojis. 3–5 hashtags inline. End with a question to drive comments.',
  tiktok:
    'Write a 30–60 second spoken script for a talking-head video. Conversational, energetic UK tone. Include a hook in the first 3 seconds. End with a clear CTA.',
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { platform, pillar, topic } = body as {
      platform: string;
      pillar: string;
      topic?: string;
    };

    if (!platform || !pillar) {
      return NextResponse.json({ error: 'Missing platform or pillar' }, { status: 400 });
    }

    const platformRule = PLATFORM_RULES[platform];
    const pillarContext = PILLAR_CONTEXT[pillar];

    if (!platformRule || !pillarContext) {
      return NextResponse.json({ error: 'Invalid platform or pillar' }, { status: 400 });
    }

    const topicLine = topic ? `\nFocus specifically on: ${topic}` : '';

    const prompt = `You are a social media copywriter for Paybacker — a UK AI service that helps consumers recover money from incorrect bills and cancel subscriptions.

Content pillar: ${pillarContext}${topicLine}

Platform rules: ${platformRule}

Brand voice: Smart, trustworthy, slightly bold. Never preachy. Always specific (use £ amounts, real law names, real companies when relevant). Target audience: UK professionals aged 25–45.

Generate the post content. Then return a JSON object with exactly these three keys:
- "content": the post text (follow platform rules strictly)
- "hashtags": a string of 3–6 relevant hashtags separated by spaces (e.g. "#MoneySaving #ConsumerRights #Paybacker")
- "suggested_image_prompt": a short prompt (1–2 sentences) for generating a matching image — dark premium aesthetic, deep navy background, gold accents

Return only valid JSON. No markdown code fences.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0];
    if (text.type !== 'text') throw new Error('Unexpected response from Claude');

    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse JSON from Claude response');

    const result = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      content: result.content,
      hashtags: result.hashtags,
      suggested_image_prompt: result.suggested_image_prompt,
    });
  } catch (error: any) {
    console.error('Social post generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
