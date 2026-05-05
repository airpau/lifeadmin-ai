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
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { authenticate, logUsage } from '@/lib/b2b/auth';
import { validateRequest, resolveDispute } from '@/lib/b2b/disputes';
import { publishUsageThreshold } from '@/lib/b2b/webhook-publisher';
import { resend, FROM_EMAIL } from '@/lib/resend';

export const runtime = 'nodejs';
// Same engine as consumer /api/complaints/generate — worst case is two
// Claude calls (citation-guarantee retry) plus retrieval + context.
// Consumer route uses 120s after 60s proved too tight. B2B must match
// or paying customers will see 504s on complex disputes.
export const maxDuration = 120;

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

/**
 * Check whether this call crosses 60% or 90% of the monthly cap and
 * fire the corresponding webhook if so. Idempotent per calendar month
 * via b2b_api_keys.notified_thresholds — each threshold fires at most
 * once per month per key.
 *
 * Best-effort: a Supabase blip here must not break the request.
 */
async function maybeFireThresholdWebhook(args: {
  keyId: string;
  keyPrefix: string;
  ownerEmail: string;
  tier: 'starter' | 'growth' | 'enterprise';
  monthlyUsed: number;
  monthlyLimit: number;
}): Promise<void> {
  // monthlyUsed is the count BEFORE this call landed — the call we're
  // currently serving makes the new total monthlyUsed+1.
  const newCount = args.monthlyUsed + 1;
  const percent = (newCount / args.monthlyLimit) * 100;
  const threshold: 60 | 90 | null = percent >= 90 ? 90 : percent >= 60 ? 60 : null;
  if (!threshold) return;

  // Was this previous call already past the threshold? If so we've
  // already fired (or are dedupe-protected by the per-month bookkeeping
  // below). Cheap pre-check.
  const previousPercent = (args.monthlyUsed / args.monthlyLimit) * 100;
  if (previousPercent >= threshold) return;

  try {
    const sb = admin();
    const monthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const { data: keyRow } = await sb
      .from('b2b_api_keys')
      .select('notified_thresholds')
      .eq('id', args.keyId)
      .maybeSingle();
    const notified = (keyRow?.notified_thresholds ?? {}) as Record<string, number[]>;
    const fired = notified[monthKey] ?? [];
    if (fired.includes(threshold)) return; // already fired this month

    // Compute the next 1st-of-month at 00:00 UTC for period_resets_at.
    const now = new Date();
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

    await publishUsageThreshold({
      threshold,
      key_prefix: args.keyPrefix,
      owner_email: args.ownerEmail,
      tier: args.tier,
      calls_used: newCount,
      monthly_limit: args.monthlyLimit,
      period_resets_at: reset.toISOString(),
    });

    // Mark fired so we don't re-fire this threshold this month.
    const next = { ...notified, [monthKey]: [...fired, threshold] };
    await sb.from('b2b_api_keys').update({ notified_thresholds: next }).eq('id', args.keyId);
  } catch (e) {
    console.warn('[v1/disputes] threshold webhook failed', e instanceof Error ? e.message : e);
  }
}

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('base64');
}

/**
 * 503 alarm — fires when the freshness cascade (tier 1-4 + chain
 * fallback) couldn't salvage at least one ref AND the post-flight had
 * no fresh substitute either. Should be vanishingly rare; when it fires
 * the founder needs to know within seconds because the API is shipping
 * 503s to a paying B2B customer.
 *
 * Idempotent per (category, UTC date) via `compliance_alerts_sent.alert_key`
 * so a burst of 503s in the same category on the same day fires exactly
 * one Telegram + one email. Both channels are fire-and-forget — failure
 * never affects the API response.
 */
