import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getHostedConsentRequest, getAccounts, getInstitution } from '@/lib/yapily';
import { snapshotAccounts, upsertYapilyConnection } from '@/lib/yapily/connection-store';
import { handleYapilyError } from '@/lib/yapily/error-handler';

/**
 * GET /api/cron/yapily-consent-poll
 *
 * Migle's T4 — fallback polling mechanism.
 *
 * Runs every minute (vercel.json). Finds bank_connections rows that:
 *   - have consent_status = 'pending'
 *   - were created more than 3 minutes ago (pending_started_at < now - 3min)
 *   - are due to be polled, where the next-poll interval is computed as
 *     min(60s * 2^poll_attempts, 600s) since last_polled_at
 *
 * For each candidate it calls GET /hosted/consent-requests/{hostedConsentId}
 * and:
 *   - on AUTHORIZED → fetches accounts, runs the same upsert path the
 *     happy-path callback uses, marks status='active' / consent_status='AUTHORIZED'
 *   - on REJECTED / REVOKED / FAILED / EXPIRED → marks status='revoked'
 *     and consent_status to the upstream value
 *   - otherwise → bumps poll_attempts + last_polled_at and tries again
 *     on the next tick (exponential backoff)
 *
 * Idempotency: every step is a single Supabase update keyed by id, and
 * upsertYapilyConnection is itself dedup-aware. Two ticks racing on the
 * same row at worst do duplicated work, never duplicate connections.
 */
export const maxDuration = 60;

const MIN_PENDING_MS = 3 * 60 * 1000;       // 3 minutes
const BACKOFF_BASE_MS = 60 * 1000;          // 60 s
const BACKOFF_MAX_MS = 10 * 60 * 1000;      // 10 min cap
const MAX_PER_TICK = 25;                    // safety bound

const TERMINAL_STATUSES = new Set(['AUTHORIZED', 'REJECTED', 'REVOKED', 'FAILED', 'EXPIRED']);

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function nextPollDueAt(pollAttempts: number, lastPolledAt: string | null): number {
  const intervalMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(0, pollAttempts)), BACKOFF_MAX_MS);
  const last = lastPolledAt ? new Date(lastPolledAt).getTime() : 0;
  return last + intervalMs;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = Date.now();

  // Find pending hosted-flow rows older than 3 min (any provider — we
  // filter to provider='yapily' anyway).
  const { data: pending, error: queryErr } = await supabase
    .from('bank_connections')
    .select('id, user_id, institution_id, hosted_consent_id, pending_started_at, last_polled_at, poll_attempts')
    .eq('consent_status', 'pending')
    .eq('provider', 'yapily')
    .not('hosted_consent_id', 'is', null)
    .lt('pending_started_at', new Date(now - MIN_PENDING_MS).toISOString())
    .order('pending_started_at', { ascending: true })
    .limit(MAX_PER_TICK);

  if (queryErr) {
    console.error('[yapily.consent-poll] query failed:', queryErr.message);
    return NextResponse.json({ ok: false, error: queryErr.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, polled: 0 });
  }

  let polled = 0;
  let terminated = 0;
  let authorised = 0;
  let still_pending = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const row of pending) {
    const attempts = typeof row.poll_attempts === 'number' ? row.poll_attempts : 0;
    if (now < nextPollDueAt(attempts, row.last_polled_at)) {
      // Not due yet under exponential backoff.
      continue;
    }

    polled++;
    let hostedStatus: string | null = null;
    let consentToken: string | undefined;
    let yapilyConsentId: string | undefined;

    try {
      const result = await getHostedConsentRequest(row.hosted_consent_id);
      hostedStatus = result.status;
      consentToken = result.consentToken;
      yapilyConsentId = result.consentId;
    } catch (err) {
      await handleYapilyError(err, { source: 'cron.consent-poll', connectionId: row.id });
      failures.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
      // Bump attempts so backoff applies to upstream errors too.
      await supabase
        .from('bank_connections')
        .update({
          last_polled_at: new Date(now).toISOString(),
          poll_attempts: attempts + 1,
        })
        .eq('id', row.id);
      continue;
    }

    if (hostedStatus === 'AUTHORIZED' && consentToken) {
      // Run the same promotion path the happy-path callback uses.
      try {
        const accounts = await getAccounts(consentToken);
        if (accounts.length === 0) {
          // Authorised but no accounts — treat as failed-soft so the
          // user sees a consistent error message.
          await supabase
            .from('bank_connections')
            .update({
              consent_status: 'FAILED',
              status: 'revoked',
              last_polled_at: new Date(now).toISOString(),
              poll_attempts: attempts + 1,
            })
            .eq('id', row.id);
          terminated++;
          continue;
        }

        const accountSnapshots = snapshotAccounts(accounts);
        const consentExpiresAt = new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
        let institutionFeatures: string[] | null = null;
        try {
          const inst = await getInstitution(row.institution_id);
          institutionFeatures = inst?.features ?? null;
        } catch {
          /* non-fatal */
        }

        await upsertYapilyConnection({
          userId: row.user_id,
          institutionId: row.institution_id,
          bankName: accounts[0]?.institution?.name || null,
          consentToken,
          yapilyConsentId: yapilyConsentId || '',
          consentExpiresAt,
          accounts: accountSnapshots,
          hostedConsentId: row.hosted_consent_id,
          institutionFeatures: institutionFeatures || undefined,
        });

        // upsert sets status='active' + consent_status='AUTHORIZED'
        // already; just bump the poll-attempt counter for observability.
        await supabase
          .from('bank_connections')
          .update({
            last_polled_at: new Date(now).toISOString(),
            poll_attempts: attempts + 1,
          })
          .eq('id', row.id);

        // Trigger the initial-sync the same way the callback does.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
        fetch(`${appUrl}/api/yapily/initial-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            connectionId: row.id,
            userId: row.user_id,
            consentToken,
            accountSnapshots,
          }),
        }).catch((err) => console.error('[yapily.consent-poll] initial-sync trigger failed:', err));

        authorised++;
      } catch (err) {
        await handleYapilyError(err, {
          source: 'cron.consent-poll.promote',
          connectionId: row.id,
        });
        failures.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
      }
      continue;
    }

    if (hostedStatus && TERMINAL_STATUSES.has(hostedStatus)) {
      // REJECTED / REVOKED / FAILED / EXPIRED — connection is dead.
      await supabase
        .from('bank_connections')
        .update({
          consent_status: hostedStatus,
          status: 'revoked',
          last_polled_at: new Date(now).toISOString(),
          poll_attempts: attempts + 1,
        })
        .eq('id', row.id);
      terminated++;
      continue;
    }

    // Intermediate (e.g. AWAITING_USER_ACTION) — backoff and retry next tick.
    await supabase
      .from('bank_connections')
      .update({
        last_polled_at: new Date(now).toISOString(),
        poll_attempts: attempts + 1,
      })
      .eq('id', row.id);
    still_pending++;
  }

  return NextResponse.json({
    ok: true,
    polled,
    authorised,
    terminated,
    still_pending,
    failures,
  });
}
