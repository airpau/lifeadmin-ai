// src/lib/yapily.test.ts
//
// Unit tests for the Yapily helpers. Run with Node's built-in test
// runner (same pattern as src/lib/category-taxonomy.test.ts):
//
//   node --experimental-strip-types --test src/lib/yapily.test.ts
//
// We mock globalThis.fetch per-test so we can assert on the request
// shape (URL, headers, body) and shape the response. Yapily is never
// hit during tests.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHostedConsentRequest,
  getHostedConsentRequest,
  deleteConsent,
  isHostedPagesEnabled,
  classifyYapilyError,
  isRetryableYapilyStatus,
  isUnsupportedFeatureError,
  reconfirmConsent,
  getAllTransactions,
} from './yapily.ts';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let originalFetch: typeof fetch;
let originalUuid: string | undefined;
let originalSecret: string | undefined;
let recorded: RecordedCall[] = [];

function setEnvFor(testCase: () => void): void {
  process.env.YAPILY_APPLICATION_UUID = 'test-uuid';
  process.env.YAPILY_APPLICATION_SECRET = 'test-secret';
  testCase();
}

function mockFetch(
  status: number,
  body: unknown,
): typeof fetch {
  return (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    let parsedBody: unknown;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    const headersObj: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const k of Object.keys(h)) headersObj[k] = h[k];
    }
    recorded.push({
      url,
      method: (init?.method as string) || 'GET',
      headers: headersObj,
      body: parsedBody,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalUuid = process.env.YAPILY_APPLICATION_UUID;
  originalSecret = process.env.YAPILY_APPLICATION_SECRET;
  recorded = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUuid !== undefined) process.env.YAPILY_APPLICATION_UUID = originalUuid;
  else delete process.env.YAPILY_APPLICATION_UUID;
  if (originalSecret !== undefined) process.env.YAPILY_APPLICATION_SECRET = originalSecret;
  else delete process.env.YAPILY_APPLICATION_SECRET;
});

describe('isHostedPagesEnabled', () => {
  const originalFlag = process.env.YAPILY_HOSTED_PAGES_ENABLED;

  it('returns false when the flag is absent', () => {
    delete process.env.YAPILY_HOSTED_PAGES_ENABLED;
    assert.equal(isHostedPagesEnabled(), false);
  });

  it('returns false for arbitrary non-true values', () => {
    process.env.YAPILY_HOSTED_PAGES_ENABLED = 'yes';
    assert.equal(isHostedPagesEnabled(), false);
    process.env.YAPILY_HOSTED_PAGES_ENABLED = '1';
    assert.equal(isHostedPagesEnabled(), false);
  });

  it('returns true only for the exact string "true" (case-insensitive)', () => {
    process.env.YAPILY_HOSTED_PAGES_ENABLED = 'true';
    assert.equal(isHostedPagesEnabled(), true);
    process.env.YAPILY_HOSTED_PAGES_ENABLED = 'TRUE';
    assert.equal(isHostedPagesEnabled(), true);
  });

  if (originalFlag === undefined) delete process.env.YAPILY_HOSTED_PAGES_ENABLED;
  else process.env.YAPILY_HOSTED_PAGES_ENABLED = originalFlag;
});

