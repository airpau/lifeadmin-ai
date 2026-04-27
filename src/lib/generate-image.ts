// Generates a branded Paybacker image using Google Imagen API.
// Returns a base64-encoded PNG (and the mime type) for the caller to
// upload wherever it wants — see uploadImageToStorage in storage.ts.

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';

// Editorial-illustration brand prompt. Matches the rest of the
// marketing surface (homepage hero, money-hub graphics): dark navy
// canvas, mint accents, single-subject editorial composition. The
// "no text, no faces" guard is non-negotiable — Imagen routinely
// hallucinates garbled UK legal text and stock-photo CEO faces if
// not explicitly told not to.
const BRAND_PREFIX =
  'Editorial illustration in the style of a premium UK fintech brand. ' +
  'Dark navy (#0f172a) canvas with mint green (#34d399) and warm amber (#f59e0b) accents. ' +
  'Single-subject hero composition, centred, with generous negative space and soft volumetric lighting. ' +
  'High contrast, clean modern shapes, vector-illustration feel — like a Stripe or Wise marketing asset.';

const BRAND_SUFFIX =
  'No human faces. No stock photography. No text, no words, no letters, no numbers anywhere in the image. ' +
  'Symbolic and metaphorical — the subject must clearly represent the topic at a glance, not be abstract. ' +
  'Composition aspect 16:9 landscape. Cinematic, premium, eye-catching.';

export function buildBrandedPrompt(imagePrompt: string): string {
  return `${BRAND_PREFIX} The subject of this illustration is: ${imagePrompt}. ${BRAND_SUFFIX}`;
}

export async function generateSocialImage(
  prompt: string,
  options: { aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' } = {}
): Promise<{ imageBase64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: options.aspectRatio ?? '1:1' },
  };

  async function attempt(): Promise<Response> {
    return fetch(`${IMAGEN_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  let res = await attempt();

  // Retry once on rate limit
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await attempt();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Imagen API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  const instance = data?.predictions?.[0];
  if (!instance?.bytesBase64Encoded) {
    throw new Error('Imagen API returned no image data');
  }

  return {
    imageBase64: instance.bytesBase64Encoded,
    mimeType: instance.mimeType ?? 'image/png',
  };
}
