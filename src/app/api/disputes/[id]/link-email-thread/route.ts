/**
 * POST   /api/disputes/[id]/link-email-thread — link a thread to a dispute
 * DELETE /api/disputes/[id]/link-email-thread — unlink
 *
 * Body (POST):
 *   {
 *     connectionId: string,
 *     provider: 'gmail'|'outlook'|'imap',
 *     threadId: string,
 *     subject?: string,
 *     senderAddress?: string,
 *     matchSource?: 'user_confirmed'|'auto_domain'|'auto_ai'
 *   }
 *
 * On successful link, runs an initial sync to pull the full thread history
 * into correspondence as auto-imported entries.
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §5
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { checkWatchdogLinkLimit } from '@/lib/plan-limits';
import { fetchNewMessages } from '@/lib/dispute-sync/fetchers';
import type { EmailConnection } from '@/lib/dispute-sync/types';

export const maxDuration = 60;

/**
 * GET — returns the currently active linked thread for this dispute (if any).
 * Used by the dispute-detail WatchdogCard to render its status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('dispute_watchdog_links')
    .select('id, email_connection_id, provider, thread_id, subject, sender_domain, sender_address, last_synced_at, last_message_date, sync_enabled, created_at')
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id)
    .eq('sync_enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[link-email-thread.GET]', error);
    return NextResponse.json({ error: 'Failed to load link' }, { status: 500 });
  }

  return NextResponse.json({ link: data ?? null });
}

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.connectionId || !body?.provider || !body?.threadId) {
    return NextResponse.json(
      { error: 'Missing connectionId, provider, or threadId' },
      { status: 400 },
    );
  }
  if (!['gmail', 'outlook', 'imap'].includes(body.provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // Ownership check on dispute
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, provider_name')
    .eq('id', disputeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  // Plan limit check — number of active linked threads
  const limitCheck = await checkWatchdogLinkLimit(user.id);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: 'limit_reached',
        message: `Your ${limitCheck.tier} plan allows ${limitCheck.limit} linked thread${limitCheck.limit === 1 ? '' : 's'}. Upgrade to link more.`,
        tier: limitCheck.tier,
        used: limitCheck.used,
        limit: limitCheck.limit,
        upgradeRequired: true,
      },
      { status: 402 },
    );
  }

  // Verify ownership of the email connection and fetch its full record
  const { data: conn } = await supabase
    .from('email_connections')
    .select('*')
    .eq('id', body.connectionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: 'Email connection not found' }, { status: 404 });
  }

  // Disable all existing active watchdog links for this dispute before creating a new one.
  // This ensures only one active link per dispute at a time.
  const db = admin();
  await db
    .from('dispute_watchdog_links')
    .update({ sync_enabled: false, updated_at: new Date().toISOString() })
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id)
    .eq('sync_enabled', true);
  const senderDomain =
    body.senderAddress && typeof body.senderAddress === 'string' && body.senderAddress.includes('@')
      ? body.senderAddress.split('@')[1].toLowerCase()
      : null;

  const { data: linkRow, error: linkErr } = await db
    .from('dispute_watchdog_links')
    .upsert(
      {
        dispute_id: disputeId,
        user_id: user.id,
        email_connection_id: body.connectionId,
        provider: body.provider,
        thread_id: body.threadId,
        subject: body.subject ?? null,
        sender_domain: senderDomain,
        sender_address: body.senderAddress ?? null,
        first_message_id: body.firstMessageId ?? null,
        sync_enabled: true,
        match_source: body.matchSource ?? 'user_confirmed',
        match_confidence: body.matchConfidence ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider,thread_id' },
    )
    .select()
    .single();

  if (linkErr || !linkRow) {
    console.error('Failed to link email thread:', linkErr);
    return NextResponse.json({ error: 'Failed to save link' }, { status: 500 });
  }

  // Initial sync: pull the entire thread history into correspondence.
  // Guard against concurrent requests for the same thread both running the sync —
  // if last_synced_at is already set, another request already completed it.
  let imported = 0;
  if (linkRow.last_synced_at) {
    return NextResponse.json({
      success: true,
      linkId: linkRow.id,
      imported,
      tier: limitCheck.tier,
      linksUsed: (limitCheck.used ?? 0) + 1,
      linksLimit: limitCheck.limit,
    });
  }
  try {
    const messages = await fetchNewMessages(conn as EmailConnection, body.threadId, null);
    for (const m of messages) {
      // Insert via service role to bypass RLS; ON CONFLICT of dedupe index = skip
      const { error } = await db.from('correspondence').insert({
        dispute_id: disputeId,
        user_id: user.id,
        entry_type: 'company_email',
        title: m.subject || null,
        content: m.body,
        summary: m.snippet,
        sender_address: m.fromAddress,
        sender_name: m.fromName || null,
        supplier_message_id: m.messageId,
        detected_from_email: true,
        email_thread_id: linkRow.id,
        entry_date: m.receivedAt.toISOString(),
      });
      if (!error) imported++;
    }
    await db
      .from('dispute_watchdog_links')
      .update({
        last_synced_at: new Date().toISOString(),
        last_message_date:
          messages.length > 0
            ? messages[messages.length - 1].receivedAt.toISOString()
            : null,
      })
      .eq('id', linkRow.id);
  } catch (err) {
    console.error('Initial sync failed:', err);
    // Link is still saved — user can manually retry via /sync-replies-now
  }

  return NextResponse.json({
    success: true,
    linkId: linkRow.id,
    imported,
    tier: limitCheck.tier,
    linksUsed: (limitCheck.used ?? 0) + 1,
    linksLimit: limitCheck.limit,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Soft-unlink (sync_enabled=false) preserves history
  const { error } = await supabase
    .from('dispute_watchdog_links')
    .update({ sync_enabled: false, updated_at: new Date().toISOString() })
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: 'Failed to unlink' }, { status: 500 });
  return NextResponse.json({ success: true });
}