describe('createHostedConsentRequest', () => {
  it('POSTs the canonical Hosted Pages body shape', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      meta: { tracingId: 't-1' },
      data: {
        consentRequestId: 'consent-req-123',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionId: 'natwest', institutionCountryCode: 'GB' },
        createdAt: '2026-04-29T10:00:00Z',
        hostedUrl: 'https://hosted.yapily.com/abc',
      },
    });

    const result = await createHostedConsentRequest({
      applicationUserId: 'user-abc',
      redirectUrl: 'https://paybacker.co.uk/api/yapily/callback?state=xx',
      institutionCountryCode: 'GB',
      institutionId: 'natwest',
      language: 'EN',
      location: 'GB',
    });

    assert.equal(result.consentRequestId, 'consent-req-123');
    assert.equal(result.hostedUrl, 'https://hosted.yapily.com/abc');
    assert.equal(recorded.length, 1);
    const call = recorded[0]!;
    assert.equal(call.method, 'POST');
    assert.match(call.url, /\/hosted\/consent-requests$/);
    assert.match(call.headers['Authorization'] ?? '', /^Basic /);
    const body = call.body as Record<string, unknown>;
    assert.equal(body.redirectUrl, 'https://paybacker.co.uk/api/yapily/callback?state=xx');
    assert.equal(body.applicationUserId, 'user-abc');
    assert.deepEqual(body.institutionIdentifiers, {
      institutionCountryCode: 'GB',
      institutionId: 'natwest',
    });
    assert.deepEqual(body.userSettings, { language: 'EN', location: 'GB' });
  });

  it('omits institutionId when not provided (lets Yapily render bank-picker)', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      data: {
        consentRequestId: 'consent-req-456',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionCountryCode: 'GB' },
        createdAt: '2026-04-29T10:00:00Z',
        hostedUrl: 'https://hosted.yapily.com/def',
      },
    });

    await createHostedConsentRequest({
      applicationUserId: 'user-abc',
      redirectUrl: 'https://paybacker.co.uk/api/yapily/callback',
      institutionCountryCode: 'GB',
    });

    const body = recorded[0]!.body as Record<string, unknown>;
    assert.deepEqual(body.institutionIdentifiers, { institutionCountryCode: 'GB' });
  });

  it('defaults language=EN and location=GB when caller omits them', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      data: {
        consentRequestId: 'consent-req-789',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionId: 'hsbc', institutionCountryCode: 'GB' },
        createdAt: '2026-04-29T10:00:00Z',
        hostedUrl: 'https://hosted.yapily.com/ghi',
      },
    });

    await createHostedConsentRequest({
      applicationUserId: 'user-abc',
      redirectUrl: 'https://paybacker.co.uk/api/yapily/callback',
      institutionCountryCode: 'GB',
      institutionId: 'hsbc',
    });

    const body = recorded[0]!.body as Record<string, unknown>;
    assert.deepEqual(body.userSettings, { language: 'EN', location: 'GB' });
  });

  it('passes featureScope through accountRequest, not at the top level', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      data: {
        consentRequestId: 'consent-req-fs',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionId: 'natwest', institutionCountryCode: 'GB' },
        createdAt: '2026-04-29T10:00:00Z',
        hostedUrl: 'https://hosted.yapily.com/jkl',
      },
    });

    await createHostedConsentRequest({
      applicationUserId: 'user-abc',
      redirectUrl: 'https://paybacker.co.uk/api/yapily/callback',
      institutionCountryCode: 'GB',
      institutionId: 'natwest',
      featureScope: ['ACCOUNT_DIRECT_DEBITS', 'ACCOUNT_PERIODIC_PAYMENTS'],
    });

    const body = recorded[0]!.body as Record<string, unknown>;
    // Top-level featureScope is NOT in the OpenAPI — it lives inside
    // accountRequest, which is mirrored back as accountRequestDetails
    // on the response.
    assert.equal('featureScope' in body, false);
    assert.deepEqual(
      (body.accountRequest as Record<string, unknown>).featureScope,
      ['ACCOUNT_DIRECT_DEBITS', 'ACCOUNT_PERIODIC_PAYMENTS'],
    );
  });

  it('omits accountRequest entirely when no scopes / dates are passed', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      data: {
        consentRequestId: 'consent-req-noar',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionCountryCode: 'GB' },
        createdAt: '2026-04-29T10:00:00Z',
        hostedUrl: 'https://hosted.yapily.com/mno',
      },
    });

    await createHostedConsentRequest({
      applicationUserId: 'user-abc',
      redirectUrl: 'https://paybacker.co.uk/api/yapily/callback',
      institutionCountryCode: 'GB',
    });

    const body = recorded[0]!.body as Record<string, unknown>;
    assert.equal('accountRequest' in body, false);
  });

  it('throws when Yapily returns a 200 with no hostedUrl', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      data: {
        consentRequestId: 'consent-req-bad',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionId: 'natwest', institutionCountryCode: 'GB' },
        createdAt: '2026-04-29T10:00:00Z',
      },
    });

    await assert.rejects(
      () =>
        createHostedConsentRequest({
          applicationUserId: 'user-abc',
          redirectUrl: 'https://paybacker.co.uk/api/yapily/callback',
          institutionCountryCode: 'GB',
        }),
      /hostedUrl/,
    );
  });

  it('surfaces Yapily error messages on non-2xx', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(400, {
      error: {
        code: 400,
        status: 'Bad Request',
        message: 'institutionCountryCode is required',
      },
    });

    await assert.rejects(
      () =>
        createHostedConsentRequest({
          applicationUserId: 'user-abc',
          redirectUrl: 'https://paybacker.co.uk/api/yapily/callback',
          institutionCountryCode: '',
        }),
      /institutionCountryCode is required/,
    );
  });
});

