import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccounts, getHostedConsentRequest } from '@/lib/yapily';
import { snapshotAccounts, upsertYapilyConnection } from '@/lib/yapily/connection-store';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Hosted Pages fallback poller (Yapily build review, test step 4).
 *
 * The scenario this exists for: the user completes authorisation at
 * their bank, but the redirect back to us never lands — they close the
 * tab, lose signal, or the browser drops the callback. From our side it
 * looks like nothing happened. Yapily, however, knows the consent was
 * authorised. Without this poller that user silently ends up with no
 * bank connection despite having granted consent.
 *
 * Yapily's stated requirement:
 *   - If no redirect callback within 3 MINUTES, start polling
 *     GET /hosted/consent-requests/{hostedConsentId}.
 *   - STOP on terminal states: AUTHORIZED, REJECTED, REVOKED, FAILED,
 *     EXPIRED.
 *   - Retry intermediate states with EXPONENTIAL BACKOFF.
 *
 * How each of those is met here:
 *
 *   3-minute trigger — POLL_FLOOR_MS below, and this route is scheduled
 *   in vercel.json at '* * * * *' (every minute) so the floor is
 *   actually reachable. A 5-minute cron could never satisfy a 3-minute
 *   requirement.
 *
 *   Terminal states — TERMINAL_STATUSES. EXPIRED is included and is
 *   recorded distinctly in yapily_status, so an expired request stays
 *   distinguishable from a user who simply walked away ('abandoned').
 *
 *   Exponential backoff — poll_attempts / next_poll_at columns. Each
 *   non-terminal poll schedules the next one at 5s × 2^attempts,
 *   capped at 180s. The curve is directly inspectable in SQL:
 *     select consent_request_id, poll_attempts, next_poll_at
 *     from yapily_pending_consent_requests where status='pending';
 *
 *   Recovery — the AUTHORIZED branch now COMPLETES the connection
 *   rather than logging for ops. An earlier version claimed this was
 *   impossible without the user's session cookie; that was wrong. This
 *   route holds a service-role client, and the pending row carries both
 *   user_id and institution_id, which is everything
 *   upsertYapilyConnection needs. Recovering the connection here is the
 *   entire point of the fallback — detecting the authorisation and then
 *   doing nothing with it satisfies nobody.
 *
 * Past FIFTEEN_MIN_MS with no resolution, a request is abandoned.
 *
 * This route is idempotent — re-running it is safe. Rows that already
 * resolved are excluded by the status filter.
 *
 * Auth: Bearer ${CRON_SECRET}, same pattern as the other crons.
 */

/** Yapily's stated fallback trigger: no callback within 3 minutes. */
const POLL_FLOOR_MS = 3 * 60 * 1000;
/** Past this age an unresolved request is treated as abandoned. */
const ABANDON_AFTER_MS = 15 * 60 * 1000;
/** Backoff base — first retry 5s after the floor, then 10s, 20s, 40s… */
const BACKOFF_BASE_MS = 5_000;
/** Backoff ceiling, so late attempts don't drift past the abandon window. */
const BACKOFF_MAX_MS = 180_000;
/** Safety valve on rows handled per tick — the cron runs every minute. */
const MAX_ROWS_PER_TICK = 50;

/**
 * Terminal states per the build review. Reaching any of these stops
 * polling permanently for that request.
 */
const TERMINAL_STATUSES = new Set([
  'AUTHORIZED',
  'AUTHORISED',
  'REJECTED',
  'REVOKED',
  'FAILED',
  'EXPIRED',
]);

/** Terminal states that mean the journey did NOT succeed. */
const TERMINAL_FAILURE_STATUSES = new Set([
  'REJECTED',
  'REVOKED',
  'FAILED',
  'EXPIRED',
]);

function nextBackoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempts), BACKOFF_MAX_MS);
}

interface PendingRow {
  id: string;
  consent_request_id: string;
  user_id: string;
  institution_id: string;
  poll_attempts: number | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  const pollFloor = new Date(now.getTime() - POLL_FLOOR_MS).toISOString();
  const abandonCutoff = new Date(now.getTime() - ABANDON_AFTER_MS).toISOString();

  let polled = 0;
  let markedAbandoned = 0;
  let markedFailed = 0;
  let recovered = 0;
  let recoveryFailed = 0;
  let backedOff = 0;

