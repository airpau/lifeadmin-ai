import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { resend, FROM_EMAIL } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// 50+ high-value UK consumer SEO topics
const TOPIC_POOL = [
  { slug: 'energy-bill-dispute-guide', keyword: 'how to dispute energy bill UK', category: 'energy', dealCategory: 'Energy', seePage: '/dispute-energy-bill' },
  { slug: 'cancel-gym-membership-guide', keyword: 'how to cancel gym membership UK', category: 'fitness', dealCategory: null, seePage: '/cancel-gym-membership' },
  { slug: 'council-tax-band-challenge', keyword: 'council tax band challenge UK', category: 'council_tax', dealCategory: null, seePage: '/council-tax-challenge' },
  { slug: 'debt-collection-letter-response', keyword: 'debt collection letter response UK', category: 'debt', dealCategory: 'Loans', seePage: '/debt-collection-letter' },
  { slug: 'parking-fine-appeal-guide', keyword: 'how to appeal parking fine UK', category: 'parking', dealCategory: null, seePage: null },
  { slug: 'insurance-claim-underpaid', keyword: 'insurance claim underpaid UK', category: 'insurance', dealCategory: 'Insurance', seePage: null },
  { slug: 'broadband-speed-complaint', keyword: 'broadband speed complaint Ofcom', category: 'broadband', dealCategory: 'Broadband', seePage: null },
  { slug: 'mobile-contract-exit-fee', keyword: 'mobile contract exit fee UK', category: 'mobile', dealCategory: 'Mobile', seePage: null },
  { slug: 'section-75-credit-card-claim', keyword: 'section 75 credit card claim UK', category: 'credit', dealCategory: 'Credit Cards', seePage: null },
  { slug: 'water-bill-too-high', keyword: 'water bill too high UK', category: 'water', dealCategory: null, seePage: null },
  { slug: 'nhs-complaint-letter-guide', keyword: 'NHS complaint letter template UK', category: 'nhs', dealCategory: null, seePage: null },
  { slug: 'ppi-claim-still-possible', keyword: 'PPI claim 2026 still possible UK', category: 'ppi', dealCategory: null, seePage: null },
  { slug: 'train-delay-compensation-guide', keyword: 'train delay compensation UK 2026', category: 'transport', dealCategory: null, seePage: null },
  { slug: 'flight-delay-compensation-guide', keyword: 'flight delay compensation UK claim 2026', category: 'travel', dealCategory: null, seePage: '/flight-delay-compensation' },
  { slug: 'landlord-deposit-dispute', keyword: 'landlord withholding deposit UK rights', category: 'housing', dealCategory: null, seePage: null },
  { slug: 'faulty-goods-refund-guide', keyword: 'faulty goods refund rights UK Consumer Rights Act', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'chargeback-guide', keyword: 'how to do a chargeback UK debit card 2026', category: 'banking', dealCategory: null, seePage: null },
  { slug: 'package-holiday-refund-guide', keyword: 'package holiday refund rights UK ATOL', category: 'travel', dealCategory: null, seePage: null },
  { slug: 'car-insurance-renewal-overpriced', keyword: 'car insurance renewal price too high UK', category: 'insurance', dealCategory: 'Insurance', seePage: null },
  { slug: 'cancel-subscription-uk-law', keyword: 'cancel subscription UK cooling off period law', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'gdpr-subject-access-request', keyword: 'GDPR subject access request letter UK template', category: 'data', dealCategory: null, seePage: null },
  { slug: 'payday-loan-complaint-guide', keyword: 'payday loan complaint UK FCA refund', category: 'debt', dealCategory: null, seePage: null },
  { slug: 'credit-file-dispute-guide', keyword: 'how to dispute credit file error UK', category: 'credit', dealCategory: 'Credit Cards', seePage: null },
  { slug: 'smart-meter-problems-guide', keyword: 'smart meter problems complaint UK energy', category: 'energy', dealCategory: 'Energy', seePage: '/dispute-energy-bill' },
  { slug: 'tv-licence-dispute-guide', keyword: 'TV licence dispute complaint UK BBC', category: 'tv', dealCategory: null, seePage: null },
  { slug: 'workplace-underpayment-claim', keyword: 'employer not paying wages UK legal rights', category: 'employment', dealCategory: null, seePage: null },
  { slug: 'housing-disrepair-claim-guide', keyword: 'housing disrepair claim tenant rights UK', category: 'housing', dealCategory: null, seePage: null },
  { slug: 'missed-delivery-compensation', keyword: 'missed delivery compensation rights UK', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'hmrc-tax-refund-guide', keyword: 'HMRC tax refund overpaid income tax UK', category: 'tax', dealCategory: null, seePage: null },
  { slug: 'bank-fraud-claim-guide', keyword: 'bank refused to refund fraud authorised push payment UK', category: 'banking', dealCategory: null, seePage: null },
  { slug: 'energy-direct-debit-too-high', keyword: 'energy direct debit increased too much UK complaint', category: 'energy', dealCategory: 'Energy', seePage: '/dispute-energy-bill' },
  { slug: 'car-finance-complaint-guide', keyword: 'car finance mis-selling complaint UK FCA 2026', category: 'finance', dealCategory: 'Loans', seePage: null },
  { slug: 'letting-agent-fees-dispute', keyword: 'letting agent illegal fees dispute UK', category: 'housing', dealCategory: null, seePage: null },
  { slug: 'pension-complaint-guide', keyword: 'pension complaint UK Pensions Ombudsman', category: 'pension', dealCategory: null, seePage: null },
  { slug: 'building-work-dispute-guide', keyword: 'builder dispute complaint UK consumer rights', category: 'trades', dealCategory: null, seePage: null },
  { slug: 'subscription-auto-renewal-rights', keyword: 'subscription auto renewal rights UK 2026', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'council-tax-exemption-guide', keyword: 'council tax exemption UK who qualifies 2026', category: 'council_tax', dealCategory: null, seePage: '/council-tax-challenge' },
  { slug: 'cancel-contract-14-days-guide', keyword: 'cancel contract within 14 days UK cooling off', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'data-breach-compensation-guide', keyword: 'data breach compensation claim UK GDPR', category: 'data', dealCategory: null, seePage: null },
  { slug: 'home-insurance-claim-rejected', keyword: 'home insurance claim rejected UK what to do', category: 'insurance', dealCategory: 'Insurance', seePage: null },
  { slug: 'overdraft-charges-reclaim', keyword: 'unfair bank overdraft charges reclaim UK', category: 'banking', dealCategory: null, seePage: null },
  { slug: 'private-parking-charge-appeal', keyword: 'private parking charge appeal UK 2026 DVLA', category: 'parking', dealCategory: null, seePage: null },
  { slug: 'atol-protection-claim-guide', keyword: 'ATOL protection claim UK holiday company collapsed', category: 'travel', dealCategory: null, seePage: null },
  { slug: 'rejected-universal-credit-appeal', keyword: 'universal credit appeal UK process mandatory reconsideration', category: 'benefits', dealCategory: null, seePage: null },
  { slug: 'phone-network-coverage-complaint', keyword: 'mobile phone no signal coverage complaint UK Ofcom', category: 'mobile', dealCategory: 'Mobile', seePage: null },
  { slug: 'online-shopping-rights-uk', keyword: 'online shopping refund rights UK Distance Selling', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'leasehold-service-charge-dispute', keyword: 'leasehold service charge dispute UK First-tier Tribunal', category: 'housing', dealCategory: null, seePage: null },
  { slug: 'holiday-sickness-claim-guide', keyword: 'holiday sickness claim UK hotel food poisoning', category: 'travel', dealCategory: null, seePage: null },
  { slug: 'gas-boiler-warranty-claim', keyword: 'gas boiler warranty claim refused UK', category: 'energy', dealCategory: 'Energy', seePage: null },
  { slug: 'bank-account-closure-rights', keyword: 'bank closing account without warning UK rights', category: 'banking', dealCategory: null, seePage: null },
  { slug: 'section-21-notice-guide', keyword: 'section 21 notice tenant rights UK 2026', category: 'housing', dealCategory: null, seePage: null },
  { slug: 'subscription-price-rise-rights', keyword: 'subscription price increase rights UK cancel', category: 'consumer', dealCategory: null, seePage: null },
  { slug: 'energy-supplier-switching-guide', keyword: 'how to switch energy supplier UK save money', category: 'energy', dealCategory: 'Energy', seePage: '/dispute-energy-bill' },
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Check which topics have already been published
  const { data: published } = await supabase
    .from('blog_posts')
    .select('slug')
    .eq('status', 'published');
  const publishedSlugs = new Set((published || []).map(p => p.slug));

  // Pick first unwritten topic; if all written, refresh the oldest
  const unwritten = TOPIC_POOL.filter(t => !publishedSlugs.has(t.slug));
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));

  let topic;
  if (unwritten.length > 0) {
    topic = unwritten[dayOfYear % unwritten.length];
    console.log(`[blog] ${unwritten.length} unwritten topics remain. Picking: ${topic.slug}`);
  } else {
    topic = TOPIC_POOL[dayOfYear % TOPIC_POOL.length];
    console.log(`[blog] All topics written. Refreshing: ${topic.slug}`);
  }

  // Step 1: Research with Perplexity for up-to-date UK info
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  let researchContext = '';

  if (perplexityKey) {
    try {
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
            content: `What is the latest UK consumer advice for "${topic.keyword}" as of 2026? Include recent law changes, current figures, deadlines, compensation amounts, relevant regulators (Ofcom, Ofgem, FCA, etc.), and ombudsman processes. Focus on practical, accurate information for UK consumers.`,
          }],
        }),
      });

      if (researchRes.ok) {
        const researchData = await researchRes.json();
        researchContext = researchData.choices?.[0]?.message?.content || '';
        console.log(`[blog] Perplexity: ${researchContext.length} chars for "${topic.keyword}"`);
      } else {
        console.warn(`[blog] Perplexity returned ${researchRes.status}`);
      }
    } catch (err: any) {
      console.error('[blog] Perplexity failed:', err.message);
    }
  }

  // Step 2: Generate blog post with Claude
  // Use ANTHROPIC_AGENTS_API_KEY for agent cost tracking; fall back to ANTHROPIC_API_KEY
  const apiKey = process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[blog] No Anthropic API key found (ANTHROPIC_AGENTS_API_KEY or ANTHROPIC_API_KEY)');
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const researchBlock = researchContext
    ? `\n\nCURRENT RESEARCH (use these facts, figures, and regulatory details for accuracy):\n${researchContext}`
    : '';

  const internalLinkHint = topic.seePage
    ? `\n- For the main topic page, link to <a href="${topic.seePage}">our dedicated guide</a> at least once.`
    : '';

  const dealHint = topic.dealCategory
    ? `\n- Near the end, mention that users can compare ${topic.dealCategory} deals on Paybacker to find a better provider.`
    : '';

  let response;
  try {
    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: `You are a UK consumer rights expert writing SEO blog posts for Paybacker (paybacker.co.uk) - an AI platform that generates formal complaint letters citing exact UK law in 30 seconds.

Write comprehensive, genuinely helpful blog posts that:
- Are 1500-2000 words (longer posts rank better on Google)
- Target the given long-tail UK keyword naturally throughout
- Use H2 for main sections and H3 for sub-sections - clear hierarchy
- Include specific UK legislation (Consumer Rights Act 2015, Consumer Credit Act 1974, etc.), named regulators (Ofcom, Ofgem, FCA, ICO, etc.), and current figures from the research
- Include 2 inline CTAs placed naturally within the content (not just at the end)
- Add 1-2 internal links to relevant Paybacker tools where they naturally fit
- Are written in British English (£ symbols, British spelling, UK-specific advice)
- Never use em dashes - use hyphens or colons instead
- Use a helpful, expert-but-approachable tone

REQUIRED CONTENT STRUCTURE:
1. Opening paragraph (no heading) - hook with a relatable UK consumer problem, establish scale (statistics help)
2. H2: Understanding Your Legal Rights - exact legislation, what it covers, key thresholds
3. H2: [Topic-specific section title] with H3 sub-sections breaking down the issue
4. [INLINE CTA - complaint letter tool, placed after the problem is established]
5. H2: Step-by-Step Guide to [topic] - numbered steps using <ol><li> tags
6. H2: What If They Refuse? - escalation: ombudsman, FOS, FCA, Trading Standards, small claims court
7. H2: Key Facts at a Glance - bullet points with the most important numbers, deadlines, compensation limits
8. Closing paragraph: encourage action, mention Paybacker naturally

INLINE CTA HTML (use exactly these - do not modify the styling):

Complaint letter CTA:
<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:24px;margin:32px 0;text-align:center;"><p style="color:#f59e0b;font-weight:700;font-size:16px;margin:0 0 8px;">Write Your Formal Complaint Letter in 30 Seconds</p><p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">Paybacker's AI generates complaint letters citing exact UK law. Free to try - 3 letters per month, no credit card needed.</p><a href="/auth/signup" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Generate Free Letter</a></div>

Subscription/bill tracker CTA (use when topic involves bills or subscriptions):
<div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:24px;margin:32px 0;text-align:center;"><p style="color:#22c55e;font-weight:700;font-size:16px;margin:0 0 8px;">Are Hidden Charges Draining Your Account?</p><p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">Connect your bank to Paybacker and our AI finds every subscription, direct debit, and hidden charge - then helps you cancel or dispute them.</p><a href="/auth/signup" style="display:inline-block;background:#22c55e;color:#0f172a;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;">Scan My Bank Free</a></div>

INTERNAL LINKS (use where naturally relevant - open as normal links):
- Energy disputes: <a href="/dispute-energy-bill">our energy bill dispute guide</a>
- Flight compensation: <a href="/flight-delay-compensation">our flight delay compensation guide</a>
- Gym cancellations: <a href="/cancel-gym-membership">how to cancel your gym membership</a>
- Council tax: <a href="/council-tax-challenge">our council tax challenge guide</a>
- Debt letters: <a href="/debt-collection-letter">our debt letter response guide</a>
- Paybacker complaints tool: <a href="/auth/signup">Paybacker's AI complaints tool</a>

Return ONLY a valid JSON object with no markdown code fences:
{
  "title": "SEO title 60-70 characters, primary keyword near start",
  "metaDescription": "Meta description 150-160 chars - compelling, includes keyword, ends with a soft CTA",
  "content": "Complete HTML blog post (no <h1> tag - use <h2> and <h3> only, plus <p>, <ul>, <li>, <ol>, <strong>, <a> tags)",
  "excerpt": "2-3 engaging sentences summarising the post for the blog index page"
}`,
      messages: [{
        role: 'user',
        content: `Write a comprehensive SEO blog post targeting the keyword: "${topic.keyword}"

Today's date: ${today}
Category: ${topic.category}
${internalLinkHint}${dealHint}${researchBlock}

Make it genuinely useful for someone searching "${topic.keyword}" on Google. Include real UK law references, specific figures, and practical steps. The post should establish Paybacker as the go-to tool for UK consumer disputes.`,
      }],
    });
  } catch (err: any) {
    console.error('[blog] Claude API failed:', err.message);
    return NextResponse.json({ error: 'Claude API failed', detail: err.message }, { status: 500 });
  }

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'No text response from Claude' }, { status: 500 });
  }

  let parsed: any;
  try {
    // Strip markdown code fences if present, then parse JSON
    const cleaned = textBlock.text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error('No JSON object found in response');
  } catch (parseErr: any) {
    console.error('[blog] JSON parse failed:', parseErr.message);
    return NextResponse.json({ error: 'Failed to parse blog post JSON', raw: textBlock.text.substring(0, 500) }, { status: 500 });
  }

  if (!parsed.title || !parsed.content) {
    return NextResponse.json({ error: 'Missing required fields in parsed post', parsed }, { status: 500 });
  }

  // Save to database
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
    console.error('[blog] Supabase upsert failed:', insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  console.log(`[blog] Published: ${topic.slug} - "${parsed.title}"`);

  // Email founder
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
    <p style="color:#94a3b8;font-size:13px;margin:0 0 4px;">Target keyword: ${topic.keyword}</p>
    <p style="color:#94a3b8;font-size:13px;margin:0 0 16px;">Topics remaining in pool: ${unwritten.length > 0 ? unwritten.length - 1 : TOPIC_POOL.length - 1}</p>
    <p style="color:#94a3b8;font-size:13px;">${parsed.excerpt}</p>
    <a href="https://paybacker.co.uk/blog/${topic.slug}" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;margin-top:16px;">View Post</a>
    <p style="color:#64748b;font-size:12px;margin-top:16px;">Auto-generated by Paybacker content system. Edit at paybacker.co.uk/blog/${topic.slug} if needed.</p>
  </div>
</div></body></html>`,
    });
  } catch (emailErr: any) {
    console.warn('[blog] Founder email failed (non-fatal):', emailErr.message);
  }

  return NextResponse.json({
    ok: true,
    topic: topic.slug,
    title: parsed.title,
    keyword: topic.keyword,
    topicsRemaining: unwritten.length > 0 ? unwritten.length - 1 : TOPIC_POOL.length - 1,
  });
}