describe('getHostedConsentRequest', () => {
  it('GETs /hosted/consent-requests/{id} and returns the consent record', async () => {
    setEnvFor(() => {});
    // Per Yapily OpenAPI 12.3.4: AUTHORIZED responses surface
    // consentRequestId, consentId (used by /account-auth-requests/{id}),
    // and consentToken (used as the data-call header).
    globalThis.fetch = mockFetch(200, {
      data: {
        consentRequestId: 'consent-req-123',
        consentId: 'b22a1fe6-1e91-45b3-8ba0-6fdb1708e7bd',
        applicationUserId: 'user-abc',
        institutionIdentifiers: { institutionId: 'natwest', institutionCountryCode: 'GB' },
        status: 'AUTHORIZED',
        createdAt: '2026-04-29T10:00:00Z',
        consentToken: 'eyJjb25zZW50dG9rZW4iLi4u',
      },
    });

    const result = await getHostedConsentRequest('consent-req-123');

    assert.equal(result.consentRequestId, 'consent-req-123');
    assert.equal(result.consentId, 'b22a1fe6-1e91-45b3-8ba0-6fdb1708e7bd');
    assert.equal(result.status, 'AUTHORIZED');
    assert.equal(result.consentToken, 'eyJjb25zZW50dG9rZW4iLi4u');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.method, 'GET');
    assert.match(recorded[0]!.url, /\/hosted\/consent-requests\/consent-req-123$/);
  });

  it('surfaces error message on non-2xx (e.g. expired hostedUrl)', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(404, {
      error: {
        code: 404,
        status: 'Not Found',
        message: 'consent request not found',
      },
    });

    await assert.rejects(
      () => getHostedConsentRequest('missing-id'),
      /consent request not found/,
    );
  });
});

