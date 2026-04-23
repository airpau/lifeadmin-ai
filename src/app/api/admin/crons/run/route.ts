// src/app/api/admin/crons/run/route.ts
//
// Admin-only wrapper that triggers any of our Vercel crons manually.
// Same pattern as /api/admin/verify-legal-refs — the browser never sees
// CRON_SECRET; the route reads it from process.env server-side and
// proxies the GET with the Bearer header.
//
// Every invocation is logged to business_log (category='cron_run') so
// the admin UI can show "last run at" + "last result" next to each cron
// in the list.
//
// Auth: signed-in admin (ADMIN_EMAIL). Runtime: nodejs for fs read of
// vercel.json (used to validate that the requested path is a real
// registered cron — stops anyone using this as an open proxy).

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  let body: { path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedPath = (body.path ?? '').trim();
  if (!requestedPath.startsWith('/api/cron/')) {
    return NextResponse.json({ error: 'Path must start with /api/cron/' }, { status: 400 });
  }

  // Validate against vercel.json — only registered crons can be
  // triggered. Stops this endpoint being used as an auth-bypass proxy
  // for any arbitrary URL.
  let registeredPaths: Set<string>;
  try {
    const raw = await readFile(path.join(process.cwd(), 'vercel.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { crons?: Array<{ path: string }> };
    registeredPaths = new Set((parsed.crons ?? []).map((c) => c.path));
  } catch (err) {
    console.error('[admin/crons/run] failed to read vercel.json:', err);
    return NextResponse.json({ error: 'Could not validate cron inventory' }, { status: 500 });
  }
  if (!registeredPaths.has(requestedPath)) {
    return NextResponse.json({ error: `Not a registered cron: ${requestedPath}` }, { status: 400 });
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    new URL(request.url).origin;

  const url = `${origin}${requestedPath}`;
  const startedAt = Date.now();

  let ok = false;
  let status = 0;
  let responseBody: unknown = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
    });
    status = res.status;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = await res.text().catch(() => null);
    }
    ok = res.ok;
    if (!ok) {
      errorMessage = typeof responseBody === 'object' && responseBody !== null
        ? JSON.stringify(responseBody).slice(0, 500)
        : String(responseBody).slice(0, 500);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startedAt;

  // Log the manual invocation so the admin list can show "last run" info
  // without a round trip to Vercel's logs.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await admin.from('business_log').insert({
    category: 'cron_run',
    title: `cron_run ${requestedPath}`,
    content: ok
      ? `Manual run by ${user.email} succeeded in ${durationMs}ms. Response: ${JSON.stringify(responseBody).slice(0, 400)}`
      : `Manual run by ${user.email} FAILED (HTTP ${status} in ${durationMs}ms): ${errorMessage}`,
    severity: ok ? 'info' : 'error',
  }).then(({ error: e }) => {
    if (e) console.error('[admin/crons/run] business_log insert failed:', e.message);
  });

  if (!ok) {
    return NextResponse.json(
      { ok: false, status, error: errorMessage, durationMs },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, status, durationMs, response: responseBody });
}
