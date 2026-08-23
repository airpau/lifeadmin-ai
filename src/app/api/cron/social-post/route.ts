import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { findBrandSpellingErrors } from '@/lib/social/brand-spelling';
import { findUnverifiableClaims, describeClaims } from '@/lib/social/claims-guard';
import { generateImageHiggsfield, higgsfieldConfigured } from '@/lib/higgsfield/generate-image';

export const runtime = 'nodejs';
// Raised from 120s on 23 Aug 2026. Higgsfield is asynchronous and a real
// measured submit-to-completed cycle took ~2 minutes (~90s queued, ~35s
// generating). At 120s this function could never wait out an image, so the
// Higgsfield path would have timed out and silently fallen back to fal.ai on
// every single run. 300s is the Vercel Pro ceiling for a serverless function.
export const maxDuration = 300;

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

/** Fire-and-forget Telegram note to the founder. Never throws. */
async function alertFounder(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Number(chatId), text }),
  }).catch(() => {});
}

/**
 * Ask the generator for a branded square image and return a PERMANENT URL.
 *
 * Higgsfield is the default generator (CLAUDE.md, "CRITICAL ARCHITECTURE
 * RULES"). fal.ai remains only as an automatic fallback for when Higgsfield
 * credentials are absent or the request fails, so a credential problem
 * degrades the image rather than killing the day's post.
 *
 * Whichever generator produced it, the bytes are copied into Supabase storage
 * before use: Higgsfield output URLs are retained for as little as seven days,
 * and content_drafts.asset_url is a long-lived record.
 *
 * NO hex colour codes in the prompt — models render them as visible text.
 */