describe('deleteConsent', () => {
  it('DELETEs /consents/{id}', async () => {
    setEnvFor(() => {});
    // Yapily returns 200 on a successful delete in the API; we test
    // both that and the 404-already-gone path below. A test using 204
    // wouldn't work — the global Response constructor refuses a 204
    // with a body, which the mockFetch helper always emits.
    globalThis.fetch = mockFetch(200, {});

    await deleteConsent('consent-abc');

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.method, 'DELETE');
    assert.match(recorded[0]!.url, /\/consents\/consent-abc$/);
    assert.match(recorded[0]!.headers['Authorization'] ?? '', /^Basic /);
  });

  it('treats 404 as success (consent already gone)', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(404, {
      error: { code: 404, status: 'Not Found', message: 'gone' },
    });

    // No throw — Yapily-side absence IS the desired end state.
    await deleteConsent('consent-already-gone');
  });

  it('throws on other non-2xx responses', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(500, {
      error: { code: 500, status: 'Internal Server Error', message: 'boom' },
    });

    await assert.rejects(
      () => deleteConsent('consent-broken'),
      /boom|delete-consent error/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Error-class coverage (Yapily build review, test step 7)
//
// The build review asks for "at least one simulated example per error
// class" and "coverage of all HTTP response codes". Before these tests
// the suite exercised only 400, 404 and 500 — 401, 403, 409 and 429 had
// no coverage at all, and the client had no differentiated behaviour for
// them either.
//
// These tests pin down two things: the CLASSIFICATION (what kind of
// problem is this) and the BEHAVIOUR (do we retry, and do we honour
// Retry-After). The behavioural half matters most — an integration that
// hammers a 429 is exactly what Yapily rate-limits applications for.
// ─────────────────────────────────────────────────────────────────────

/**
 * Like mockFetch but returns a different status on the first N calls,
 * then 200 — so we can prove the retry loop actually retries and
 * eventually succeeds. Also counts calls.
 */
function mockFetchFailingThenOk(
  failStatus: number,
  failTimes: number,
  okBody: unknown,
  extraHeaders: Record<string, string> = {},
): { fetch: typeof fetch; calls: () => number } {
  let callCount = 0;
  const f = (async (input: FetchInput, init?: FetchInit) => {
    callCount++;
    const url = typeof input === 'string' ? input : input.toString();
    recorded.push({
      url,
      method: (init?.method as string) || 'GET',
      headers: {},
      body: undefined,
    });
    if (callCount <= failTimes) {
      return new Response(
        JSON.stringify({
          error: { code: failStatus, status: 'Error', message: 'transient' },
        }),
        {
          status: failStatus,
          headers: { 'content-type': 'application/json', ...extraHeaders },
        },
      );
    }
    return new Response(JSON.stringify(okBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: f, calls: () => callCount };
}

describe('classifyYapilyError', () => {
  const cases: Array<[number, string]> = [
    [400, 'bad_request'],
    [422, 'bad_request'],
    [401, 'auth'],
    [403, 'consent'],
    [404, 'not_found'],
    [409, 'conflict'],
    [429, 'rate_limit'],
    // 424/501 mean "this bank does not implement this endpoint".
    // 501 is deliberately checked BEFORE the generic 5xx branch — it
    // used to fall through to 'server' and get retried three times per
    // account per run against a bank that would never support it.
    [424, 'unsupported'],
    [501, 'unsupported'],
    [500, 'server'],
    [503, 'server'],
  ];

  for (const [status, expected] of cases) {
    it(`classifies ${status} as ${expected}`, () => {
      const err = Object.assign(new Error('x'), { status });
      assert.equal(classifyYapilyError(err), expected);
    });
  }

  it('returns unknown for a non-HTTP error', () => {
    assert.equal(classifyYapilyError(new Error('network down')), 'unknown');
  });

  it('marks only 429 and 5xx as retryable', () => {
    assert.equal(isRetryableYapilyStatus(429), true);
    assert.equal(isRetryableYapilyStatus(500), true);
    assert.equal(isRetryableYapilyStatus(503), true);
    assert.equal(isRetryableYapilyStatus(400), false);
    assert.equal(isRetryableYapilyStatus(401), false);
    assert.equal(isRetryableYapilyStatus(403), false);
    assert.equal(isRetryableYapilyStatus(409), false);
  });

  it('never retries an unsupported-feature status, including 501', () => {
    // The regression this guards: 501 satisfies `status >= 500`, so the
    // original predicate treated a permanently unimplemented bank
    // endpoint as a transient Yapily outage.
    assert.equal(isRetryableYapilyStatus(424), false);
    assert.equal(isRetryableYapilyStatus(501), false);
  });

  it('identifies unsupported-feature errors by status', () => {
    assert.equal(isUnsupportedFeatureError(Object.assign(new Error('x'), { status: 424 })), true);
    assert.equal(isUnsupportedFeatureError(Object.assign(new Error('x'), { status: 501 })), true);
    assert.equal(isUnsupportedFeatureError(Object.assign(new Error('x'), { status: 500 })), false);
    assert.equal(isUnsupportedFeatureError(new Error('network down')), false);
  });
});

describe('reconfirmConsent (POST /consents/{id}/extend)', () => {
  it('sends the mandatory lastConfirmedAt field', async () => {
    // The bug this locks down: until 2026-08-21 this call sent NO body
    // at all. lastConfirmedAt is required by ExtendConsentRequest, so
    // every 90-day renewal returned 400 and the user was told to
    // disconnect and reconnect their bank.
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, {
      data: {
        id: 'consent-1',
        status: 'AUTHORIZED',
        lastConfirmedAt: '2026-08-21T10:00:00.000Z',
        reconfirmBy: '2026-11-19T10:00:00.000Z',
      },
    });

    await reconfirmConsent('consent-1');

    const call = recorded[0]!;
    assert.equal(call.method, 'POST');
    assert.match(call.url, /\/consents\/consent-1\/extend$/);
    const body = call.body as Record<string, unknown>;
    assert.equal(typeof body.lastConfirmedAt, 'string');
  });

  it('never sends a future lastConfirmedAt', async () => {
    // Yapily rejects a future timestamp with
    // "lastConfirmedAt cannot be a future date and time". A few seconds
    // of clock skew between Vercel and Yapily is enough to trip that on
    // a bare new Date(), so the value is back-dated.
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(200, { data: { id: 'consent-2' } });

    const before = Date.now();
    // Pass an explicitly future date — it must still be clamped.
    await reconfirmConsent('consent-2', new Date(before + 60 * 60 * 1000));

    const body = recorded[0]!.body as Record<string, unknown>;
    const sent = Date.parse(body.lastConfirmedAt as string);
    assert.ok(Number.isFinite(sent), 'lastConfirmedAt must parse as a date');
    assert.ok(sent < before, `expected a back-dated timestamp, got ${body.lastConfirmedAt}`);
  });
});

describe('error handling per class', () => {
  it('401: surfaces an auth error and attaches status + class', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(401, {
      error: { code: 401, status: 'Unauthorized', message: 'invalid credentials' },
    });

    await assert.rejects(
      () => getHostedConsentRequest('consent-req-401'),
      (err: Error & { status?: number; errorClass?: string }) => {
        assert.equal(err.status, 401);
        assert.equal(err.errorClass, 'auth');
        assert.match(err.message, /invalid credentials/);
        return true;
      },
    );
    // Never retried — a bad credential retried is a bad credential.
    assert.equal(recorded.length, 1);
  });

  it('403: classified as a consent problem, not retried', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(403, {
      error: { code: 403, status: 'Forbidden', message: 'insufficient_rights' },
    });

    await assert.rejects(
      () => getHostedConsentRequest('consent-req-403'),
      (err: Error & { status?: number; errorClass?: string }) => {
        assert.equal(err.status, 403);
        assert.equal(err.errorClass, 'consent');
        return true;
      },
    );
    assert.equal(recorded.length, 1);
  });

  it('409: classified as a conflict, not retried', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockFetch(409, {
      error: { code: 409, status: 'Conflict', message: 'consent already exists' },
    });

    await assert.rejects(
      () => getHostedConsentRequest('consent-req-409'),
      (err: Error & { status?: number; errorClass?: string }) => {
        assert.equal(err.status, 409);
        assert.equal(err.errorClass, 'conflict');
        return true;
      },
    );
    assert.equal(recorded.length, 1);
  });

  it('429: backs off and retries, then succeeds', async () => {
    setEnvFor(() => {});
    const m = mockFetchFailingThenOk(
      429,
      1,
      { data: { consentRequestId: 'consent-req-429', status: 'AUTHORIZED' } },
      // 0 seconds so the test doesn't actually sleep.
      { 'Retry-After': '0' },
    );
    globalThis.fetch = m.fetch;

    const result = await getHostedConsentRequest('consent-req-429');
    assert.equal(result.consentRequestId, 'consent-req-429');
    // One rejected call + one successful retry.
    assert.equal(m.calls(), 2);
  });

  it('429: gives up after the retry budget and surfaces rate_limit', async () => {
    setEnvFor(() => {});
    // Fails more times than MAX_RETRIES allows.
    const m = mockFetchFailingThenOk(429, 99, {}, { 'Retry-After': '0' });
    globalThis.fetch = m.fetch;

    await assert.rejects(
      () => getHostedConsentRequest('consent-req-429-hard'),
      (err: Error & { status?: number; errorClass?: string }) => {
        assert.equal(err.status, 429);
        assert.equal(err.errorClass, 'rate_limit');
        return true;
      },
    );
    // Initial attempt + MAX_RETRIES (2) = 3 total.
    assert.equal(m.calls(), 3);
  });

  it('500: retries a transient server error and recovers', async () => {
    setEnvFor(() => {});
    const m = mockFetchFailingThenOk(500, 1, {
      data: { consentRequestId: 'consent-req-500', status: 'AUTHORIZED' },
    });
    globalThis.fetch = m.fetch;

    const result = await getHostedConsentRequest('consent-req-500');
    assert.equal(result.consentRequestId, 'consent-req-500');
    assert.equal(m.calls(), 2);
  });

  it('400: never retried — the request itself is the problem', async () => {
    setEnvFor(() => {});
    const m = mockFetchFailingThenOk(400, 99, {});
    globalThis.fetch = m.fetch;

    await assert.rejects(() => getHostedConsentRequest('consent-req-400'));
    assert.equal(m.calls(), 1);
  });

  it('captures tracingId from the response header when the body has none', async () => {
    setEnvFor(() => {});
    globalThis.fetch = (async () =>
      new Response('not json', {
        status: 500,
        headers: { 'Tracing-Id': 'trace-from-header-123' },
      })) as typeof fetch;

    await assert.rejects(
      () => getHostedConsentRequest('consent-req-trace'),
      (err: Error & { tracingId?: string }) => {
        assert.equal(err.tracingId, 'trace-from-header-123');
        assert.match(err.message, /trace-from-header-123/);
        return true;
      },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Build review step 11 — transaction pagination
//
// These cover the walk in getAllTransactions: the `from` / `before`
// window, the timestamp cursor, and the offset continuation that takes
// over when a full page shares a single timestamp (the date-only
// precision case common to UK banks, and the exact truncation class
// behind the 2026-05-15 zero-transaction incident).
// ─────────────────────────────────────────────────────────────────────

/** Queue a series of page responses, one per sequential fetch call. */
function mockPagedFetch(pages: Array<{ status?: number; body: unknown }>): typeof fetch {
  let i = 0;
  return (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    recorded.push({
      url,
      method: (init?.method as string) || 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: undefined,
    });
    const page = pages[Math.min(i, pages.length - 1)];
    i++;
    return new Response(JSON.stringify(page.body), {
      status: page.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

const tx = (id: string, dt: string) => ({ id, bookingDateTime: dt, date: dt });

describe('getAllTransactions — windowing (step 11)', () => {
  it('sends from and before as the time-range parameters', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([{ body: { data: [] } }]);

    await getAllTransactions('acc-1', 'consent-token', {
      from: '2026-05-01T00:00:00Z',
      before: '2026-08-01T00:00:00Z',
    });

    const url = new URL(recorded[0].url);
    assert.equal(url.searchParams.get('from'), '2026-05-01T00:00:00Z');
    assert.equal(url.searchParams.get('before'), '2026-08-01T00:00:00Z');
    assert.equal(recorded[0].headers.consent, 'consent-token');
  });

  it('mirrors the legacy `to` alias onto `before`', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([{ body: { data: [] } }]);

    await getAllTransactions('acc-1', 'consent-token', { to: '2026-08-01T00:00:00Z' });

    assert.equal(new URL(recorded[0].url).searchParams.get('before'), '2026-08-01T00:00:00Z');
  });

  it('does not send an offset param on the default timestamp cursor', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([
      { body: { data: [tx('a', '2026-07-10T00:00:00Z')] } },
    ]);

    await getAllTransactions('acc-1', 'consent-token', { limit: 2 });

    assert.equal(new URL(recorded[0].url).searchParams.get('offset'), null);
  });
});

describe('getAllTransactions — timestamp cursor (step 11)', () => {
  it('walks `before` backwards and stops when a short page arrives', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          data: [tx('a', '2026-07-10T00:00:00Z'), tx('b', '2026-07-09T00:00:00Z')],
          meta: { pagination: { self: { limit: 2, offset: 0 }, next: { limit: 2, offset: 2 } } },
        },
      },
      { body: { data: [tx('c', '2026-07-08T00:00:00Z')], meta: { pagination: { self: { limit: 2, offset: 2 } } } } },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token', { limit: 2 });

    assert.equal(recorded.length, 2);
    // Second page continues strictly older than the earliest row of page 1.
    assert.equal(new URL(recorded[1].url).searchParams.get('before'), '2026-07-09T00:00:00Z');
    assert.deepEqual(out.map((t) => t.id), ['a', 'b', 'c']);
  });

  it('de-duplicates a row repeated at the cursor boundary', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          data: [tx('a', '2026-07-10T00:00:00Z'), tx('b', '2026-07-09T00:00:00Z')],
          meta: { pagination: { self: { limit: 2, offset: 0 }, next: { limit: 2, offset: 2 } } },
        },
      },
      // Yapily re-includes `b` at the boundary.
      { body: { data: [tx('b', '2026-07-09T00:00:00Z')], meta: { pagination: { self: { limit: 2, offset: 2 } } } } },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token', { limit: 2 });

    assert.deepEqual(out.map((t) => t.id), ['a', 'b']);
  });

  it('stops once the page is entirely older than `from`', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          data: [tx('a', '2026-07-10T00:00:00Z'), tx('b', '2026-05-01T00:00:00Z')],
          meta: { pagination: { self: { limit: 2, offset: 0 }, next: { limit: 2, offset: 2 } } },
        },
      },
      { body: { data: [tx('z', '2026-01-01T00:00:00Z')] } },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token', {
      from: '2026-06-01T00:00:00Z',
      limit: 2,
    });

    assert.equal(recorded.length, 1, 'should not request a page entirely below `from`');
    assert.deepEqual(out.map((t) => t.id), ['a', 'b']);
  });

  it('honours the server-applied page size over the requested limit', async () => {
    setEnvFor(() => {});
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          // Asked for 1000, Yapily clamped to 2. A `data.length < requested`
          // stop condition would have ended the walk here.
          data: [tx('a', '2026-07-10T00:00:00Z'), tx('b', '2026-07-09T00:00:00Z')],
          meta: { pagination: { self: { limit: 2, offset: 0 }, next: { limit: 2, offset: 2 } } },
        },
      },
      { body: { data: [tx('c', '2026-07-08T00:00:00Z')], meta: { pagination: { self: { limit: 2, offset: 2 } } } } },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token');

    assert.equal(recorded.length, 2, 'clamped page size must not stop the walk');
    assert.deepEqual(out.map((t) => t.id), ['a', 'b', 'c']);
  });
});