  // ── Step 1: find pending rows that are due a poll ──
  // Due means: older than the 3-minute floor, younger than the abandon
  // window, and either never polled or past their backoff time.
  const { data: duePending, error: dueErr } = await admin
    .from('yapily_pending_consent_requests')
    .select('id, consent_request_id, user_id, institution_id, poll_attempts')
    .eq('status', 'pending')
    .lte('created_at', pollFloor)
    .gt('created_at', abandonCutoff)
    .or(`next_poll_at.is.null,next_poll_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS_PER_TICK);

  if (dueErr) {
    console.error('[yapily.abandonment] due-pending lookup failed:', dueErr.message);
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 });
  }

  for (const row of (duePending ?? []) as PendingRow[]) {
    polled++;
    const attempts = row.poll_attempts ?? 0;

    try {
      const hosted = await getHostedConsentRequest(row.consent_request_id);
      const status = (hosted.status || '').toUpperCase();

      const updates: Record<string, unknown> = {
        last_polled_at: nowIso,
        yapily_status: hosted.status ?? null,
        poll_attempts: attempts + 1,
      };

      // Terminal means STOP POLLING, per the build review. Everything
      // else is still in flight and gets backed off.
      const isTerminal = TERMINAL_STATUSES.has(status);

      if (isTerminal && TERMINAL_FAILURE_STATUSES.has(status)) {
        // Terminal and unsuccessful — stop polling. yapily_status keeps
        // EXPIRED distinguishable from a user-abandoned request.
        updates.status = 'failed';
        updates.resolved_at = nowIso;
        updates.next_poll_at = null;
        markedFailed++;
        console.log(
          `[yapily.abandonment] consentRequestId=${row.consent_request_id} terminal status=${status} — stopped polling`,
        );
      } else if (isTerminal) {
        // ── Terminal AND successful (AUTHORIZED): recover the connection ──
        // The user authorised at their bank but never made it back to
        // our callback. Everything needed to finish the job is on this
        // row plus the hosted consent record.
        const consentToken = hosted.consentToken;
        const yapilyConsentId = hosted.consentId;

        if (!consentToken || !yapilyConsentId) {
          // AUTHORIZED but Yapily hasn't surfaced the credentials yet.
          // Treat as non-terminal and back off — they appear shortly.
          const delay = nextBackoffMs(attempts);
          updates.next_poll_at = new Date(now.getTime() + delay).toISOString();
          backedOff++;
          console.warn(
            `[yapily.abandonment] consentRequestId=${row.consent_request_id} AUTHORIZED but token/consentId missing — retrying in ${delay}ms`,
          );
        } else {
          try {
            const accounts = await getAccounts(consentToken);
            if (accounts.length === 0) {
              throw new Error('consent authorised but /accounts returned no accounts');
            }

            const accountSnapshots = snapshotAccounts(accounts);
            // Same 90-day UK consent clock the callback stamps, so a
            // recovered connection ages identically to a normal one.
            const consentExpiresAt = new Date(
              now.getTime() + 90 * 24 * 60 * 60 * 1000,
            ).toISOString();
            // Same derivation as the callback so a recovered connection
            // is named identically to one created the normal way.
            const bankName = accounts[0]?.institution?.name || row.institution_id;

            await upsertYapilyConnection({
              userId: row.user_id,
              institutionId: row.institution_id,
              bankName,
              consentToken,
              yapilyConsentId,
              yapilyConsentRequestId: row.consent_request_id,
              consentExpiresAt,
              accounts: accountSnapshots,
            });

            updates.status = 'completed';
            updates.resolved_at = nowIso;
            updates.next_poll_at = null;
            recovered++;
            console.log(
              `[yapily.abandonment] RECOVERED connection for user=${row.user_id} institution=${row.institution_id} consentRequestId=${row.consent_request_id} accounts=${accounts.length} — callback never arrived`,
            );
          } catch (recoveryErr) {
            // Don't mark the row resolved; back off and try again so a
            // transient failure here doesn't strand a valid consent.
            const delay = nextBackoffMs(attempts);
            updates.next_poll_at = new Date(now.getTime() + delay).toISOString();
            recoveryFailed++;
            console.error(
              `[yapily.abandonment] recovery FAILED for consentRequestId=${row.consent_request_id}:`,
              recoveryErr instanceof Error ? recoveryErr.message : recoveryErr,
            );
          }
        }
      } else {
        // Intermediate state (INITIATED, AUTHORISATION_CREATED,
        // CONSENT_POLLING_STARTED, …) — the user is still mid-journey.
        // Back off exponentially rather than polling every tick.
        const delay = nextBackoffMs(attempts);
        updates.next_poll_at = new Date(now.getTime() + delay).toISOString();
        backedOff++;
      }

      const { error: updErr } = await admin
        .from('yapily_pending_consent_requests')
        .update(updates)
        .eq('id', row.id);
      if (updErr) {
        console.error(`[yapily.abandonment] row update failed for ${row.id}: ${updErr.message}`);
      }
    } catch (err) {
      // The poll itself failed (network, Yapily 5xx). Back off so a
      // Yapily outage doesn't turn into a per-minute retry storm — note
      // yapilyRequest already retried 429/5xx internally before throwing.
      const msg = err instanceof Error ? err.message : 'unknown';
      const delay = nextBackoffMs(attempts);
      console.error(`[yapily.abandonment] poll failed for ${row.consent_request_id}: ${msg}`);
      await admin
        .from('yapily_pending_consent_requests')
        .update({
          last_polled_at: nowIso,
          poll_attempts: attempts + 1,
          next_poll_at: new Date(now.getTime() + delay).toISOString(),
        })
        .eq('id', row.id);
      backedOff++;
    }
  }

  // ── Step 2: any pending row older than the abandon window is done ──
  const { data: stale, error: staleErr } = await admin
    .from('yapily_pending_consent_requests')
    .select('id')
    .eq('status', 'pending')
    .lte('created_at', abandonCutoff);

  if (staleErr) {
    console.error('[yapily.abandonment] stale lookup failed:', staleErr.message);
  } else if (stale && stale.length > 0) {
    const ids = stale.map((r: { id: string }) => r.id);
    const { error: bulkErr } = await admin
      .from('yapily_pending_consent_requests')
      .update({ status: 'abandoned', resolved_at: nowIso, next_poll_at: null })
      .in('id', ids);
    if (bulkErr) {
      console.error('[yapily.abandonment] bulk abandon update failed:', bulkErr.message);
    } else {
      markedAbandoned = ids.length;
    }
  }

  console.log(
    `[yapily.abandonment] complete — polled=${polled} recovered=${recovered} recoveryFailed=${recoveryFailed} backedOff=${backedOff} failed=${markedFailed} abandoned=${markedAbandoned}`,
  );

  return NextResponse.json({
    ok: true,
    polled,
    recovered,
    recoveryFailed,
    backedOff,
    markedFailed,
    markedAbandoned,
  });
}
