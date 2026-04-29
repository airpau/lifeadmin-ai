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
  it('DELETEs /account-auth-requests/{id}', async () => {
    setEnvFor(() => {});
    // Yapily returns 200 on a successful delete in the API; we test
    // both that and the 404-already-gone path below. A test using 204
    // wouldn't work — the global Response constructor refuses a 204
    // with a body, which the mockFetch helper always emits.
    globalThis.fetch = mockFetch(200, {});

    await deleteConsent('consent-abc');

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.method, 'DELETE');
    assert.match(recorded[0]!.url, /\/account-auth-requests\/consent-abc$/);
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
