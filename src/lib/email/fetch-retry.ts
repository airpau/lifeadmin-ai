/**
 * fetch() with retry for the Gmail and Microsoft Graph scan paths.
 *
 * Retries 429 and 5xx (and network errors) with exponential backoff and
 * full jitter, honouring Retry-After when the server sends one. Anything
 * else (2xx, 3xx, 4xx other than 429) is returned to the caller on the
 * first attempt so existing status handling (401/403/404) is unchanged.
 *
 * Kept deliberately small: the scan routes run inside a Vercel function
 * with a hard time limit, so the total wait is capped (maxTotalWaitMs)
 * and a single Retry-After is never allowed to exceed maxDelayMs.
 */

export interface RetryOptions {
  /** Retries after the first attempt. Default 3 (so up to 4 requests). */
  retries?: number;
  /** First backoff step in ms. Default 500. */
  baseDelayMs?: number;
  /** Cap for any single wait, including Retry-After. Default 8000. */
  maxDelayMs?: number;
  /** Cap for the sum of all waits in one call. Default 20000. */
  maxTotalWaitMs?: number;
  /** Label for logs. */
  label?: string;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  /** Injected for tests. Returns [0, 1). */
  random?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Parse Retry-After (delta seconds or HTTP date) into ms, or null. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Math.round(parseFloat(trimmed) * 1000));
  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return null;
}

export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const maxDelay = opts.maxDelayMs ?? 8000;
  const maxTotal = opts.maxTotalWaitMs ?? 20_000;
  const sleep = opts.sleep ?? defaultSleep;
  const doFetch = opts.fetchImpl ?? fetch;
  const random = opts.random ?? Math.random;
  const label = opts.label ?? 'fetch';

  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let networkErr: unknown = null;
    try {
      res = await doFetch(input, init);
    } catch (err) {
      networkErr = err;
    }

    const retryable = res ? isRetryableStatus(res.status) : true;
    if (!retryable) return res as Response;
    if (attempt >= retries) {
      if (res) return res;
      throw networkErr;
    }

    const backoff = Math.min(maxDelay, base * 2 ** attempt);
    const jittered = Math.round(random() * backoff); // full jitter
    const retryAfter = res ? parseRetryAfter(res.headers.get('retry-after')) : null;
    const delay = Math.min(maxDelay, retryAfter !== null ? Math.max(retryAfter, jittered) : Math.max(jittered, 50));

    if (waited + delay > maxTotal) {
      if (res) return res;
      throw networkErr;
    }
    waited += delay;
    console.warn(
      `[${label}] ${res ? `HTTP ${res.status}` : 'network error'}, retry ${attempt + 1}/${retries} in ${delay}ms`,
    );
    // Free the socket before sleeping.
    if (res) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
    }
    await sleep(delay);
  }
}

/**
 * Run async tasks with at most `limit` in flight. Results keep input
 * order. Used to replace Promise.all bursts against Gmail and Graph.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
