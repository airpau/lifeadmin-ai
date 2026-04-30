/**
 * GET /api/admin/debug-watchdog?linkId=...
 *
 * Admin-only deep diagnostic that runs both halves of the watchdog
 * sync (thread fetch + domain scan + relevance filter) WITHOUT
 * inserting anything into correspondence and returns a full trace
 * of what each step found and how it voted.
 *
 * Built to debug why the ACI autoresponse keeps slipping through
 * the cracks even though the diagnostic Gmail query confirms it\'s
 * sitting in the inbox.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { fetchNewMessages, fetchDomainMessages } from '@/lib/dispute-sync/fetchers';
import type { EmailConnection } from '@/lib/dispute-sync/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const linkId = new URL(request.url).searchParams.get('linkId');
  if (!linkId) return NextResponse.json({ error: 'linkId required' }, { status: 400 });

  const db = getAdmin();
  const { data: link } = await db
    .from('dispute_watchdog_links')
    .select('*, email_connections(*)')
    .eq('id', linkId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const conn = link.email_connections as EmailConnection | null;
  if (!conn) return NextResponse.json({ error: 'Connection missing on link' }, { status: 500 });

  const since = link.last_synced_at ? new Date(link.last_synced_at) : null;

  // 1. Thread scan
  let threadMessages: any[] = [];
  let threadError: string | null = null;
  try {
    threadMessages = await fetchNewMessages(conn, link.thread_id, since);
  } catch (e) { threadError = e instanceof Error ? e.message : String(e); }

  // 2. Domain scan
  let domainMessages: any[] = [];
  let domainError: string | null = null;
  if (link.sender_domain) {
    try {
      const domainSince = since ?? new Date(new Date(link.created_at ?? Date.now()).getTime() - 7 * 86400_000);
      domainMessages = await fetchDomainMessages(conn, link.sender_domain, domainSince, link.thread_id);
    } catch (e) { domainError = e instanceof Error ? e.message : String(e); }
  }

  return NextResponse.json({
    link: {
      id: link.id,
      thread_id: link.thread_id,
      sender_domain: link.sender_domain,
      sender_address: link.sender_address,
      last_synced_at: link.last_synced_at,
      sync_enabled: link.sync_enabled,
    },
    connection: {
      id: conn.id,
      email_address: (conn as any).email_address,
      provider_type: (conn as any).provider_type,
      status: (conn as any).status,
    },
    thread_scan: {
      since: since?.toISOString() ?? null,
      thread_id: link.thread_id,
      error: threadError,
      count: threadMessages.length,
      messages: threadMessages.map((m) => ({
        messageId: m.messageId, threadId: m.threadId,
        from: m.fromAddress, subject: m.subject,
        receivedAt: m.receivedAt instanceof Date ? m.receivedAt.toISOString() : m.receivedAt,
        snippet: m.snippet?.slice(0, 200),
      })),
    },
    domain_scan: {
      sender_domain: link.sender_domain,
      excluded_thread_id: link.thread_id,
      error: domainError,
      count: domainMessages.length,
      messages: domainMessages.map((m) => ({
        messageId: m.messageId, threadId: m.threadId,
        from: m.fromAddress, fromRaw: (m as any).fromRaw,
        fromName: m.fromName, fromDomain: m.fromDomain,
        subject: m.subject,
        receivedAt: m.receivedAt instanceof Date ? m.receivedAt.toISOString() : m.receivedAt,
        snippet: m.snippet?.slice(0, 200),
        bodyPreview: (m.body ?? '').slice(0, 400),
      })),
    },
  });
}
