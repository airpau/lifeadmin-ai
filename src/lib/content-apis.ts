/**
 * External API integrations for content generation and social posting.
 *
 * Architecture:
 * - fal.ai: ALL image and video generation
 * - Late (getlate.dev): ALL social media posting
 * - Perplexity API: ALL web research
 * - PostHog: ALL product analytics
 *
 * Required env vars:
 * - FAL_KEY: fal.ai API key
 * - RUNWAY_API_KEY: Runway ML backup for premium video renders
 * - LATE_API_KEY: Late API for social posting
 * - PERPLEXITY_API_KEY: Perplexity for web research
 * - POSTHOG_API_KEY: PostHog for analytics
 * - POSTHOG_HOST: PostHog host URL
 * - IPAPI_KEY: ipapi.co for IP fraud checks
 */

// ─── fal.ai Image Generation ─────────────────────────────────────────────────

export async function generateImageFal(prompt: string, model: string = 'fal-ai/flux-pro'): Promise<{ url: string } | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.log('[content-apis] FAL_KEY not set, skipping image generation');
    return null;
  }

  try {
    const res = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 1080, height: 1080 },
        num_images: 1,
      }),
    });

    if (!res.ok) {
      console.error(`[content-apis] fal.ai ${model} error:`, res.status);
      return null;
    }

    const data = await res.json();
    return data.images?.[0]?.url ? { url: data.images[0].url } : null;
  } catch (err: any) {
    console.error('[content-apis] fal.ai failed:', err.message);
    return null;
  }
}

// ─── fal.ai Video Generation ─────────────────────────────────────────────────

export async function generateVideoFal(prompt: string): Promise<{ url: string } | null> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    console.log('[content-apis] FAL_KEY not set, skipping video generation');
    return null;
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/kling-video/v1.6/standard/text-to-video', {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration: '5',
        aspect_ratio: '9:16',
      }),
    });

    if (!res.ok) {
      console.error('[content-apis] fal.ai kling-video error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.video?.url ? { url: data.video.url } : null;
  } catch (err: any) {
    console.error('[content-apis] fal.ai video failed:', err.message);
    return null;
  }
}

// ─── Runway ML Video Generation (backup) ─────────────────────────────────────

export async function generateVideoRunway(prompt: string): Promise<{ url: string } | null> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    console.log('[content-apis] RUNWAY_API_KEY not set');
    return null;
  }

  try {
    const res = await fetch('https://api.dev.runwayml.com/v1/text_to_video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({ model: 'gen3a_turbo', promptText: prompt, duration: 5 }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.output?.[0] ? { url: data.output[0] } : null;
  } catch (err: any) {
    console.error('[content-apis] Runway failed:', err.message);
    return null;
  }
}

// ─── Late API: Social Media Posting ──────────────────────────────────────────

export async function postViaLate(params: {
  platform: string;
  text: string;
  mediaUrl?: string;
}): Promise<{ postId: string; platform: string } | null> {
  const apiKey = process.env.LATE_API_KEY;
  if (!apiKey) {
    console.log(`[content-apis] LATE_API_KEY not set, skipping ${params.platform} post`);
    return null;
  }

  try {
    const res = await fetch('https://api.getlate.dev/v1/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        platforms: [params.platform],
        text: params.text,
        media: params.mediaUrl ? [{ url: params.mediaUrl }] : undefined,
      }),
    });

    if (!res.ok) {
      console.error(`[content-apis] Late ${params.platform} error:`, res.status);
      return null;
    }

    const data = await res.json();
    return { postId: data.id || data.posts?.[0]?.id || 'posted', platform: params.platform };
  } catch (err: any) {
    console.error(`[content-apis] Late failed:`, err.message);
    return null;
  }
}

// ─── Late API: Fetch Performance Metrics ─────────────────────────────────────

export async function getPostMetrics(postId: string): Promise<Record<string, any> | null> {
  const apiKey = process.env.LATE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://api.getlate.dev/v1/posts/${postId}/metrics`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Perplexity API: Web Research ────────────────────────────────────────────

export async function searchPerplexity(query: string): Promise<string | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log('[content-apis] PERPLEXITY_API_KEY not set');
    return null;
  }

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'You are a research assistant. Provide concise, factual answers with sources.' },
          { role: 'user', content: query },
        ],
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      console.error('[content-apis] Perplexity error:', res.status);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    console.error('[content-apis] Perplexity failed:', err.message);
    return null;
  }
}

// ─── PostHog API: Analytics Queries ──────────────────────────────────────────

export async function queryPostHog(eventName: string, days: number = 7): Promise<any> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';
  if (!apiKey) {
    console.log('[content-apis] POSTHOG_API_KEY not set');
    return null;
  }

  try {
    const res = await fetch(`${host}/api/event/?event=${eventName}&after=-${days}d&limit=100`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── IP Fraud Check ──────────────────────────────────────────────────────────

export async function checkIPFraud(ip: string): Promise<{ isProxy: boolean; isDatacenter: boolean; country: string } | null> {
  try {
    const apiKey = process.env.IPAPI_KEY;
    const url = apiKey
      ? `https://ipapi.co/${ip}/json/?key=${apiKey}`
      : `https://ipapi.co/${ip}/json/`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    return {
      isProxy: data.is_proxy === true,
      isDatacenter: data.org?.toLowerCase().includes('hosting') || data.org?.toLowerCase().includes('cloud') || data.org?.toLowerCase().includes('datacenter') || false,
      country: data.country_name || 'Unknown',
    };
  } catch {
    return null;
  }
}