describe('getAllTransactions — offset continuation (step 11)', () => {
  it('follows next.offset when a full page shares one timestamp', async () => {
    setEnvFor(() => {});
    const sameDay = '2026-07-10T00:00:00Z';
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          data: [tx('a', sameDay), tx('b', sameDay)],
          meta: { pagination: { self: { limit: 2, offset: 0 }, next: { limit: 2, offset: 2 } } },
        },
      },
      {
        body: {
          data: [tx('c', sameDay), tx('d', sameDay)],
          meta: { pagination: { self: { limit: 2, offset: 2 }, next: { limit: 2, offset: 4 } } },
        },
      },
      { body: { data: [tx('e', '2026-07-09T00:00:00Z')], meta: { pagination: { self: { limit: 2, offset: 4 } } } } },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token', { limit: 2 });

    assert.equal(new URL(recorded[1].url).searchParams.get('offset'), '2');
    assert.equal(new URL(recorded[2].url).searchParams.get('offset'), '4');
    assert.deepEqual(
      out.map((t) => t.id),
      ['a', 'b', 'c', 'd', 'e'],
      'rows behind the shared timestamp must not be dropped',
    );
  });

  it('stops when the offset does not advance', async () => {
    setEnvFor(() => {});
    const sameDay = '2026-07-10T00:00:00Z';
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          data: [tx('a', sameDay), tx('b', sameDay)],
          meta: { pagination: { self: { limit: 2, offset: 0 }, next: { limit: 2, offset: 2 } } },
        },
      },
      {
        body: {
          // Same offset echoed back — must not loop forever.
          data: [tx('c', sameDay), tx('d', sameDay)],
          meta: { pagination: { self: { limit: 2, offset: 2 }, next: { limit: 2, offset: 2 } } },
        },
      },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token', { limit: 2 });

    assert.equal(recorded.length, 2);
    assert.deepEqual(out.map((t) => t.id), ['a', 'b', 'c', 'd']);
  });

  it('stops safely when a shared-timestamp page has no next.offset', async () => {
    setEnvFor(() => {});
    const sameDay = '2026-07-10T00:00:00Z';
    globalThis.fetch = mockPagedFetch([
      {
        body: {
          data: [tx('a', sameDay), tx('b', sameDay)],
          meta: { pagination: { self: { limit: 2, offset: 0 } } },
        },
      },
    ]);

    const out = await getAllTransactions('acc-1', 'consent-token', { limit: 2 });

    assert.equal(recorded.length, 1);
    assert.deepEqual(out.map((t) => t.id), ['a', 'b']);
  });
});
