/**
 * Shared fetch helper for legal reference source URLs.
 *
 * Background: the verification crons used a bot User-Agent
 * ('Paybacker-LegalVerifier/1.0'). Ofcom's WAF blocks it with a 403. The
 * crons treated any non-ok response as "the page is gone", so 13 perfectly
 * live Ofcom pages accumulated 47 consecutive failures each and were
 * promoted to 'url_dead' — a status excluded from retrieval. The rules were
 * silently disabled in the product while the source pages were fine.
 *
 * Two fixes live here:
 *  1. Retry with a browser User-Agent when a polite bot UA is refused.
 *  2. Distinguish "blocked" (401/403/429) from "dead" (404/410). Only the
 *     latter should ever count towards the three-strike url_dead rule.
 */

/** Polite identifying UA. Tried first — most public-sector sites allow it. */
export const BOT_UA = 'Paybacker-LegalVerifier/1.0 (hello@paybacker.co.uk)';

/** Fallback UA for hosts whose WAF refuses unknown agents (e.g. Ofcom). */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Statuses that mean "we were refused", not "the page is gone". */
const BLOCKED_STATUSES = new Set([401, 403, 405, 429]);

/** Statuses that genuinely indicate the resource no longer exists. */
const DEAD_STATUSES = new Set([404, 410]);

export type SourceFetchOutcome = 'ok' | 'blocked' | 'dead' | 'error';

export interface SourceFetchResult {
  /** Response object when a request completed, else null. */
  response: Response | null;
  /** HTTP status, or null when the request never completed. */
  status: number | null;
  outcome: SourceFetchOutcome;
  /** Which UA produced the final result — useful in verification_notes. */
  userAgent: string | null;
  /** True when the failure should count towards the three-strike rule. */
  countsAsUrlFailure: boolean;
  /** Human-readable reason, safe to store in verification_notes. */
  reason: string;
}

function classify(status: number): SourceFetchOutcome {
  if (status >= 200 && status < 400) return 'ok';
  if (BLOCKED_STATUSES.has(status)) return 'blocked';
  if (DEAD_STATUSES.has(status)) return 'dead';
  // 5xx and anything else: transient server-side trouble, not a dead URL.
  return 'error';
}

async function attempt(
  url: string,
  userAgent: string,
  timeoutMs: number,
  accept?: string,
): Promise<{ response: Response | null; status: number | null }> {
  try {
    const headers: Record<string, string> = { 'User-Agent': userAgent };
    if (accept) headers.Accept = accept;
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { response, status: response.status };
  } catch {
    return { response: null, status: null };
  }
}

/**
 * Fetch a legal source URL, escalating from the bot UA to a browser UA if the
 * host refuses us. Only 404/410 are reported as genuinely dead.
 */
export async function fetchLegalSource(
  url: string,
  options: { timeoutMs?: number; accept?: string } = {},
): Promise<SourceFetchResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;

  let { response, status } = await attempt(url, BOT_UA, timeoutMs, options.accept);
  let userAgent: string | null = BOT_UA;
  let outcome: SourceFetchOutcome = status === null ? 'error' : classify(status);

  // Refused for who we say we are — try again as a browser before giving up.
  if (outcome === 'blocked') {
    const retry = await attempt(url, BROWSER_UA, timeoutMs, options.accept);
    if (retry.status !== null) {
      const retryOutcome = classify(retry.status);
      // Only take the retry if it actually improved matters.
      if (retryOutcome !== 'blocked') {
        response = retry.response;
        status = retry.status;
        outcome = retryOutcome;
        userAgent = BROWSER_UA;
      }
    }
  }

  const countsAsUrlFailure = outcome === 'dead';

  let reason: string;
  switch (outcome) {
    case 'ok':
      reason = `OK ${status} via ${userAgent === BROWSER_UA ? 'browser UA' : 'bot UA'}`;
      break;
    case 'blocked':
      reason =
        `Blocked by host (HTTP ${status}) with both bot and browser User-Agent. ` +
        `Not treated as a dead URL.`;
      break;
    case 'dead':
      reason = `Source URL returned ${status} — resource no longer exists.`;
      break;
    default:
      reason =
        status === null
          ? 'Network error or timeout contacting source. Not treated as a dead URL.'
          : `Transient HTTP ${status} from source. Not treated as a dead URL.`;
  }

  return { response, status, outcome, userAgent, countsAsUrlFailure, reason };
}
