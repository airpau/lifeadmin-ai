/**
 * Higgsfield text-to-image for the daily social post.
 *
 * Replaced fal.ai on 2026-08-23. Two reasons: the fal.ai account had been
 * locked ("User is locked. Reason: TOP_UP") so the cron silently produced
 * no image for days, and the flux/schnell output was not good enough to
 * publish under our own brand at 512px.
 *
 * The important structural difference is that Higgsfield is ASYNCHRONOUS.
 * The fal.ai call returned the image in one response. Here we submit, get
 * a request_id and a status_url back, and poll until a terminal state.
 *
 * Output URLs are retained by Higgsfield for about seven days, so the
 * caller MUST copy the bytes into our own storage. Do not persist a
 * platform.higgsfield.ai URL as asset_url.
 */

const SUBMIT_URL = 'https://platform.higgsfield.ai/higgsfield-ai/soul/standard';

/** Terminal request states, per the Higgsfield request lifecycle. */
const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 150_000;

/**
 * The locked house style.
 *
 * Everything before the caller's subject is fixed, and that is the whole
 * point. The old prompt let the model pick its own palette and framing per
 * post, which is why the feed had teal glows next to large orange washes
 * while the brand guidance in the caption prompt said navy and mint, never
 * gold or amber.
 *
 * "no text" is repeated deliberately. The 2026-04 posts contain rendered
 * gibberish ("Tela", "IBOT") inside a phone mockup because a single
 * negative clause was not enough. If a post still comes back with letters
 * in it, add to this list rather than editing per-post prompts.
 */
const HOUSE_STYLE = [
  'premium fintech brand photography',
  'deep navy blue background, near black',
  'single mint green accent light, cool tone only',
  'absolutely no orange, no amber, no gold, no warm colour cast',
  'centred symmetrical composition, generous negative space',
  'soft even studio lighting, subtle depth of field',
  'no text, no words, no letters, no numbers, no logos, no watermarks',
  'no user interface, no phone screens, no app mockups',
  'clean, calm, understated, editorial',
  'photorealistic, highly detailed',
].join(', ');

interface SubmitResponse {
  status?: string;
  request_id?: string;
  status_url?: string;
  error?: unknown;
}

interface StatusResponse {
  status?: string;
  images?: { url?: string }[];
  error?: unknown;
}

function authHeader(): string | null {
  const id = (process.env.HIGGSFIELD_API_KEY_ID || '').trim();
  const secret = (process.env.HIGGSFIELD_API_KEY_SECRET || '').trim();
  if (!id || !secret) return null;
  // Higgsfield uses "Key <id>:<secret>", not "Bearer <token>".
  return `Key ${id}:${secret}`;
}

/**
 * Generate one square brand image and return its (temporary) Higgsfield
 * URL, or null on any failure. Never throws: the caller decides what a
 * missing image means, and for the daily post it means abort.
 */
export async function generateHiggsfieldImage(
  subject: string,
): Promise<string | null> {
  const auth = authHeader();
  if (!auth) {
    console.error('[higgsfield] HIGGSFIELD_API_KEY_ID / _SECRET not set');
    return null;
  }

  const prompt = `${HOUSE_STYLE}, ${subject}`;

  let statusUrl: string;
  try {
    const res = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: '1:1',
        resolution: '1080p',
      }),
    });

    const data = (await res.json()) as SubmitResponse;

    if (!res.ok || !data.status_url) {
      console.error(
        `[higgsfield] submit failed ${res.status}:`,
        JSON.stringify(data).substring(0, 300),
      );
      return null;
    }

    // Use the URL the API handed back rather than building one from the
    // request_id. The docs are explicit about this.
    statusUrl = data.status_url;
  } catch (err: any) {
    console.error('[higgsfield] submit threw:', err?.message);
    return null;
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    let status: StatusResponse;
    try {
      const res = await fetch(statusUrl, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      status = (await res.json()) as StatusResponse;
    } catch (err: any) {
      // A single failed poll is not fatal. Keep trying until the deadline.
      console.warn('[higgsfield] poll threw, retrying:', err?.message);
      continue;
    }

    const state = status.status ?? '';
    if (!TERMINAL.has(state)) continue;

    if (state !== 'completed') {
      // 'nsfw' is worth calling out separately: it means moderation
      // rejected our own prompt, which is a prompt bug, not an outage.
      console.error(
        `[higgsfield] terminal state ${state}:`,
        JSON.stringify(status.error ?? {}).substring(0, 300),
      );
      return null;
    }

    const url = status.images?.[0]?.url;
    if (!url) {
      console.error('[higgsfield] completed with no image url');
      return null;
    }
    return url;
  }

  console.error('[higgsfield] timed out after 150s waiting for the image');
  return null;
}