async function fireStaleCitation503Alarm(args: {
  categories: string[];
  refIds: string[];
  scenario: string;
  keyPrefix: string;
  requestId: string;
}): Promise<void> {
  // Pick the primary category for the alert key. Multiple categories on
  // a single 503 is rare; we dedupe on the first one and fold the rest
  // into the body so the email still surfaces them all.
  const primaryCategory = args.categories[0] || 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const alertKey = `b2b-503:${primaryCategory}:${today}`;
  const sb = admin();

  // Claim the alert key. Unique violation = already alerted today.
  try {
    const { error } = await sb.from('compliance_alerts_sent').insert({
      alert_key: alertKey,
      channel: 'multi',
      metadata: {
        categories: args.categories,
        ref_ids: args.refIds,
        request_id: args.requestId,
        key_prefix: args.keyPrefix,
      },
    });
    if (error) return; // already fired today
  } catch {
    // Dedup table unavailable — bail rather than risk a flood. Better to
    // miss an alert than spam the founder during a Supabase incident.
    return;
  }

  const truncatedScenario = args.scenario.length > 400
    ? args.scenario.slice(0, 400) + '…'
    : args.scenario;
  const ts = new Date().toISOString();

  // Telegram (founder chat) — fire-and-forget.
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (tgToken && tgChat) {
    void fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(tgChat),
        text: [
          `🚨 *B2B 503 — STALE_CITATION*`,
          ``,
          `Category: \`${primaryCategory}\`${args.categories.length > 1 ? ` (+${args.categories.length - 1})` : ''}`,
          `Refs: ${args.refIds.length}`,
          `Key: \`${args.keyPrefix}\``,
          `Request: \`${args.requestId}\``,
          ``,
          `Cascade exhausted (tier 1-4 + chain fallback). Re-verify the category urgently.`,
        ].join('\n'),
        parse_mode: 'Markdown',
      }),
    }).catch(() => undefined);
  }

  // Email to hello@paybacker.co.uk via Resend — fire-and-forget.
  if (process.env.RESEND_API_KEY) {
    void resend.emails.send({
      from: FROM_EMAIL,
      to: 'hello@paybacker.co.uk',
      subject: `[B2B URGENT] STALE_CITATION 503 — ${primaryCategory} category exhausted`,
      html: `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:auto;color:#0f172a;">
        <div style="background:#7f1d1d;color:#fee2e2;padding:8px 14px;border-radius:6px;display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.5px;">B2B 503</div>
        <h2 style="margin:14px 0 8px;">STALE_CITATION 503 — ${escapeHtml(primaryCategory)} exhausted</h2>
        <p style="color:#475569;">The freshness cascade (tier 1 → 4 + category chain fallback) produced no usable ref. The /v1/disputes endpoint is currently returning 503 for matching scenarios in this category.</p>
        <table style="width:100%;font-size:13px;color:#0f172a;border-collapse:collapse;margin-top:12px;">
          <tr><td style="color:#64748b;padding:4px 12px 4px 0;">Categories</td><td>${escapeHtml(args.categories.join(', '))}</td></tr>
          <tr><td style="color:#64748b;padding:4px 12px 4px 0;">Unsalvageable refs</td><td><code>${args.refIds.map(escapeHtml).join(', ') || '(none — post-flight rogue path)'}</code></td></tr>
          <tr><td style="color:#64748b;padding:4px 12px 4px 0;">Timestamp</td><td>${escapeHtml(ts)}</td></tr>
          <tr><td style="color:#64748b;padding:4px 12px 4px 0;">API key prefix</td><td><code>${escapeHtml(args.keyPrefix)}</code></td></tr>
          <tr><td style="color:#64748b;padding:4px 12px 4px 0;">Request ID</td><td><code>${escapeHtml(args.requestId)}</code></td></tr>
        </table>
        <h3 style="margin-top:18px;font-size:14px;">Scenario (truncated)</h3>
        <pre style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:12px;white-space:pre-wrap;color:#0f172a;">${escapeHtml(truncatedScenario)}</pre>
        <p style="margin-top:18px;"><a href="https://paybacker.co.uk/dashboard/admin/legal-refs" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Open legal-refs admin</a></p>
        <p style="color:#64748b;font-size:12px;margin-top:14px;">Idempotent: one alert per (category, UTC date). Further 503s in '${escapeHtml(primaryCategory)}' today will be silenced.</p>
      </div>`,
    }).catch(() => undefined);
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  // Every response carries X-Request-Id so the customer can quote it
  // back to support and we can pinpoint the call in b2b_api_usage.
  // We generate it BEFORE auth so that auth-failure responses also
  // carry it (useful when a customer reports "all my calls are 401-ing").
  const requestId = randomUUID();
  const fwd = request.headers.get('x-forwarded-for');
  const clientIp = fwd ? fwd.split(',')[0].trim() : (request.headers.get('x-real-ip') || null);
  const auth = await authenticate(request.headers.get('authorization'), clientIp);
  if (!auth.ok || !auth.key) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status ?? 401,
      headers: { 'X-Request-Id': requestId },
    });
  }
  const { key } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await logUsage(key.id, '/v1/disputes', 400, Date.now() - t0, { error_code: 'INVALID_JSON' });
    return NextResponse.json({ error: 'Invalid JSON body' }, {
      status: 400,
      headers: { 'X-Request-Id': requestId },
    });
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
        headers: {
          'X-Paybacker-Idempotent-Replay': 'true',
          'X-Request-Id': requestId,
        },
      });
    }
  }

  const validated = validateRequest(body);
  if ('code' in validated && validated.code === 'VALIDATION') {
    await logUsage(key.id, '/v1/disputes', 400, Date.now() - t0, { error_code: 'VALIDATION' });
    const errBody = { error: validated.message };
    if (idemKey) await writeIdempotencyCache(key.id, idemKey, 400, errBody);
    return NextResponse.json(errBody, {
      status: 400,
      headers: { 'X-Request-Id': requestId },
    });
  }

  const result = await resolveDispute(validated as any);
  if ('code' in result) {
    const status = result.code === 'NO_STATUTE_MATCH'
      ? 422
      : result.code === 'STALE_CITATION'
        ? 503
        : 500;
    await logUsage(key.id, '/v1/disputes', status, Date.now() - t0, {
      error_code: result.code,
    });
    const errBody: Record<string, unknown> = { error: result.message, code: result.code };
    if (result.code === 'STALE_CITATION') {
      errBody.ref_ids = result.ref_ids ?? [];
      errBody.retry_after = result.retry_after ?? 60;
    }
    // 422 is a stable engine verdict — caching is correct (replay
    // returns the same NO_STATUTE_MATCH). 500 / 503 are transient
    // failures; we DON'T cache those, so the caller's retry actually
    // re-runs the engine (and re-checks freshness).
    if (idemKey && status === 422) await writeIdempotencyCache(key.id, idemKey, status, errBody);
    const headers: Record<string, string> = { 'X-Request-Id': requestId };
    if (result.code === 'STALE_CITATION') {
      headers['Retry-After'] = String(result.retry_after ?? 60);
      // 503 alarm — fire-and-forget Telegram + email to founder so a
      // production stale-citation outage is detected within seconds.
      // Idempotent per (category, UTC date) so a burst doesn't spam.
      const scenarioStr = (validated as { scenario?: unknown }).scenario;
      void fireStaleCitation503Alarm({
        categories: result.unsalvageable_categories ?? [],
        refIds: result.ref_ids ?? [],
        scenario: typeof scenarioStr === 'string' ? scenarioStr : '',
        keyPrefix: key.keyPrefix,
        requestId,
      });
    }
    return NextResponse.json(errBody, { status, headers });
  }

  await logUsage(key.id, '/v1/disputes', 200, Date.now() - t0, {
    scenario_kind: result.legal_references[0] ?? null,
  });

  // Cache the successful response. Replays within 24h get back the
  // exact same body and status code with X-Paybacker-Idempotent-Replay
  // set, no monthly counter increment, no Anthropic spend.
  if (idemKey) await writeIdempotencyCache(key.id, idemKey, 200, result);

  // Threshold webhooks (key.usage_threshold_60 / 90). Best-effort,
  // idempotent per calendar month per key.
  if (key.ownerEmail) {
    void maybeFireThresholdWebhook({
      keyId: key.id,
      keyPrefix: key.keyPrefix,
      ownerEmail: key.ownerEmail,
      tier: key.tier,
      monthlyUsed: key.monthlyUsed,
      monthlyLimit: key.monthlyLimit,
    });
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      ...rateLimitHeaders(key.monthlyUsed, key.monthlyLimit),
      'X-Request-Id': requestId,
    },
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
