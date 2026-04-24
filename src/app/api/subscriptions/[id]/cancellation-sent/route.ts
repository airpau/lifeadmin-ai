/**
 * POST /api/subscriptions/[id]/cancellation-sent
 *
 * Called when a user clicks "I've sent it — track the reply" after
 * Open-in-Email opened a mailto: draft. Closes the Phase-3 cancellation
 * loop without needing any OAuth send scope:
 *
 *   1. Flip the subscription to status='pending_cancellation' + date note
 *   2. Find the open dispute for this subscription's provider (created
 *      earlier by the cancellation flow's create-dispute step)
 *   3. Insert a dispute_watchdog_links row with sender_domain set to
 *      the provider's domain. thread_id is intentionally NULL — we
 *      couldn't observe the thread the user sent from since mailto
 *      lives outside our OAuth — so the sync-runner skips thread-level
 *      fetch and relies on domain-scan to find the reply.
 *
 * Body: { providerEmail?: string }  — e.g. "contactus@britishgas.co.uk"
 *
 * Coverage honesty: domain-scan matches replies from the provider's
 * own domain (the common case). Replies from third-party ticketing
 * systems (zendesk.com, freshdesk.com, etc.) won't match and need a
 * manual thread link from the Disputes page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function extractDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: subscriptionId } = await params;
  const body = await request.json().catch(() => ({}));
  const providerEmail = typeof body.providerEmail === 'string' ? body.providerEmail.trim() : null;

  // Load the subscription so we can look up the dispute by provider_name.
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, provider_name, status')
    .eq('id', subscriptionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  // Flip subscription state + timestamp the cancellation send.
  const sentNote = `Cancellation letter sent ${new Date().toLocaleDateString('en-GB')} — awaiting provider response`;
  const { error: updErr } = await supabase
    .from('subscriptions')
    .update({ status: 'pending_cancellation', notes: sentNote })
    .eq('id', subscriptionId)
    .eq('user_id', user.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Find the open dispute for this provider. The cancellation-email flow
  // already creates one on first click, so this should usually hit.
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id')
    .eq('user_id', user.id)
    .ilike('provider_name', sub.provider_name)
    .in('status', ['open', 'in_progress', 'awaiting_response'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let watchdog: { linkId: string; senderDomain: string | null } | null = null;

  if (dispute?.id) {
    // Pick the user's primary active email connection so the Watchdog
    // cron knows which inbox to poll. No active email? We still create
    // the dispute + flip status — Watchdog just won't scan until the
    // user connects one.
    const { data: emailConn } = await supabase
      .from('email_connections')
      .select('id, provider_type')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const senderDomain = extractDomain(providerEmail);

    if (emailConn && senderDomain) {
      // dispute_watchdog_links constrains provider ∈ (gmail, outlook, imap)
      // and match_source ∈ (user_confirmed, auto_domain, auto_ai).
      // email_connections.provider_type stores 'google' rather than
      // 'gmail', so normalise before insert. 'auto_domain' is the right
      // semantic here — the link is created automatically, scoped by
      // domain, without the user confirming a specific thread.
      const providerMap: Record<string, 'gmail' | 'outlook' | 'imap'> = {
        google: 'gmail', gmail: 'gmail', outlook: 'outlook', imap: 'imap',
      };
      const normalisedProvider = providerMap[emailConn.provider_type as string] ?? 'imap';

      const { data: linkRow, error: linkErr } = await supabase
        .from('dispute_watchdog_links')
        .insert({
          dispute_id: dispute.id,
          user_id: user.id,
          email_connection_id: emailConn.id,
          provider: normalisedProvider,
          thread_id: null,
          sender_domain: senderDomain,
          sync_enabled: true,
          match_source: 'auto_domain',
          match_confidence: 0.7,
        })
        .select('id')
        .single();
      if (linkErr) {
        console.error('[cancellation-sent] watchdog link insert failed:', linkErr.message);
      } else {
        watchdog = { linkId: linkRow.id, senderDomain };
      }
    } else {
      watchdog = { linkId: '', senderDomain }; // context for response payload only
    }
  }

  return NextResponse.json({
    ok: true,
    subscription_id: subscriptionId,
    dispute_id: dispute?.id ?? null,
    watchdog_link_created: !!watchdog?.linkId,
    sender_domain: watchdog?.senderDomain ?? null,
  });
}
