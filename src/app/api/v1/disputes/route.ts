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
 *
 * Idempotency (added 2026-04-28): callers may pass an Idempotency-Key
 * header OR an `idempotency_key` field in the body. Replays of the
 * same key within 24h return the cached response unchanged — same
 * status code, same body, same X-RateLimit-Remaining. Cache is per
 * api-key (different tenants can never share a cached response).
 * Plaintext keys are never stored; we hash with SHA-256 + base64.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { authenticate, logUsage } from '@/lib/b2b/auth';
import { validateRequest, resolveDispute } from '@/lib/b2b/disputes';

export const runtime = 'nodejs';
export const maxDuration = 30;

const IDEMPOTENCY_TTL_HOURS = 24;
const RESPONSE_BYTES_CAP = 64 * 1024; // 64 KB — refuse to cache larger

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function rateLimitHeaders(monthlyUsed: number, monthlyLimit: number) {
  const remaining = Math.max(0, monthlyLimit - monthlyUsed - 1); // -1 for this call
  return {
    'X-RateLimit-Limit': String(monthlyLimit),
    'X-RateLimit-Remaining': String(remaining),
  };
}

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('base64');
}

/**
 * Look up a cached response for (api_key_id, idempotency_key). Returns
 * null if no row, or the row is older than the TTL. Never throws — a
 * Supabase blip should not block a real request.
 */
async function readIdempotencyCache(
  apiKeyId: string,
  idempotencyKey: string,
): Promise<{ status_code: number; response: unknown } | null> {
  try {
    const sb = admin();
    const cutoff = new Date(Date.now() - IDEMPOTENCY_TTL_HOURS * 3600 * 1000).toISOString();
    const { data } = await sb
      .from('b2b_idempotency_keys')
      .select('status_code, response, created_at')
      .eq('key_id', apiKeyId)
      .eq('key_hash', hashKey(idempotencyKey))
      .gte('created_at', cutoff)
      .maybeSingle();
    if (!data) return null;
    return { status_code: data.status_code, response: data.response };
  } catch (e) {
    console.warn('[v1/disputes] idempotency read failed', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Cache a response for replay-safety. Failures are non-fatal — we'd
 * rather double-bill on retry than 500 the original request because
 * the cache write blipped. Capped at 64KB; oversize responses skip the
 * cache and the caller's retry will re-run the engine.
 */
async function writeIdempotencyCache(
  apiKeyId: string,
  idempotencyKey: string,
  statusCode: number,
  response: unknown,
): Promise<void> {
  try {
    const serialised = JSON.stringify(response);
    if (Buffer.byteLength(serialised, 'utf8') > RESPONSE_BYTES_CAP) {
      console.warn('[v1/disputes] response exceeds idempotency cache cap; skipping');
      return;
    }
    const sb = admin();
    await sb.from('b2b_idempotency_keys').insert({
      key_id: apiKeyId,
      key_hash: hashKey(idempotencyKey),
      status_code: statusCode,
      response,
    });
  } catch (e) {
    // Unique-violation = a concurrent request beat us to it. Either
    // they got the same answer (fine) or the answers differ (caller's
    // bug — they sent two different bodies under the same key). The
    // cache reflects the first writer.
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.toLowerCase().includes('duplicate')) {
      console.warn('[v1/disputes] idempotency write failed', msg);
    }
  }
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

  // Resolve idempotency key from header (preferred — Stripe-style) or
  // the request body's idempotency_key field (also documented). Header
  // wins when both are present.
  const headerKey = request.headers.get('idempotency-key');
  const bodyKey =
    typeof body === 'object' && body !== null && typeof (body as Record<string, unknown>).idempotency_key === 'string'
      ? ((body as Record<string, unknown>).idempotency_key as string)
      : null;
  const idemKey = headerKey || bodyKey || null;

  // Cache hit → return cached response unchanged. Don't log usage on
  // a hit (it doesn't represent a fresh engine call), don't increment
  // the monthly counter, don't include rate-limit headers (the cached
  // body already has whatever was current on the original call).
  if (idemKey) {
    const cached = await readIdempotencyCache(key.id, idemKey);
    if (cached) {
      return NextResponse.json(cached.response, {
        status: cached.status_code,
        headers: { 'X-Paybacker-Idempotent-Replay': 'true' },
      });
    }
  }

  const validated = validateRequest(body);
  if ('code' in validated && validated.code === 'VALIDATION') {
    await logUsage(key.id, '/v1/disputes', 400, Date.now() - t0, { error_code: 'VALIDATION' });
    const errBody = { error: validated.message };
    if (idemKey) await writeIdempotencyCache(key.id, idemKey, 400, errBody);
    return NextResponse.json(errBody, { status: 400 });
  }

  const result = await resolveDispute(validated as any);
  if ('code' in result) {
    const status = result.code === 'NO_STATUTE_MATCH' ? 422 : 500;
    await logUsage(key.id, '/v1/disputes', status, Date.now() - t0, {
      error_code: result.code,
    });
    const errBody = { error: result.message, code: result.code };
    // 422 is a stable engine verdict — caching is correct (replay
    // returns the same NO_STATUTE_MATCH). 500 is a transient engine
    // failure; we DON'T cache those, so the caller's retry actually
    // retries the engine.
    if (idemKey && status === 422) await writeIdempotencyCache(key.id, idemKey, status, errBody);
    return NextResponse.json(errBody, { status });
  }

  await logUsage(key.id, '/v1/disputes', 200, Date.now() - t0, {
    scenario_kind: result.legal_references[0] ?? null,
  });

  // Cache the successful response. Replays within 24h get back the
  // exact same body and status code with X-Paybacker-Idempotent-Replay
  // set, no monthly counter increment, no Anthropic spend.
  if (idemKey) await writeIdempotencyCache(key.id, idemKey, 200, result);

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
    idempotency: {
      header: 'Idempotency-Key',
      body_field: 'idempotency_key',
      ttl_hours: IDEMPOTENCY_TTL_HOURS,
      replay_marker_header: 'X-Paybacker-Idempotent-Replay',
    },
  });
}
