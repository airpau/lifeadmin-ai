/**
 * GET /api/admin/debug-gmail-query?connectionId=...&q=...
 *
 * Admin-only diagnostic. Runs a raw Gmail query against the given
 * email connection and returns the list of matching thread IDs +
 * the From / Subject / Date headers for the first message in each
 * thread, so we can see exactly what Gmail surfaces for a search
 * without touching correspondence / dedup / the relevance filter.
 *
 * Built for debugging why a founder\'s ACI autoresponse wasn\'t
 * being picked up by the Watchdog sync. Safe to leave in place —
 * admin-gated so only aireypaul@googlemail.com can hit it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { refreshAccessToken as refreshGmailToken } from '@/lib/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function ensureGmailToken(conn: any): Promise<string> {
  const exp = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (conn.access_token && exp - Date.now() > 60_000) return conn.access_token;
  if (!conn.refresh_token) throw new Error('No refresh token');
  const r = await refreshGmailToken(conn.refresh_token);
  return r.access_token;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const url = new URL(request.url);
  const connectionId = url.searchParams.get('connectionId');
  const q = url.searchParams.get('q');
  if (!connectionId || !q) {
    return NextResponse.json({ error: 'connectionId and q are required' }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: conn } = await admin
    .from('email_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  let token: string;
  try {
    token = await ensureGmailToken(conn);
  } catch (e) {
    return NextResponse.json({ error: `Token issue: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 502 });
  }

  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', q);
  listUrl.searchParams.set('maxResults', '20');
  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  const listJson = await listRes.json();
  if (!listRes.ok) {
    return NextResponse.json({
      ok: false,
      inbox: conn.email_address,
      query: q,
      gmail_error: listJson,
    }, { status: 502 });
  }

  const out: Array<any> = [];
  for (const m of (listJson.messages ?? []).slice(0, 20)) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!detail.ok) continue;
    const msg = await detail.json();
    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? '';
    out.push({
      id: msg.id,
      threadId: msg.threadId,
      internalDate: msg.internalDate,
      when: new Date(Number(msg.internalDate ?? 0)).toISOString(),
      from: h('From'),
      to: h('To'),
      subject: h('Subject'),
      snippet: msg.snippet ?? '',
      labelIds: msg.labelIds ?? [],
    });
  }

  return NextResponse.json({
    ok: true,
    inbox: conn.email_address,
    query: q,
    resultSize: listJson.resultSizeEstimate ?? 0,
    messages: out,
  });
}
