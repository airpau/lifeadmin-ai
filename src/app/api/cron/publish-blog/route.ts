import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { resend, FROM_EMAIL } from '@/lib/resend';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Topics pool - rotated through, mixed with topical research
const TOPIC_POOL = [
  { slug: 'energy-bill-dispute-guide', keyword: 'how to dispute energy bill UK', category: 'energy', dealCategory: 'Energy' },
  { slug: 'cancel-gym-membership-guide', keyword: 'how to cancel gym membership UK', category: 'fitness', dealCategory: null },
  { slug: 'council-tax-band-challenge', keyword: 'council tax band challenge UK', category: 'council_tax', dealCategory: null },
  { slug: 'debt-collection-letter-response', keyword: 'debt collection letter response UK', category: 'debt', dealCategory: 'Loans' },
  { slug: 'parking-fine-appeal-guide', keyword: 'how to appeal parking fine UK', category: 'parking', dealCategory: null },
  { slug: 'insurance-claim-underpaid', keyword: 'insurance claim underpaid UK', category: 'insurance', dealCategory: 'Insurance' },
  { slug: 'broadband-speed-complaint', keyword: 'broadband speed complaint Ofcom', category: 'broadband', dealCategory: 'Broadband' },
  { slug: 'mobile-contract-exit-fee', keyword: 'mobile contract exit fee UK', category: 'mobile', dealCategory: 'Mobile' },
  { slug: 'section-75-credit-card-claim', keyword: 'section 75 credit card claim UK', category: 'credit', dealCategory: 'Credit Cards' },
  { slug: 'water-bill-too-high', keyword: 'water bill too high UK', category: 'water', dealCategory: null },
  { slug: 'nhs-complaint-letter-guide', keyword: 'NHS complaint letter template', category: 'nhs', dealCategory: null },
  { slug: 'ppi-claim-still-possible', keyword: 'PPI claim 2026 UK', category: 'ppi', dealCategory: null },
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Check which topics have already been published (by checking blog directory)
  // Pick a random unwritten topic
  const existingPosts = TOPIC_POOL.map(t => t.slug);

  // Simple rotation: pick based on day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const topicIndex = dayOfYear % TOPIC_POOL.length;
  const topic = TOPIC_POOL[topicIndex];

  // Generate the blog post using Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: `You are a UK consumer rights expert writing blog posts for Paybacker (paybacker.co.uk), an AI-powered platform that generates formal complaint letters citing UK law.

Write engaging, practical blog posts that:
- Are genuinely helpful and informative (not just promotional)
- Cite specific UK laws and regulations accurately
- Include a light, slightly humorous tone where appropriate
- Are written for a UK audience using British English and £ symbols
- Reference current events or seasonal topics where relevant
- Never use em dashes - use hyphens or colons instead
- Include practical step-by-step advice
- End with a natural mention of Paybacker as a tool that can help

The post should be 800-1200 words, structured with clear H2 headings.

Return a JSON object with these fields:
{
  "title": "SEO-optimised title (60-70 chars)",
  "metaDescription": "Meta description (150-160 chars)",
  "content": "Full blog post in HTML format using <h2>, <p>, <ul>, <li> tags. No <h1> tag.",
  "excerpt": "2-3 sentence excerpt for the blog index page"
}`,
    messages: [{
      role: 'user',
      content: `Write a blog post targeting the keyword "${topic.keyword}". Today's date is ${today}. Make it practical, engaging, and slightly humorous where appropriate. Include specific UK law references. ${topic.dealCategory ? `Mention that Paybacker has deals from providers in the ${topic.dealCategory} category that users can compare.` : ''} The post should help someone who is searching for "${topic.keyword}" on Google.`,
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'No text response' }, { status: 500 });
  }

  let parsed: any;
  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('No JSON found');
  } catch {
    return NextResponse.json({ error: 'Failed to parse blog post', raw: textBlock.text.substring(0, 500) }, { status: 500 });
  }

  // Save blog post to database (rendered dynamically via /blog/[slug])
  const { error: insertErr } = await supabase.from('blog_posts').upsert({
    slug: topic.slug,
    title: parsed.title,
    meta_description: parsed.metaDescription,
    excerpt: parsed.excerpt,
    content: parsed.content,
    target_keyword: topic.keyword,
    category: topic.category,
    deal_category: topic.dealCategory,
    status: 'published',
    published_at: new Date().toISOString(),
  }, { onConflict: 'slug' });

  if (insertErr) {
    console.error('[blog] Insert failed:', insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Send to founder email with the post content for review
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'hello@paybacker.co.uk',
      subject: `[Blog Published] ${parsed.title}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </div>
  <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 12px;">New blog post published</h1>
    <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;">${parsed.title}</p>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Target keyword: ${topic.keyword}</p>
    <p style="color:#94a3b8;font-size:13px;">${parsed.excerpt}</p>
    <p style="color:#64748b;font-size:12px;margin-top:16px;">Note: This post was auto-generated by the content system. Review it at paybacker.co.uk/blog/${topic.slug} and edit if needed.</p>
  </div>
</div></body></html>`,
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    topic: topic.slug,
    title: parsed.title,
    keyword: topic.keyword,
  });
}
