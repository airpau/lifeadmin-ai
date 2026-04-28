/**
 * POST /api/v1/disputes — B2B UK Consumer Rights API
 *
 * Public-facing v1 surface. Bearer-token auth, monthly rate limit
 * per key, structured response with primary UK statute citation,
 * entitlement analysis, draft letter excerpt and escalation path.
 *
 * Lives at /api/v1/disputes rather than /v1/disputes because Next
 * App Router puts API handlers under /api by convention. Customers
 * call `paybacker.co.uk/api/v1/disputes`. The /api → /for-business
 * redirect added in #341 is exact-match only so this path resolves
 * normally.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate, logUsage } from '@/lib/b2b/auth';
import { validateRequest, resolveDispute } from '@/lib/b2b/disputes';

export const runtime = 'nodejs';
export const maxDuration = 30;

function rateLimitHeaders(monthlyUsed: number, monthlyLimit: number) {
  const remaining = Math.max(0, monthlyLimit - monthlyUsed - 1); // -1 for this call
  return {
    'X-RateLimit-Limit': String(monthlyLimit),
    'X-RateLimit-Remaining': String(remaining),
  };
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const fwd = request.headers.get('x-forwarded-for');
  const clientIp = fwd ? fwd.split(',')[0].trim() : (request.headers.get('x-real-ip') || null);
  const auth = await authenticate(request.headers.get('authorization'), clientIp);
  if (!auth.ok || !auth.key) {
    return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 });
  }
  const { key } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await logUsage(key.id, '/v1/disputes', 400, Date.now() - t0, { error_code: 'INVALID_JSON' });
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validated = validateRequest(body);
  if ('code' in validated && validated.code === 'VALIDATION') {
    await logUsage(key.id, '/v1/disputes', 400, Date.now() - t0, { error_code: 'VALIDATION' });
    return NextResponse.json({ error: validated.message }, { status: 400 });
  }

  const result = await resolveDispute(validated as any);
  if ('code' in result) {
    const status = result.code === 'NO_STATUTE_MATCH' ? 422 : 500;
    await logUsage(key.id, '/v1/disputes', status, Date.now() - t0, {
      error_code: result.code,
    });
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  await logUsage(key.id, '/v1/disputes', 200, Date.now() - t0, {
    scenario_kind: result.legal_references[0] ?? null,
    // case_reference / customer_id are echoed for downstream auditing.
    // Logged here too so a portal-side support query ("which call
    // touched ticket TKT-12345?") can resolve without the customer
    // having to share request bodies. Plaintext ID values only — we
    // never log the scenario text or PII.
    case_reference: result.case_reference,
    customer_id: result.customer_id,
  });
  return NextResponse.json(result, {
    status: 200,
    headers: rateLimitHeaders(key.monthlyUsed, key.monthlyLimit),
  });
}

export async function GET() {
  return NextResponse.json({
    name: 'Paybacker UK Consumer Rights API',
    version: 'v1',
    docs: 'https://paybacker.co.uk/for-business',
    auth: 'Bearer token in Authorization header (request a key at /for-business)',
    endpoints: {
      'POST /api/v1/disputes': 'Resolve a UK consumer dispute scenario into statute + entitlement + draft + escalation',
    },
  });
}
