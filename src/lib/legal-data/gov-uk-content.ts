/**
 * src/lib/legal-data/gov-uk-content.ts
 *
 * Typed client for the GOV.UK Content API.
 * Docs: https://content-api.publishing.service.gov.uk/reference.html
 *
 * Why: regulator decisions surfaced by the CMA (and OIM/SAU) live on
 * gov.uk under the `cma_case` document type. There is no first-party
 * legislation feed for these — but each case has a stable JSON
 * representation at `https://www.gov.uk/api/content/{slug}` that we
 * can ingest into the discovery pipeline as candidate
 * `legal_references` rows tagged with `source_type='cma_case'`.
 *
 * Per `docs/legal-data-api-research-2026-05-01.md` §3, this is a
 * SECONDARY source — the primary engine is legislation.gov.uk for
 * statutes. We use this to enrich the regulator-decisions corner of
 * the dataset, not to replace anything.
 *
 * Output rights: gov.uk content is Crown Copyright, available under
 * the Open Government Licence v3.0. Callers MUST retain `web_url` for
 * attribution.
 *
 * Compliance: all results from this client flow through
 * `legal_ref_candidates` (discovery) — never auto-applied. The founder
 * approves before anything reaches `legal_references`.
 */

const HOST = 'https://www.gov.uk';
const SEARCH_HOST = 'https://www.gov.uk/api/search.json';
const CONTENT_HOST = 'https://www.gov.uk/api/content';

const USER_AGENT = 'paybacker-compliance-bot/1.0 (+https://paybacker.co.uk)';

/** Document type filter — see https://docs.publishing.service.gov.uk/document-types.html */
export type GovUkDocumentType =
  | 'cma_case'
  | 'cma_decision'
  | 'fca_handbook'
  | 'guidance'
  | 'detailed_guide';

export interface GovUkSearchHit {
  title: string;
  /** Slug-only path, e.g. "/cma-cases/example-case". */
  link: string;
  /** Full canonical URL on gov.uk. */
  webUrl: string;
  documentType: string | null;
  publicUpdatedAt: string | null;
  description: string | null;
  organisations: string[];
}

export interface GovUkContent {
  base_path: string;
  title: string;
  description: string | null;
  document_type: string;
  public_updated_at: string | null;
  first_published_at: string | null;
  /** Full URL `https://www.gov.uk{base_path}` for citation use. */
  web_url: string;
  /** Body text where present (gov.uk content has heterogeneous shapes). */
  body: string | null;
  /** Raw payload for callers needing fields the typed surface omits. */
  raw: unknown;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.warn('[gov-uk-content] fetch failed', url, (err as Error)?.message);
    return null;
  }
}

/**
 * Search gov.uk for documents of the given type matching `query`.
 *
 * @example
 *   await searchByDocumentType('payment protection insurance', {
 *     documentType: 'cma_case',
 *     limit: 20,
 *   });
 */
export async function searchByDocumentType(
  query: string,
  opts: {
    documentType: GovUkDocumentType;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<GovUkSearchHit[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
  const params = new URLSearchParams({
    q: query.trim(),
    count: String(limit),
    filter_document_type: opts.documentType,
    order: '-public_timestamp',
  });
  const url = `${SEARCH_HOST}?${params.toString()}`;
  const json = await getJson<{
    results?: Array<Record<string, unknown>>;
  }>(url, opts.signal);
  if (!json?.results) return [];
  return json.results
    .map((r): GovUkSearchHit | null => {
      const link = typeof r.link === 'string' ? r.link : null;
      const title = typeof r.title === 'string' ? r.title : null;
      if (!link || !title) return null;
      return {
        title,
        link,
        webUrl: link.startsWith('http') ? link : `${HOST}${link}`,
        documentType:
          typeof r.format === 'string'
            ? r.format
            : typeof r.document_type === 'string'
            ? r.document_type
            : null,
        publicUpdatedAt:
          typeof r.public_timestamp === 'string' ? r.public_timestamp : null,
        description:
          typeof r.description === 'string' ? r.description : null,
        organisations: Array.isArray(r.organisations)
          ? r.organisations
              .map((o: unknown) =>
                o && typeof o === 'object' && 'title' in o
                  ? String((o as { title?: unknown }).title ?? '')
                  : '',
              )
              .filter(Boolean)
          : [],
      };
    })
    .filter((x): x is GovUkSearchHit => x !== null);
}

/**
 * Fetch a specific gov.uk content item by base_path. Accepts a slug
 * ("/cma-cases/example") or a full URL — both yield the same lookup.
 */
export async function fetchContent(
  basePathOrUrl: string,
  opts: { signal?: AbortSignal } = {},
): Promise<GovUkContent | null> {
  if (!basePathOrUrl) return null;
  let basePath = basePathOrUrl;
  try {
    if (basePath.startsWith('http')) {
      const u = new URL(basePath);
      if (!u.hostname.endsWith('gov.uk')) return null;
      basePath = u.pathname;
    }
  } catch {
    return null;
  }
  if (!basePath.startsWith('/')) basePath = `/${basePath}`;
  const url = `${CONTENT_HOST}${basePath}`;
  const json = await getJson<Record<string, unknown>>(url, opts.signal);
  if (!json) return null;

  const documentType =
    typeof json.document_type === 'string' ? json.document_type : '';
  const title = typeof json.title === 'string' ? json.title : '';
  if (!documentType || !title) return null;

  const description =
    typeof json.description === 'string' ? json.description : null;
  const publicUpdatedAt =
    typeof json.public_updated_at === 'string'
      ? json.public_updated_at
      : null;
  const firstPublishedAt =
    typeof json.first_published_at === 'string'
      ? json.first_published_at
      : null;

  // Detail body lives at details.body (HTML) for most document types.
  const details = (json.details as Record<string, unknown> | undefined) ?? {};
  const body =
    typeof details.body === 'string'
      ? details.body
      : Array.isArray(details.body)
      ? (details.body
          .map((b) =>
            typeof b === 'object' && b && 'content' in b
              ? String((b as { content?: unknown }).content ?? '')
              : '',
          )
          .filter(Boolean)
          .join('\n') || null)
      : null;

  return {
    base_path: basePath,
    title,
    description,
    document_type: documentType,
    public_updated_at: publicUpdatedAt,
    first_published_at: firstPublishedAt,
    web_url: `${HOST}${basePath}`,
    body,
    raw: json,
  };
}

/**
 * Discovery convenience: returns CMA cases matching `query`, hydrated
 * to full content. Caps the network fan-out at `limit` so the cron
 * leg stays cheap even when the search returns hundreds of hits.
 */
export async function discoverCmaCases(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<Array<GovUkSearchHit & { content: GovUkContent | null }>> {
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 25));
  const hits = await searchByDocumentType(query, {
    documentType: 'cma_case',
    limit,
    signal: opts.signal,
  });
  // Hydrate sequentially — gov.uk is generous but we don't want to
  // burst with 25 parallel calls from a Vercel function. Truncate
  // again to `limit` here in case the upstream search returns more
  // than the requested count (rare, but the API is permissive).
  const out: Array<GovUkSearchHit & { content: GovUkContent | null }> = [];
  for (const hit of hits.slice(0, limit)) {
    const content = await fetchContent(hit.link, { signal: opts.signal });
    out.push({ ...hit, content });
  }
  return out;
}

/** True when the given URL is on gov.uk (any subpath). */
export function isGovUkUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === 'www.gov.uk' || u.hostname === 'gov.uk';
  } catch {
    return false;
  }
}