async function generateImage(prompt: string): Promise<string | null> {
  const styled = `Dark navy blue background, mint green glowing accents, ${prompt}, absolutely no text no words no letters no numbers no characters, abstract shapes, premium fintech aesthetic, clean modern design, professional social media square post`;

  let sourceUrl: string | null = null;
  let generator = 'higgsfield';

  if (higgsfieldConfigured()) {
    // Measured: ~2 minutes submit-to-completed on 23 Aug 2026. 190s leaves
    // headroom inside the 300s maxDuration for Perplexity, Sonnet, the
    // Supabase upload and three platform posts.
    sourceUrl = await generateImageHiggsfield(styled, {
      aspectRatio: '1:1',
      resolution: '1080p',
      timeoutMs: 190_000,
    });
  } else {
    console.warn('[social-post] Higgsfield not configured, falling back to fal.ai');
  }

  if (!sourceUrl) {
    generator = 'fal.ai';
    sourceUrl = await generateImageFalFallback(styled);
  }

  if (!sourceUrl) {
    console.error('[social-post] no image from any generator');
    return null;
  }

  try {
    const imgRes = await fetch(sourceUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const supabase = getAdmin();
    const fileName = `social-auto-${Date.now()}.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from('social-images')
      .upload(fileName, imgBuffer, { contentType: 'image/jpeg', upsert: true });

    if (uploadErr) { console.error('[social-post] Upload error:', uploadErr.message); return null; }

    console.log(`[social-post] image generated via ${generator}`);
    return `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()}/storage/v1/object/public/social-images/${fileName}`;
  } catch (err: any) {
    console.error('[social-post] Image storage error:', err.message);
    return null;
  }
}

/** Legacy fal.ai path. Fallback only — Higgsfield is the default generator. */
async function generateImageFalFallback(styledPrompt: string): Promise<string | null> {
  const falKey = (process.env.FAL_KEY || '').replace(/\\n/g, '').trim();
  if (!falKey) return null;

  try {
    const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: styledPrompt, image_size: 'square', num_images: 1 }),
    });

    const falData = await falRes.json();
    const imageUrl = falData.images?.[0]?.url;
    if (!imageUrl) { console.error('[social-post] No image URL from fal.ai:', JSON.stringify(falData).substring(0, 200)); return null; }
    return imageUrl;
  } catch (err: any) {
    console.error('[social-post] fal.ai fallback error:', err.message);
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

  // ── Daily claim lock ─────────────────────────────────────────────────
  // The old check counted rows already marked 'posted'. That row was written
  // AFTER all three platforms had been published to, so any run that posted to
  // Facebook and then timed out (the chain is
  // Perplexity + Sonnet + fal.ai + three Graph calls) left no evidence behind,
  // and the next invocation posted the day's content a second time. That is
  // what produced the duplicate pairs on 21 Aug, 22 Jun and 24 Apr 2026.
  //
  // We now claim the day BEFORE doing any work. The claim is a row carrying a
  // unique dedup_key, so two concurrent invocations cannot both win: the
  // second gets a 23505 unique violation and exits. The row is settled to
  // 'posted' at the end, or released only on paths that published nothing.
  const postDate = new Date().toISOString().slice(0, 10); // UTC, matches cron schedule
  const dedupKey = `social-post:${postDate}`;

  const { data: claim, error: claimErr } = await supabase
    .from('content_drafts')
    .insert({
      platform: 'facebook',
      content_type: 'text_post',
      status: 'publishing',
      dedup_key: dedupKey,
      post_date: postDate,
      // content_drafts.caption is NOT NULL, and the real caption does not exist
      // yet at claim time. Placeholder is overwritten when the row is settled.
      caption: `[claimed ${postDate}, generating]`,
    })
    .select('id')
    .single();

  if (claimErr || !claim) {
    // 23505 is the expected path: today is already claimed.
    const alreadyClaimed = claimErr?.code === '23505';
    if (!alreadyClaimed) {
      console.error('[social-post] could not claim today:', claimErr?.message);
    }
    return NextResponse.json({
      skipped: true,
      reason: alreadyClaimed ? 'Already claimed for today' : 'Claim failed',
      detail: alreadyClaimed ? undefined : claimErr?.message,
    });
  }

  const claimId = claim.id as string;

  /**
   * Release the day's claim so a later invocation can retry.
   *
   * ONLY safe on paths that published nothing. Once a Graph API call has been
   * made we keep the claim regardless of outcome, because a partial success
   * (Facebook posted, Instagram failed) must not licence a second full post.
   */
  const releaseClaim = async () => {
    await supabase.from('content_drafts').delete().eq('id', claimId);
  };

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

  // Step 3: Use Claude to write a topical, engaging post based on research.
  // Wrapped in a function so the brand-spelling guard below can ask for
  // exactly one retry before giving up and skipping the post.
  async function writeCaption(
    correction?: string,
    claimsCorrection?: string,
  ): Promise<{ caption: string; imagePrompt: string }> {
  const postRes = await anthropic.messages.create({
    // Sonnet, not Haiku. This runs once a day for roughly 800 tokens, so the
    // cost difference is pennies a month against ~£0.19/day total spend, and
    // the output publishes unsupervised to Facebook, Instagram and X under
    // our own brand.
    model: 'claude-sonnet-5',
    max_tokens: 800,
    system: `You are Casey, the Chief Content Officer for Paybacker, a UK consumer rights fintech platform. You write social media posts that are timely, relevant, and engaging.

Your job: write ONE social media post based on today's UK consumer news. Connect the news to how Paybacker helps.

## THE #1 FEATURE — ALWAYS LEAD WITH THIS

The Paybacker Telegram bot is our most compelling product feature. Every post should either be about the bot directly, or mention it. Generic "AI finance app" messaging is weak. Specific Telegram bot capabilities are the ads.

Hero messaging to build posts around. Describe the capability, never attach a recovered amount or a timing claim to a real user:
- Paybacker's AI bot lives in your Telegram and reads your bank feed, so it can see a charge you would have to go looking for
- Evening money wrap-up pushed to your phone at 9pm — no app to open, no login
- Ask it anything in plain English: "have my bills gone up this year?" — it reads your real transactions and answers instantly
- A dispute letter citing the exact UK consumer law, drafted in seconds, free, in your Telegram at 3am

## CLAIMS POLICY — THIS IS NOT NEGOTIABLE

On 21 August 2026 Meta restricted link sharing on paybacker.co.uk under its
Fraud, Scams and Deceptive Practices standard. The cause was a run of posts
carrying invented performance figures and fabricated customer stories. Twenty-one
posts had to be deleted. If you reintroduce any of it, the domain gets
restricted again and the business loses its distribution.

You may state:
- what the product does
- statutory entitlements that exist in UK law, with the instrument named — "up to £520 per passenger under UK261", "Section 75 covers £100 to £30,000"
- published third-party research, with the source named in the sentence — "Citizens Advice costs the loyalty penalty at around £4 billion a year"
- our own prices: Free, Essential £4.99/mo, Pro £9.99/mo

You may NOT state, under any framing, including hypothetical, illustrative or "for example":
- a success rate, response rate, or upheld rate of any kind, in percentages or in words ("four in ten", "most users")
- a total recovered, reclaimed or clawed back by users, for any period
- an average or typical or median saving, reclaim, refund or response time per user
- any statistic about our own user base — how many subscriptions they have, what they spend, what they recover
- a named or initialled customer story, quote or case study, whether or not it is marked as an example. No "Priya's contract", no "— Paul R., Bristol"
- a specific outcome attributed to a named provider — "Virgin Media reversed the hike"
- that Paybacker is FCA-regulated, FCA-authorised, FCA-backed or FCA-approved. We are NOT. Yapily, our Open Banking provider, is. If you mention the FCA at all, it must be about Yapily or about a regulator's own rules, never a badge on us. Never use #FCARegulated.
- a comparison to what a solicitor, lawyer, claims firm or claims-management company charges

If a post feels weak without a number, the post is about the wrong thing. Write
about the mechanism instead: which rule applies, what the provider is obliged to
do, what the product checks.

Hard rules for every post:
- The brand name is ALWAYS spelled "Paybacker". Never any other spelling. Not "Parybacker", not "Parabacked", not "Paybacked", not "Pay Backer", not "PayBacker". Check every occurrence before you return. Live posts have gone out to Facebook reading "Parybacker" and "Parabacked". This is the single most damaging mistake you can make here, because it publishes under our own brand.
- Focus on what the product does, not who it is cheaper than

Other Paybacker features you can mention:
- Free AI complaint letters citing UK consumer law (energy, broadband, flights, debt, parking, council tax)
- Bank scanning to detect all subscriptions and recurring payments
- Contract tracking with renewal alerts (30/14/7 days before)
- AI cancellation emails with legal context
- Spending intelligence dashboard with category breakdown

Brand identity: Calm, trustworthy, modern fintech. Colours are deep navy and mint green, not gold/amber.

Rules:
- British English, £ symbols
- Never use em dashes
- Keep it under 2000 characters
- Start with a strong hook related to today's news
- Be specific (use real figures, company names, dates from the research)
- End with "Try it free at paybacker.co.uk" or "Get started free at paybacker.co.uk"
- Never use waitlist language — Paybacker is live and free to join now
- Add 8-12 relevant hashtags at the end (include #TelegramBot when the post features the bot)
- Do NOT repeat topics from recent posts

Return JSON: {"caption": "the post text", "imagePrompt": "brief abstract description for image, e.g. glowing WiFi signal waves, shield protecting coins, house with energy bolt. Do NOT include any colour codes or hex values. Do NOT include any text or words in the image description."}`,
    messages: [{
      role: 'user',
      content: `Today's UK consumer news:\n${researchContext || 'No research available - write about a general UK consumer rights topic.'}\n\nRecent posts (avoid repeating):\n${recentTopics || 'None yet'}${
        correction
          ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED. It misspelled the brand name as: ${correction}. The brand name is spelled "Paybacker" and nothing else. Write the post again and check every occurrence.`
          : ''
      }${
        claimsCorrection
          ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by the claims guard. It contained: ${claimsCorrection}\n\nThese are claims we cannot evidence, and they are the exact category of copy that got paybacker.co.uk restricted by Meta on 21 August 2026. Write the post again with NO success rate, NO recovery total, NO average or typical user outcome, NO statistic about our own users, NO named customer story, NO FCA authorisation claim about Paybacker, and NO solicitor cost comparison. Describe what the product does and which UK rule applies. If the angle only works with a number you cannot source, pick a different angle.`
          : ''
      }`,
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

  return { caption, imagePrompt };
  }

  // ── Brand-spelling guard ─────────────────────────────────────────────
  // The prompt rule makes a misspelling unlikely; this makes it impossible to
  // publish one. Runs before the image is generated and before any Graph API
  // call, so a rejected caption costs one Haiku call and nothing else.
  let { caption, imagePrompt } = await writeCaption();
  let offenders = findBrandSpellingErrors(caption);

  if (offenders.length > 0) {
    console.warn(`[social-post] brand misspelling ${JSON.stringify(offenders)}, regenerating once`);
    ({ caption, imagePrompt } = await writeCaption(offenders.map((o) => `"${o}"`).join(', ')));
    offenders = findBrandSpellingErrors(caption);
  }

  if (offenders.length > 0) {
    // Failed twice. Skip the post entirely rather than publish under a
    // misspelt brand, and tell the founder why.
    const detail = offenders.map((o) => `"${o}"`).join(', ');
    console.error(`[social-post] brand misspelling after retry, skipping post: ${detail}`);

    await alertFounder(
      `Daily social post SKIPPED: brand name misspelled after one retry.\n\n` +
        `Flagged: ${detail}\n\n` +
        `Nothing was published to Facebook, Instagram or X.\n\n` +
        `Caption was:\n${caption.substring(0, 500)}`,
    );

    // Nothing was published, so the day is free for a retry.
    await releaseClaim();

    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: 'brand_misspelling',
      offenders,
    });
  }

  // ── Unverifiable-claims guard ────────────────────────────────────────
  // The prompt forbids success rates, recovery totals, invented user stats,
  // testimonials and FCA authorisation claims. It forbade most of them while
  // the posts Meta restricted us for were going out, because the same prompt
  // also supplied a hero line containing a recovery figure. Prompt rules are
  // not controls. This is the control.
  let claims = findUnverifiableClaims(caption);

  if (claims.length > 0) {
    console.warn(`[social-post] unverifiable claims ${describeClaims(claims)}, regenerating once`);
    ({ caption, imagePrompt } = await writeCaption(undefined, describeClaims(claims)));
    claims = findUnverifiableClaims(caption);

    // A regenerated caption still has to clear the brand check.
    const reOffenders = findBrandSpellingErrors(caption);
    if (reOffenders.length > 0) {
      console.error(`[social-post] brand misspelling on claims retry, skipping: ${reOffenders.join(', ')}`);
      await alertFounder(
        `Daily social post SKIPPED: brand misspelled on the claims-guard retry.\n\n` +
          `Flagged: ${reOffenders.join(', ')}\n\nNothing was published.`,
      );
      await releaseClaim();
      return NextResponse.json({ ok: false, skipped: true, reason: 'brand_misspelling', offenders: reOffenders });
    }
  }

  if (claims.length > 0) {
    // Failed twice. Publishing an unevidenced money claim while the domain is
    // under Meta review is the one outcome worth failing the whole job over.
    const detail = describeClaims(claims);
    console.error(`[social-post] unverifiable claims after retry, skipping post: ${detail}`);

    await alertFounder(
      `Daily social post SKIPPED: unverifiable claim after one retry.\n\n` +
        `Flagged: ${detail}\n\n` +
        `Nothing was published to Facebook, Instagram or X.\n\n` +
        `Caption was:\n${caption.substring(0, 500)}`,
    );

    await releaseClaim();

    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: 'unverifiable_claim',
      claims,
    });
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

  // Post to X/Twitter (truncate to 280 chars)
  try {
    const { postTweet } = await import('@/lib/twitter');
    // Strip hashtags if needed to fit 280 chars, keep the core message
    let tweetText = caption;
    if (tweetText.length > 280) {
      // Try removing hashtags first
      tweetText = tweetText.replace(/#\w+/g, '').trim();
      if (tweetText.length > 280) {
        tweetText = tweetText.substring(0, 277) + '...';
      }
    }
    const tweet = await postTweet(tweetText);
    results.twitter = tweet ? { ok: true, tweetId: tweet.id } : { error: 'Post failed' };
  } catch (err: any) {
    results.twitter = { error: err.message };
  }

  // Settle the claim we took at the top. This UPDATES the existing row rather
  // than inserting a new one, so the dedup_key stays unique for the day and
  // the row survives even if a platform failed — a partial success must not
  // licence a second full post.
  await supabase
    .from('content_drafts')
    .update({
      caption,
      asset_url: imageUrl,
      status: 'posted',
      posted_at: new Date().toISOString(),
      performance_metrics: results,
    })
    .eq('id', claimId);

  // Notify founder via Telegram
  await alertFounder(
    `Daily social post published:\n\n` +
      `FB: ${results.facebook?.ok ? 'Posted' : results.facebook?.error || 'Failed'}\n` +
      `IG: ${results.instagram?.ok ? 'Posted' : results.instagram?.error || results.instagram?.skipped || 'Failed'}\n` +
      `X: ${results.twitter?.ok ? 'Posted' : results.twitter?.error || 'Failed'}\n\n` +
      `Caption: ${caption.substring(0, 150)}...`,
  );

  return NextResponse.json({ ok: true, caption: caption.substring(0, 100), ...results });
}
