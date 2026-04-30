// Generates a branded Paybacker image using Google Imagen API.
// Returns a base64-encoded PNG (and the mime type) for the caller to
// upload wherever it wants — see uploadImageToStorage in storage.ts.

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';

// Editorial-illustration brand prompt. Imagen routinely tries to write
// fake UK legal text, garbled receipt numbers and "STOCK PHOTO MODEL"
// captions on any object that resembles a document, chart, payslip,
// calendar or clock. The brand prompt repeats the no-text rule
// multiple ways (no letters / no numbers / no inscriptions / smooth
// unmarked surfaces) because experiments showed a single mention is
// not enough — Imagen will gladly emboss FAKE LATIN onto a "stylised
// scroll" prompt. The category subject map (blog-visual-brief.ts) also
// avoids text-prone nouns where possible.
const BRAND_PREFIX =
  'Premium UK fintech editorial illustration. ' +
  'Deep navy (#0f172a) background with mint green (#34d399) and warm amber (#f59e0b) accent lighting. ' +
  'Single bold metaphorical subject, centred, generous negative space, soft volumetric rim light, ' +
  'glossy 3D-render-meets-vector style — like a Stripe, Wise or Linear marketing illustration. ' +
  'Clean smooth surfaces. High contrast. Cinematic.';

const BRAND_SUFFIX =
  'CRITICAL — every surface in the image must be completely smooth and unmarked. ' +
  'No text. No words. No letters. No numbers. No digits. No dates. No symbols on objects. ' +
  'No signage. No labels. No price tags. No inscriptions. No documents-with-writing. ' +
  'No clock faces with numerals. No calendar grids. No charts with axes. No payslips. ' +
  'No screens displaying anything. No fake Latin. No garbled glyphs. No human faces. No people. ' +
  'Treat this exactly like a single vector-logo illustration where nothing is written on anything. ' +
  'Cinematic 16:9 landscape composition, eye-catching at small sizes.';

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

  // Retry up to 3 times on 429 / 503. Imagen's free tier is 10 req/min,
  // and the API returns a `retryDelay` (e.g. "34s") inside the JSON
  // payload — we honour it when present, otherwise back off 35s, 50s,
  // 65s. Total worst-case wait is ~2.5 minutes which still fits inside
  // Vercel's 300s maxDuration on the consuming routes.
  let res = await attempt();
  for (let i = 0; i < 3 && (res.status === 429 || res.status === 503); i++) {
    let delayMs = 35_000 + i * 15_000;
    try {
      const cloned = res.clone();
      const errBody = await cloned.json();
      const hint = errBody?.error?.details?.find((d: { '@type'?: string }) =>
        d?.['@type']?.includes('RetryInfo'),
      );
      const retryDelay = hint?.retryDelay as string | undefined;
      const m = retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
      if (m) delayMs = Math.ceil(parseFloat(m[1]) * 1000) + 1000;
    } catch {
      // fall through to default backoff
    }
    console.warn(`[generate-image] Imagen ${res.status} — retrying in ${Math.round(delayMs / 1000)}s (attempt ${i + 2}/4)`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
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
