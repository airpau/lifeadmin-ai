// Generates a branded Paybacker image using Google Imagen API
// Returns a base64 encoded PNG or URL to the generated image

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';

const BRAND_PREFIX =
  'Dark navy blue background (#0f172a), gold/amber accent colour (#f59e0b), clean modern fintech design, professional UK financial brand called Paybacker.';
const BRAND_SUFFIX =
  'High contrast white text. Premium minimalist style. No stock photo faces. Abstract or graphical elements only.';

export function buildBrandedPrompt(imagePrompt: string): string {
  return `${BRAND_PREFIX} ${imagePrompt} ${BRAND_SUFFIX}`;
}

export async function generateSocialImage(
  prompt: string
): Promise<{ imageBase64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '1:1' },
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
