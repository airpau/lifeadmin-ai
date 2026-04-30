/**
 * fal.ai image generation helper.
 *
 * Per CLAUDE.md: ALL image/video generation goes through fal.ai only.
 * This helper is used by /api/cron/content-ideas-generator and the admin UI.
 *
 * Model default: fal-ai/flux-pro/v1.1-ultra (best quality / cost ratio for vertical 9:16).
 * For fast prototyping use fal-ai/flux/schnell (1/10th the cost, slightly less polished).
 *
 * Output: public URL hosted on Supabase Storage so we don't depend on fal.ai's CDN.
 */

import { uploadImageToStorage } from '@/lib/storage';

const FAL_ENDPOINT = 'https://fal.run';

interface GenerateImageInput {
  prompt: string;
  model?: string;
  width?: number;   // default 1080
  height?: number;  // default 1920 (vertical 9:16 for TikTok / Reels)
  filename?: string; // path inside social-images bucket
}

/**
 * Hit fal.ai directly via REST, then re-upload the generated image into
 * our Supabase Storage bucket and return the public URL.
 *
 * We use the REST endpoint rather than @fal-ai/serverless-client to avoid
 * adding a new dependency — the endpoint is stable and the body shape is
 * consistent across the Flux family.
 */
export async function generateFalImage({
  prompt,
  model = 'fal-ai/flux-pro/v1.1-ultra',
  width = 1080,
  height = 1920,
  filename,
}: GenerateImageInput): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    throw new Error('FAL_KEY env var missing');
  }

  const brandedPrompt = `${prompt}

Brand colours: deep navy #0F172A, gold accent #F59E0B.
Critical: NO text, NO legible letters, NO signs, NO shop fronts with words, NO UI mockups with words.
UK-specific visual cues only. Natural lighting. Mobile-first vertical composition.`;

  const res = await fetch(`${FAL_ENDPOINT}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: brandedPrompt,
      image_size: { width, height },
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fal.ai ${model} failed ${res.status}: ${body.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const sourceUrl = data?.images?.[0]?.url;
  if (!sourceUrl) {
    throw new Error(`fal.ai returned no image URL: ${JSON.stringify(data).slice(0, 300)}`);
  }

  // Pull the image bytes and store in our bucket so we control the CDN.
  const imgRes = await fetch(sourceUrl);
  if (!imgRes.ok) {
    throw new Error(`fal.ai CDN fetch failed ${imgRes.status}`);
  }
  const arrayBuf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');

  const finalFilename =
    filename ??
    `generated/fal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  return uploadImageToStorage(base64, 'image/jpeg', finalFilename);
}

/**
 * Generate a short 6s video via fal.ai (Kling or Luma).
 * NOTE: returns the fal.ai CDN URL directly — video uploads to Supabase Storage
 * not yet wired because bucket `social-videos` may not exist.
 * Caller should copy the URL into social_videos record and download async.
 */
export async function generateFalVideo({
  prompt,
  model = 'fal-ai/kling-video/v2/master/text-to-video',
  durationSeconds = 5,
}: {
  prompt: string;
  model?: string;
  durationSeconds?: 5 | 10;
}): Promise<string> {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error('FAL_KEY env var missing');

  const res = await fetch(`${FAL_ENDPOINT}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      duration: String(durationSeconds),
      aspect_ratio: '9:16',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`fal.ai video ${model} failed ${res.status}: ${body.slice(0, 300)}`);
  }
  const data: any = await res.json();
  return data?.video?.url ?? data?.output?.video?.url ?? '';
}
