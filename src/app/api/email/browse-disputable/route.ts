/**
 * GET /api/email/browse-disputable
 *
 * Returns recent threads from every connected (non-archived) email
 * connection so the user can pick one to start a dispute from. The
 * "from email" entry on the New Dispute flow calls this.
 *
 * Optional query params:
 *   ?q=<text>   — keyword filter (subject + sender)
 *   ?days=<n>   — look-back window (default 90, max 365)
 *
 * We deliberately don\'t pre-filter for "looks disputable" — users
 * know which email they want to act on better than any heuristic.
 * Pure marketing emails get sorted naturally lower because users
 * scroll for the bill / debt / parking notice they remember.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { refreshAccessToken as refreshGmailToken } from '@/lib/gmail';
import { refreshMicrosoftToken } from '@/lib/outlook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface BrowsedThread {
  connectionId: string;
  emailAddress: string;
  provider: 'gmail' | 'outlook';
  threadId: string;
  subject: string;
  senderName: string;
  senderAddress: string;
  senderDomain: string;
  latestDate: string;
  messageCount: number;
  snippet: string;
}

async function ensureToken(conn: any): Promise<string> {
  const expiresAt = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (conn.access_token && expiresAt - Date.now() > 60_000) return conn.access_token;
  if (!conn.refresh_token) throw new Error('No refresh token');
  if (conn.provider_type === 'google' || conn.provider_type === 'gmail') {
    const r = await refreshGmailToken(conn.refresh_token);
    return r.access_token;
  }
  const r = await refreshMicrosoftToken(conn.refresh_token);
  return r.access_token;
}

async function listGmailRecent(conn: any, q: string, days: number, includeAll: boolean): Promise<BrowsedThread[]> {
  const token = await ensureToken(conn);
  const queryParts = [`newer_than:${days}d`];
  if (q) {
    // Gmail full-text query — combine subject, sender, and body
    // matches so a search for "ACI" finds threads where ACI appears
    // anywhere (sender, subject, or body) without the user knowing
    // Gmail\'s `subject:` / `from:` operators.
    const safe = q.replace(/[\\"]/g, '');
    queryParts.push(`(subject:${safe} OR from:${safe} OR ${safe})`);
  }
  // By default we include every category — even Promotions / Updates —
  // because users often want disputes on receipts (Updates) or
  // marketing-flagged renewal notices (Promotions). The previous
  // `-category:promotions -category:updates -category:social` filter
  // was hiding legitimate disputable mail (e.g. ACI debt notices that
  // Google routes into Updates). Pass ?strict=1 to opt back in.
  if (!includeAll) {
    queryParts.push('-category:social');
  }
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
  listUrl.searchParams.set('q', queryParts.join(' '));
  listUrl.searchParams.set('maxResults', '40');
  const res = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const list = await res.json();
  if (!list.threads?.length) return [];

  const out: BrowsedThread[] = [];
  for (const t of list.threads as Array<{ id: string }>) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!detail.ok) continue;
    const thr = await detail.json();
    const msgs = thr.messages ?? [];
    if (msgs.length === 0) continue;
    const last = msgs[msgs.length - 1];
    const headers = (last.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? '';
    const fromStr = h('From');
    const fromAddr = fromStr.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? '';
    const fromName = (fromStr.split('<')[0] || '').replace(/"/g, '').trim() || fromAddr;
    out.push({
      connectionId: conn.id,
      emailAddress: conn.email_address,
      provider: 'gmail',
      threadId: thr.id,
      subject: h('Subject') || '(no subject)',
      senderName: fromName,
      senderAddress: fromAddr,
      senderDomain: fromAddr.split('@')[1] ?? '',
      latestDate: new Date(Number(last.internalDate ?? 0)).toISOString(),
      messageCount: msgs.length,
      snippet: thr.snippet ?? '',
    });
  }
  return out;
}

async function listOutlookRecent(conn: any, q: string, days: number): Promise<BrowsedThread[]> {
  const token = await ensureToken(conn);
  const sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
  const url = new URL('https://graph.microsoft.com/v1.0/me/messages');
  url.searchParams.set('$top', '25');
  url.searchParams.set('$select', 'id,conversationId,subject,from,receivedDateTime,bodyPreview');
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  if (q) url.searchParams.set('$search', `"${q}"`);
  else url.searchParams.set('$filter', `receivedDateTime ge ${sinceIso}`);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  const seen = new Map<string, BrowsedThread>();
  for (const m of (data.value ?? []) as Array<any>) {
    const convId = m.conversationId;
    if (!convId || seen.has(convId)) continue;
    const fromAddr = (m.from?.emailAddress?.address ?? '').toLowerCase();
    const fromName = m.from?.emailAddress?.name ?? fromAddr;
    seen.set(convId, {
      connectionId: conn.id,
      emailAddress: conn.email_address,
      provider: 'outlook',
      threadId: convId,
      subject: m.subject || '(no subject)',
      senderName: fromName,
      senderAddress: fromAddr,
      senderDomain: fromAddr.split('@')[1] ?? '',
      latestDate: m.receivedDateTime,
      messageCount: 1,
      snippet: m.bodyPreview ?? '',
    });
  }
  return Array.from(seen.values());
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  // Default look-back bumped to 180 days — debt-collector and council
  // letters often sit unread for a few months before the user wants
  // to action them. Capped at 365 to keep API calls bounded.
  const days = Math.min(365, Math.max(7, parseInt(searchParams.get('days') ?? '180', 10) || 180));
  const strict = searchParams.get('strict') === '1';

  // Active, non-archived email connections only.
  const { data: connections } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('archived_at', null);

  if (!connections || connections.length === 0) {
    return NextResponse.json({ threads: [], connections: [], reason: 'no_email_connection' });
  }

  const all: BrowsedThread[] = [];
  const errors: string[] = [];
  for (const conn of connections) {
    try {
      const provider = (conn.provider_type ?? '').toLowerCase();
      if (provider === 'google' || provider === 'gmail') {
        all.push(...await listGmailRecent(conn, q, days, !strict));
      } else if (provider === 'microsoft' || provider === 'outlook') {
        all.push(...await listOutlookRecent(conn, q, days));
      }
    } catch (err) {
      errors.push(`${conn.email_address}: ${err instanceof Error ? err.message : 'fetch failed'}`);
    }
  }

  // Sort newest first; cap at 50 across all inboxes so the picker
  // stays usable on mobile.
  all.sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  return NextResponse.json({
    threads: all.slice(0, 50),
    connections: connections.map((c) => ({ id: c.id, email_address: c.email_address, provider: c.provider_type })),
    errors: errors.length > 0 ? errors : undefined,
  });
}
