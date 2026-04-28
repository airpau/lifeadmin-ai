/**
 * GET /api/disputes/[id]/suggest-threads
 *
 * Returns up to 3 candidate email threads from the user's connected inbox
 * that might correspond to this dispute. Used by the "Find thread" modal on
 * the dispute detail page (Watchdog feature).
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §5
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findThreadCandidates } from '@/lib/dispute-sync/matcher';
import type { EmailConnection } from '@/lib/dispute-sync/types';

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Dispute ownership + fetch the fields the matcher needs
  const { data: dispute, error: dErr } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, issue_summary, created_at')
    .eq('id', disputeId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (dErr) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  // Fetch the user's active email connection(s). If they have more than one,
  // we return a merged list across all of them.
  const { data: connections, error: cErr } = await supabase
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (cErr) {
    return NextResponse.json({ error: 'Failed to load email connections' }, { status: 500 });
  }
  if (!connections || connections.length === 0) {
    return NextResponse.json({
      candidates: [],
      error: 'no_email_connection',
      message: 'Connect an email account first to watch for replies.',
    });
  }

  const allCandidates: Array<{ candidate: Awaited<ReturnType<typeof findThreadCandidates>>[number]; connectionId: string }> = [];
  const errors: Array<{ connectionId: string; message: string }> = [];

  for (const conn of connections as EmailConnection[]) {
    try {
      const cands = await findThreadCandidates(conn, dispute, 5);
      for (const c of cands) {
        allCandidates.push({ candidate: c, connectionId: conn.id });
      }
    } catch (err) {
      errors.push({
        connectionId: conn.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Sort across connections and take top 5 (was 3 — close cases like
  // "today's reply with 1 message" vs "old multi-message thread"
  // were being lost when only the top 3 were shown).
  allCandidates.sort(
    (a, b) =>
      b.candidate.confidence - a.candidate.confidence ||
      b.candidate.latestDate.getTime() - a.candidate.latestDate.getTime(),
  );

  return NextResponse.json({
    candidates: allCandidates.slice(0, 5).map((a) => ({
      connectionId: a.connectionId,
      provider: a.candidate.provider,
      threadId: a.candidate.threadId,
      subject: a.candidate.subject,
      senderAddress: a.candidate.senderAddress,
      senderDomain: a.candidate.senderDomain,
      latestDate: a.candidate.latestDate.toISOString(),
      messageCount: a.candidate.messageCount,
      snippet: a.candidate.snippet,
      confidence: a.candidate.confidence,
      reason: a.candidate.reason,
    })),
    errors: errors.length ? errors : undefined,
  });
}
