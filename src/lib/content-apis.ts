/**
 * External API integrations for content generation and social posting.
 *
 * Required env vars:
 * - FAL_API_KEY: fal.ai API key for Flux Pro image generation
 * - RUNWAY_API_KEY: Runway ML API key for Gen-3 Alpha video generation
 * - TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET: Twitter/X API v2
 * - LINKEDIN_ACCESS_TOKEN: LinkedIn Marketing API
 * - TIKTOK_ACCESS_TOKEN: TikTok Content Posting API
 * - META_ACCESS_TOKEN: already configured for Instagram/Facebook
 */

// ─── Image Generation (fal.ai Flux Pro) ─────────────────────────────────────

export async function generateImage(prompt: string): Promise<{ url: string } | null> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    console.log('[content-apis] FAL_API_KEY not set, skipping image generation');
    return null;
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1', {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: 1080, height: 1080 },
        num_images: 1,
        safety_tolerance: '2',
      }),
    });

    if (!res.ok) {
      console.error('[content-apis] fal.ai error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const url = data.images?.[0]?.url;
    return url ? { url } : null;
  } catch (err: any) {
    console.error('[content-apis] fal.ai failed:', err.message);
    return null;
  }
}

// ─── Video Generation (Runway ML Gen-3 Alpha) ───────────────────────────────

export async function generateVideo(prompt: string): Promise<{ url: string } | null> {
  const apiKey = process.env.RUNWAY_API_KEY;
  if (!apiKey) {
    console.log('[content-apis] RUNWAY_API_KEY not set, skipping video generation');
    return null;
  }

  try {
    // Start generation task
    const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: 'gen3a_turbo',
        promptText: prompt,
        duration: 5,
        watermark: false,
      }),
    });

    if (!res.ok) {
      console.error('[content-apis] Runway error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    // Runway returns a task ID, need to poll for completion
    // For now return the task info
    return data.output?.[0] ? { url: data.output[0] } : null;
  } catch (err: any) {
    console.error('[content-apis] Runway failed:', err.message);
    return null;
  }
}

// ─── Twitter/X Posting ───────────────────────────────────────────────────────

export async function postToTwitter(text: string): Promise<{ postId: string } | null> {
  const token = process.env.TWITTER_ACCESS_TOKEN;
  if (!token) {
    console.log('[content-apis] TWITTER_ACCESS_TOKEN not set, skipping Twitter post');
    return null;
  }

  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error('[content-apis] Twitter error:', res.status);
      return null;
    }

    const data = await res.json();
    return { postId: data.data?.id };
  } catch (err: any) {
    console.error('[content-apis] Twitter failed:', err.message);
    return null;
  }
}

// ─── LinkedIn Posting ────────────────────────────────────────────────────────

export async function postToLinkedIn(text: string): Promise<{ postId: string } | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    console.log('[content-apis] LINKEDIN_ACCESS_TOKEN not set, skipping LinkedIn post');
    return null;
  }

  try {
    // LinkedIn requires the person URN. This would need to be configured.
    const authorUrn = process.env.LINKEDIN_AUTHOR_URN || '';
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    });

    if (!res.ok) {
      console.error('[content-apis] LinkedIn error:', res.status);
      return null;
    }

    const data = await res.json();
    return { postId: data.id };
  } catch (err: any) {
    console.error('[content-apis] LinkedIn failed:', err.message);
    return null;
  }
}

// ─── TikTok Posting ──────────────────────────────────────────────────────────

export async function postToTikTok(caption: string, videoUrl: string): Promise<{ postId: string } | null> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) {
    console.log('[content-apis] TIKTOK_ACCESS_TOKEN not set, skipping TikTok post');
    return null;
  }

  // TikTok Content Posting API requires video upload flow
  // This is a simplified version
  console.log('[content-apis] TikTok posting not yet fully implemented');
  return null;
}
