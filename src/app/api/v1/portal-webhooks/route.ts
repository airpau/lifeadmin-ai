/**
 * Token-gated webhook configuration for B2B customers.
 *
 * GET    — list webhooks
 * POST   — create / update / delete / test  via { action }
 *
 * Body for create: { token, email, url, description?, events: string[] }
 * Body for update: { token, email, action: 'update', id, ...patch }
 * Body for delete: { token, email, action: 'delete', id }
 * Body for test:   { token, email, action: 'test', id }
 *
 * Signing secret is generated server-side, returned ONCE on create
 * (the customer must save it — never re-displayed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { audit, extractClientMeta } from '@/lib/b2b/audit';
import { authPortal } from '@/lib/b2b/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_EVENTS = [
  'key.created',
  'key.revoked',
  'key.reissued',
  'key.usage_threshold_60',
  'key.usage_threshold_90',
  'usage.daily_summary',
];

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyToken(supabase: any, token: string, email: string, burn: boolean): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase
    .from('b2b_portal_tokens')
    .select('id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .eq('email', email)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return false;
  if (burn) {
    await supabase.from('b2b_portal_tokens').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  }
  return true;
}

function signPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function generateSecret(): { plaintext: string; hash: string } {
  const plaintext = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, hash };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const auth = await authPortal(request, null, { token: url.searchParams.get('token'), email: url.searchParams.get('email') });
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();

  const { data: hooks } = await supabase
    .from('b2b_webhooks')
    .select('id, url, description, events, is_active, last_delivery_at, last_delivery_status, consecutive_failures, created_at')
    .eq('owner_email', email)
    .order('created_at', { ascending: false });

  // Recent deliveries across this customer's webhooks for the last 50.
  const ids = (hooks ?? []).map((h: any) => h.id);
  let deliveries: any[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from('b2b_webhook_deliveries')
      .select('id, webhook_id, event, status_code, latency_ms, attempt, error, created_at')
      .in('webhook_id', ids)
      .order('created_at', { ascending: false })
      .limit(50);
    deliveries = data ?? [];
  }

  return NextResponse.json({
    webhooks: hooks ?? [],
    recent_deliveries: deliveries,
    supported_events: SUPPORTED_EVENTS,
  });
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = (body?.action as string) || 'create';
  const auth = await authPortal(request, body, null);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();
  const meta = extractClientMeta(request);

  if (action === 'create') {
    const url: string = String(body?.url || '');
    const description: string = String(body?.description || '');
    const events: string[] = Array.isArray(body?.events) ? body.events.filter((e: any) => SUPPORTED_EVENTS.includes(e)) : [];
    if (!/^https:\/\/[^\s/]+/.test(url)) {
      return NextResponse.json({ error: 'url must be a https URL' }, { status: 400 });
    }
    if (events.length === 0) {
      return NextResponse.json({ error: 'subscribe to at least one event' }, { status: 400 });
    }
    const sec = generateSecret();
    const { data: inserted, error } = await supabase
      .from('b2b_webhooks')
      .insert({
        owner_email: email,
        url,
        description: description || null,
        signing_secret_hash: sec.hash,
        events,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    audit({ email, action: 'plan_changed', ...meta, metadata: { webhook_id: inserted?.id, op: 'webhook_created', url } });
    return NextResponse.json({ ok: true, id: inserted?.id, signing_secret: sec.plaintext });
  }

  if (action === 'update') {
    const id: string = String(body?.id || '');
    const patch: Record<string, any> = {};
    if (typeof body?.url === 'string') patch.url = body.url;
    if (typeof body?.description === 'string') patch.description = body.description || null;
    if (Array.isArray(body?.events)) patch.events = body.events.filter((e: any) => SUPPORTED_EVENTS.includes(e));
    if (typeof body?.is_active === 'boolean') patch.is_active = body.is_active;
    patch.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('b2b_webhooks')
      .update(patch)
      .eq('id', id)
      .eq('owner_email', email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    audit({ email, action: 'plan_changed', ...meta, metadata: { webhook_id: id, op: 'webhook_updated' } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete') {
    const id: string = String(body?.id || '');
    await supabase.from('b2b_webhooks').delete().eq('id', id).eq('owner_email', email);
    audit({ email, action: 'plan_changed', ...meta, metadata: { webhook_id: id, op: 'webhook_deleted' } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'test') {
    const id: string = String(body?.id || '');
    const { data: hook } = await supabase
      .from('b2b_webhooks')
      .select('id, url, signing_secret_hash')
      .eq('id', id)
      .eq('owner_email', email)
      .maybeSingle();
    if (!hook) return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });

    // For test events we don't have the plaintext secret (only the hash).
    // We deliver the test payload signed with a one-shot test secret and
    // tell the customer to verify by URL receipt + 200 status, not signature.
    const payload = JSON.stringify({
      type: 'test.ping',
      sent_at: new Date().toISOString(),
      message: 'Test ping from Paybacker portal — delivery succeeds means the URL is reachable.',
    });

    const t0 = Date.now();
    let status: number | null = null;
    let err: string | null = null;
    try {
      const r = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Paybacker-Event': 'test.ping',
          'Paybacker-Signature': 'test', // signature verification skipped on test
        },
        body: payload,
        signal: AbortSignal.timeout(8000),
      });
      status = r.status;
    } catch (e: any) {
      err = e?.message || 'request failed';
    }
    const latency = Date.now() - t0;

    await supabase.from('b2b_webhook_deliveries').insert({
      webhook_id: id,
      event: 'test.ping',
      status_code: status,
      latency_ms: latency,
      error: err,
    });
    // Operator-precedence-safe: (existing ?? 0) + 1, not existing ?? 1.
    let nextFailures = 0;
    if (!(status && status >= 200 && status < 300)) {
      const { data: cur } = await supabase.from('b2b_webhooks').select('consecutive_failures').eq('id', id).single();
      nextFailures = ((cur?.consecutive_failures ?? 0) as number) + 1;
    }
    await supabase.from('b2b_webhooks').update({
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: status,
      consecutive_failures: nextFailures,
      // Auto-disable after 5 consecutive failures so we don't keep
      // hammering a customer's broken endpoint.
      ...(nextFailures >= 5 ? { is_active: false } : {}),
    }).eq('id', id);

    return NextResponse.json({ ok: status != null && status >= 200 && status < 300, status, error: err, latency });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
