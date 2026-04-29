import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getHostedConsentRequest } from '@/lib/yapily';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Hosted Pages abandonment poller.
 *
 * Spec source: Vitally checklist GH2 + Hosted Pages tutorial step 4.
 *   - Start polling /hosted/consent-requests/{id} 5 minutes after the
 *     hosted URL was issued, if no callback received.
 *   - Poll every 5–10 seconds until status resolves OR 15 minutes elapse.
 *   - Past 15 minutes, treat as abandoned.
 *
 * Implementation note on cadence: a Vercel cron tick gives us a 5-minute
 * floor, not seconds-level polling. That's fine for our purposes —
 * abandonment handling is non-realtime housekeeping. The "every 5–10s"
 * recommendation matters for client-side polling during an active
 * journey; for server-side reconciliation a 5-minute cron is enough.
 *
 * The cron does three things on each tick:
 *   1. Find pending requests aged 5–15 minutes → poll Yapily once. If
 *      AUTHORIZED but no callback ever arrived (rare; user closed the
 *      tab between bank-side success and our callback), log it. Without
 *      a state cookie we can't safely auto-create the connection on
 *      their behalf — surface this for ops review.
 *   2. Find pending requests aged > 15 minutes → mark abandoned.
 *   3. Fold any FAILED / REJECTED / REVOKED responses into the row's
 *      status so the funnel-analysis surface is honest.
 *
 * This route is idempotent — re-running it is safe.
 *
 * Auth: Bearer ${CRON_SECRET}, same pattern as the other crons.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  let polled = 0;
  let markedAbandoned = 0;
  let markedFailed = 0;
  let authoredButNoCallback = 0;

  // ── Step 1: poll the still-young pending rows ──
  const { data: youngPending, error: youngErr } = await admin
    .from('yapily_pending_consent_requests')
    .select('id, consent_request_id, user_id')
    .eq('status', 'pending')
    .lte('created_at', fiveMinAgo)
    .gt('created_at', fifteenMinAgo);

  if (youngErr) {
    console.error('[yapily.abandonment] young-pending lookup failed:', youngErr.message);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }

  for (const row of youngPending ?? []) {
    polled++;
    try {
      const hosted = await getHostedConsentRequest(row.consent_request_id);
      const status = (hosted.status || '').toUpperCase();
      const updates: Record<string, unknown> = {
        last_polled_at: now.toISOString(),
        yapily_status: hosted.status ?? null,
      };

      if (status === 'FAILED' || status === 'REVOKED' || status === 'REJECTED') {
        updates.status = 'failed';
        updates.resolved_at = now.toISOString();
        markedFailed++;
      } else if (status === 'AUTHORIZED' || status === 'AUTHORISED') {
        // Yapily reports success but our callback never persisted a
        // connection. The user likely closed the tab between bank-side
        // success and our callback. We CAN'T auto-create the connection
        // without their session cookie — log so ops can reach out.
        authoredButNoCallback++;
        console.warn(
          `[yapily.abandonment] consentRequestId=${row.consent_request_id} user=${row.user_id} authorised but no callback — flagged for ops`,
        );
      }
      // else: still in flight, leave as 'pending'.

      const { error: updErr } = await admin
        .from('yapily_pending_consent_requests')
        .update(updates)
        .eq('id', row.id);
      if (updErr) {
        console.error(`[yapily.abandonment] row update failed for ${row.id}: ${updErr.message}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[yapily.abandonment] poll failed for ${row.consent_request_id}: ${msg}`);
    }
  }

  // ── Step 2: any pending row older than 15 min is abandoned ──
  const { data: stale, error: staleErr } = await admin
    .from('yapily_pending_consent_requests')
    .select('id')
    .eq('status', 'pending')
    .lte('created_at', fifteenMinAgo);

  if (staleErr) {
    console.error('[yapily.abandonment] stale lookup failed:', staleErr.message);
  } else if (stale && stale.length > 0) {
    const ids = stale.map((r: { id: string }) => r.id);
    const { error: bulkErr } = await admin
      .from('yapily_pending_consent_requests')
      .update({ status: 'abandoned', resolved_at: now.toISOString() })
      .in('id', ids);
    if (bulkErr) {
      console.error('[yapily.abandonment] bulk abandon update failed:', bulkErr.message);
    } else {
      markedAbandoned = ids.length;
    }
  }

  console.log(
    `[yapily.abandonment] complete — polled=${polled} abandoned=${markedAbandoned} failed=${markedFailed} no_callback_logged=${authoredButNoCallback}`,
  );

  return NextResponse.json({
    ok: true,
    polled,
    markedAbandoned,
    markedFailed,
    authoredButNoCallback,
  });
}
