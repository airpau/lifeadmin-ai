/**
 * Higgsfield image generation.
 *
 * Higgsfield replaced fal.ai as the default generator for automated social
 * imagery on 23 August 2026 (see CLAUDE.md, "CRITICAL ARCHITECTURE RULES").
 *
 * The API is asynchronous: a POST to the model endpoint returns a request_id
 * and a status_url, and the caller polls that URL until the request reaches a
 * terminal state. Contract per https://docs.higgsfield.ai/docs/concepts/requests
 *
 *   queued | in_progress            -> keep polling
 *   completed                       -> `images: [{ url }]`
 *   failed | nsfw | canceled        -> terminal, no output
 *
 * Output URLs are retained for at least seven days only, so every caller MUST
 * copy the bytes into our own storage rather than persisting a Higgsfield URL.
 */

const HF_BASE = 'https://platform.higgsfield.ai';

/** Flagship text-to-image model. Override per call if a cheaper one will do. */
export const HF_DEFAULT_MODEL = 'higgsfield-ai/soul/standard';

export type HiggsfieldImageOptions = {
  model?: string;
  /** e.g. '1:1', '4:3', '16:9', '9:16' */
  aspectRatio?: string;
  /** e.g. '720p', '1080p' */
  resolution?: string;
  /**
   * Total wall-clock budget for submit + poll, in ms.
   *
   * A real measured cycle on 23 Aug 2026 took ~2 minutes: roughly 90s sitting
   * in `queued` before generation even started, then ~35s `in_progress`. Any
   * budget under about 150s will therefore fail almost every time, so callers
   * must size their function's maxDuration around this, not the other way
   * round. A missed image degrades to a text-only post; a blown function
   * deadline kills the whole job.
   */
  timeoutMs?: number;
};

/**
 * Credentials come as a KEY_ID and a KEY_SECRET. Accepts either the split pair
 * or a single combined `id:secret` string, because that is the shape the keys
 * are issued and stored in.
 */
function resolveAuth(): string | null {
  const combined = (process.env.HIGGSFIELD_API_KEY || '').trim();
  const id = (process.env.HIGGSFIELD_API_KEY_ID || '').trim();
  const secret = (process.env.HIGGSFIELD_API_KEY_SECRET || '').trim();

  if (id && secret) return `Key ${id}:${secret}`;
  if (combined.includes(':')) return `Key ${combined}`;
  return null;
}

/** True when Higgsfield credentials are present. Lets callers pick a fallback. */
export function higgsfieldConfigured(): boolean {
  return resolveAuth() !== null;
}

type SubmitResponse = {
  status?: string;
  request_id?: string;
  status_url?: string;
  error?: unknown;
};

type StatusResponse = {
  status?: string;
  images?: Array<{ url?: string }>;
  error?: unknown;
};

/**
 * Generate one image and return its (temporary) Higgsfield URL.
 *
 * Returns null rather than throwing on any failure — every current caller
 * treats a missing image as "post without one", and an unattended cron should
 * degrade rather than crash.
 */
export async function generateImageHiggsfield(
  prompt: string,
  opts: HiggsfieldImageOptions = {},
): Promise<string | null> {
  const auth = resolveAuth();
  if (!auth) {
    console.error('[higgsfield] no credentials — set HIGGSFIELD_API_KEY_ID + HIGGSFIELD_API_KEY_SECRET');
    return null;
  }

  const {
    model = HF_DEFAULT_MODEL,
    aspectRatio = '1:1',
    resolution = '1080p',
    timeoutMs = 180_000,
  } = opts;

  const deadline = Date.now() + timeoutMs;

  try {
    const submitRes = await fetch(`${HF_BASE}/${model}`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, resolution }),
    });

    const submit = (await submitRes.json()) as SubmitResponse;

    if (!submitRes.ok || !submit.request_id) {
      console.error('[higgsfield] submit failed:', submitRes.status, JSON.stringify(submit).slice(0, 300));
      return null;
    }

    // Use the URL the API handed back rather than constructing one.
    const statusUrl = submit.status_url || `${HF_BASE}/requests/${submit.request_id}/status`;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3_000));

      const pollRes = await fetch(statusUrl, { headers: { Authorization: auth, Accept: 'application/json' } });
      const poll = (await pollRes.json()) as StatusResponse;

      switch (poll.status) {
        case 'completed': {
          const url = poll.images?.[0]?.url;
          if (!url) {
            console.error('[higgsfield] completed with no image url:', JSON.stringify(poll).slice(0, 300));
            return null;
          }
          return url;
        }
        case 'failed':
        case 'nsfw':
        case 'canceled':
          console.error(`[higgsfield] request ${submit.request_id} ended ${poll.status}:`, JSON.stringify(poll.error ?? {}).slice(0, 200));
          return null;
        default:
          // queued / in_progress — keep waiting
          break;
      }
    }

    console.error(`[higgsfield] timed out after ${timeoutMs}ms waiting on ${submit.request_id}`);
    return null;
  } catch (err: any) {
    console.error('[higgsfield] error:', err?.message);
    return null;
  }
}
