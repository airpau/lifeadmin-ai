/**
 * POST /api/disputes/[id]/letter-sent
 *
 * Called when a user clicks "I've sent it" after Open-in-Email on a
 * dispute letter (any dispute type — cancellation, bill dispute,
 * parking, flight delay, etc.). Mirrors the subscriptions-side
 * /api/subscriptions/[id]/cancellation-sent endpoint:
 *
 *   1. Mark the dispute as sent: status='awaiting_response',
 *      tracking_status='sent', sent_at=now()
 *   2. Look up the provider's contact email via the shared
 *      provider_cancellation_info table (it covers complaint +
 *      cancellation addresses — same team receives both for most
 *      providers)
 *   3. If we resolved an email and the user has an active email
 *      connection, insert a dispute_watchdog_links row scoped to
 *      the provider's domain so the Watchdog cron auto-imports any
 *      reply into this dispute's correspondence timeline
 *
 * Body: { providerEmail?: string; letter?: string; edited?: boolean }
 *   - providerEmail: optional override; falls back to DB lookup
 *   - letter: the EXACT text of what the user is sending. May differ
 *     from the original AI draft if they edited or refined it before
 *     hitting "I've sent it". Stored as a correspondence row of type
 *     'letter_sent' so future replies can reference what was sent.
 *   - edited: true if the user changed the AI draft before sending
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCancellationInfo } from '@/lib/cancellation-provider';

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

  const { id: disputeId } = await params;
  const body = await request.json().catch(() => ({}));
  const overrideEmail = typeof body.providerEmail === 'string' ? body.providerEmail.trim() : null;
  const letterContent = typeof body.letter === 'string' ? body.letter.trim() : null;
  const edited = !!body.edited;

  const { data: dispute, error: loadErr } = await supabase
    .from('disputes')
    .select('id, provider_name, status')
    .eq('id', disputeId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  // Flip dispute state.
  const { error: updErr } = await supabase
    .from('disputes')
    .update({
      status: 'awaiting_response',
      tracking_status: 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', disputeId)
    .eq('user_id', user.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Resolve provider email — caller override wins, DB lookup fills in.
  let providerEmail = overrideEmail;
  if (!providerEmail && dispute.provider_name) {
    const info = await getCancellationInfo(supabase, dispute.provider_name);
    providerEmail = info?.email ?? null;
  }
  const senderDomain = extractDomain(providerEmail);

  // Auto-link Watchdog when we can. Same pattern as the subscriptions
  // endpoint: insert a domain-scoped row so the sync-runner polls the
  // inbox for replies from that domain and imports them as dispute
  // correspondence. thread_id stays null because the user sent via
  // their native email client, outside our OAuth.
  let watchdogLinked = false;
  if (senderDomain) {
    const { data: emailConn } = await supabase
      .from('email_connections')
      .select('id, provider_type')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emailConn) {
      // dispute_watchdog_links CHECK constraints require provider ∈
      // (gmail, outlook, imap) and match_source ∈ (user_confirmed,
      // auto_domain, auto_ai). email_connections.provider_type uses
      // 'google' rather than 'gmail', so normalise before insert.
      const providerMap: Record<string, 'gmail' | 'outlook' | 'imap'> = {
        google: 'gmail', gmail: 'gmail',
        outlook: 'outlook', microsoft: 'outlook',
        imap: 'imap',
      };
      const normalisedProvider = providerMap[emailConn.provider_type as string] ?? 'imap';

      const { error: linkErr } = await supabase
        .from('dispute_watchdog_links')
        .insert({
          dispute_id: disputeId,
          user_id: user.id,
          email_connection_id: emailConn.id,
          provider: normalisedProvider,
          thread_id: null,
          sender_domain: senderDomain,
          sync_enabled: true,
          match_source: 'auto_domain',
          match_confidence: 0.7,
        });
      if (linkErr) {
        console.error('[disputes.letter-sent] watchdog link failed:', linkErr.message);
      } else {
        watchdogLinked = true;
      }
    }
  }

  // Persist what was actually sent. The future reply-thread sync needs
  // this so the AI follow-up generator (and the user themselves) can
  // see "here's exactly what you sent on date X" rather than guessing
  // from the original AI draft (which may have been edited).
  if (letterContent && letterContent.length > 50) {
    const { error: corrErr } = await supabase
      .from('correspondence')
      .insert({
        dispute_id: disputeId,
        user_id: user.id,
        entry_type: 'letter_sent',
        title: edited ? 'Letter sent (edited from AI draft)' : 'Letter sent',
        content: letterContent.slice(0, 100_000), // text column is generous; cap defensively
        sender_address: providerEmail,
        entry_date: new Date().toISOString(),
        detected_from_email: false,
      });
    if (corrErr) {
      console.error('[disputes.letter-sent] correspondence insert failed:', corrErr.message);
      // Non-fatal — the dispute is still flipped to awaiting_response.
    }
  }

  return NextResponse.json({
    ok: true,
    dispute_id: disputeId,
    watchdog_link_created: watchdogLinked,
    sender_domain: senderDomain,
    provider_email: providerEmail,
    letter_archived: !!(letterContent && letterContent.length > 50),
  });
}
