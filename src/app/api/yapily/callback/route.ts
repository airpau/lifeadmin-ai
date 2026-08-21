import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getAccounts, getHostedConsentRequest, getConsent } from '@/lib/yapily';
import { snapshotAccounts, upsertYapilyConnection } from '@/lib/yapily/connection-store';
import { assignSyncOffsetMinutes, computeNextSyncAt } from '@/lib/yapily/sync-scheduler';

/**
 * GET /api/yapily/callback?consent=xxx&consent-id=xxx&state=xxx
 *
 * Yapily redirects here after the user grants (or re-grants) consent
 * at their bank. The flow is intentionally idempotent:
 *
 *   1. Validate state (CSRF) and consent token.
 *   2. Fetch the linked accounts via Yapily /accounts.
 *   3. Compute account_identifications_hash for each account from the
 *      bank's sort code + account number (UK) or IBAN (EU). These
 *      hashes are stable across reconnects.
 *   4. Hand off to upsertYapilyConnection — that helper looks for an
 *      existing live connection for this (user, institution, hashes)
 *      and either updates it in place or inserts a new row. If the
 *      user just re-authorised the same bank, we never end up with two
 *      rows.
 *   5. Trigger an initial 12-month sync in the background.
 *   6. Redirect back to the dashboard.
 *
 * The callback's job is purely orchestration; the dedup invariants live
 * in connection-store.ts so the bank-sync cron can reuse them.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Hosted Pages returns ONLY consentRequestId on the redirect — the
  // consentToken comes from GET /hosted/consent-requests/{id} below.
  // Legacy /account-auth-requests returns ?consent=<token>&consent-id=<id>.
  // We detect which mode we're in by which params are present.
  const consentRequestId =
    searchParams.get('consentRequestId') ||
    searchParams.get('consent-request-id') ||
    '';
  let consentToken = searchParams.get('consent') || '';
  let yapilyConsentId =
    searchParams.get('consent-id') ||
    searchParams.get('consentId') ||
    (consentRequestId ? '' : searchParams.get('id') || '') ||
    '';
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ── Handle bank-side errors ──
  //
  // Build review step 3: "error parameters are captured and logged".
  // Capturing the whole query string matters — Yapily and the banks put
  // the useful detail in error_description / error_source, and reading
  // only `error` threw that away. Persisting it matters too: console
  // logs are ephemeral, so before this the pending row sat at 'pending'
  // forever and there was no queryable record that a user had failed to
  // connect.
  if (errorParam) {
    const detail = Object.fromEntries(searchParams.entries());
    console.error('[yapily.callback] error redirect:', JSON.stringify(detail));

    if (consentRequestId) {
      try {
        const admin = createAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        await admin
          .from('yapily_pending_consent_requests')
          .update({
            status: 'failed',
            yapily_status: errorParam,
            error_detail: detail,
            resolved_at: new Date().toISOString(),
            next_poll_at: null,
          })
          .eq('consent_request_id', consentRequestId);
      } catch (persistErr) {
        // Never let bookkeeping block the user's redirect — they still
        // need to land somewhere with an error they can act on.
        console.error('[yapily.callback] failed to persist error detail:', persistErr);
      }
    }

    return NextResponse.redirect(
      new URL(`/dashboard/money-hub?error=bank_auth_failed&reason=${encodeURIComponent(errorParam)}`, request.url),
    );
  }

  // We need either a consentToken (legacy) or a consentRequestId (hosted)
  // and always need state for CSRF.
  if ((!consentToken && !consentRequestId) || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=invalid_callback', request.url),
    );
  }

  // ── Verify user auth ──
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // ── Verify state (CSRF check) ──
  let stateData: { userId: string; institutionId?: string; returnTo?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=state_mismatch', request.url),
    );
  }
  if (stateData.userId !== user.id) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=state_mismatch', request.url),
    );
  }

  // ── Which bank did the user actually pick? ───────────────────────
  //
  // Since the 2026-08-21 cutover to Yapily's own bank picker, we
  // usually DON'T know the institution when we build `state` — the user
  // hasn't chosen yet. So this is now a best-known value that gets
  // refined as the callback learns more, in order of authority:
  //
  //   1. state            — only set on a deep link that named a bank
  //   2. hosted consent   — institutionIdentifiers.institutionId, i.e.
  //                         what the user selected in Yapily's UI
  //   3. accounts[0]      — the institution attached to the returned
  //                         accounts; the ultimate ground truth, and
  //                         free, because we fetch accounts anyway
  //
  // `let`, not `const`: 2 and 3 overwrite it below.
  let institutionId = stateData.institutionId || '';
  const returnTo = stateData.returnTo || '/dashboard/money-hub';

  // ── Hosted Pages: resolve consentToken + consentId from consentRequestId ──
  // On the legacy flow Yapily puts both in the redirect query. On Hosted
  // Pages we get only consentRequestId — fetch the rest before continuing.
  // Tutorial step 4: check status before proceeding.
  //
  // Schema (verified against Yapily OpenAPI 12.3.4 on 29 Apr 2026):
  //   data.consentRequestId  — the request handle (already in our query)
  //   data.consentId         — the underlying consent identifier; the
  //                             same shape /account-auth-requests/{id}
  //                             accepts. THIS is what we persist into
  //                             bank_connections.yapily_consent_id so
  //                             renew + delete keep working.
  //   data.consentToken      — the credential we attach to data calls.
  //   data.status            — AUTHORIZED once the user has completed
  //                             the bank-side flow.
  // Yapily's Hosted Pages redirect can include BOTH a `consent` token
  // AND consentRequestId in the query string. The query-param token is
  // not always a valid consentToken for /accounts calls (sometimes it's
  // a one-time-token); regardless, we still need to fetch the consent
  // details because the underlying `consentId` (used by extend + delete
  // via /consents/{id}) is ONLY available via getHostedConsentRequest.
  // So whenever consentRequestId is present, fetch unconditionally and
  // overwrite both consentToken and yapilyConsentId with authoritative
  // values from Yapily.
  if (consentRequestId) {
    try {
      const hosted = await getHostedConsentRequest(consentRequestId);
      const hostedStatus = (hosted.status || '').toUpperCase();
      if (hostedStatus !== 'AUTHORIZED' && hostedStatus !== 'AUTHORISED') {
        console.warn(
          `[yapily.callback] hosted consent ${consentRequestId} status=${hostedStatus} — redirecting user back to retry`,
        );
        return NextResponse.redirect(
          new URL(`/dashboard/money-hub?error=hosted_consent_${hostedStatus.toLowerCase() || 'unknown'}`, request.url),
        );
      }
      if (!hosted.consentToken) {
        console.error(`[yapily.callback] hosted consent ${consentRequestId} authorised but no consentToken returned`);
        return NextResponse.redirect(
          new URL('/dashboard/money-hub?error=hosted_consent_token_missing', request.url),
        );
      }
      if (!hosted.consentId) {
        // AUTHORIZED responses MUST carry consentId per OpenAPI 12.3.4.
        // If Yapily ever returns AUTHORIZED without one, we bail rather
        // than persist the consentRequestId in the wrong slot — the
        // renew + disconnect flows would silently break otherwise.
        console.error(`[yapily.callback] hosted consent ${consentRequestId} authorised but no consentId returned`);
        return NextResponse.redirect(
          new URL('/dashboard/money-hub?error=hosted_consent_id_missing', request.url),
        );
      }
      consentToken = hosted.consentToken;
      yapilyConsentId = hosted.consentId;

      // Source 2: the bank the user chose in Yapily's picker. Only
      // overwrite when Yapily actually tells us — a deep-linked
      // institutionId from `state` is still better than nothing.
      const hostedInstitutionId = hosted.institutionIdentifiers?.institutionId;
      if (hostedInstitutionId) institutionId = hostedInstitutionId;
    } catch (err) {
      console.error(`[yapily.callback] hosted consent fetch failed for ${consentRequestId}:`, err);
      return NextResponse.redirect(
        new URL('/dashboard/money-hub?error=hosted_consent_fetch_failed', request.url),
      );
    }
  }

  if (!consentToken) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=invalid_callback', request.url),
    );
  }

  // ── Fetch the accounts the user just authorised ──
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  try {
    accounts = await getAccounts(consentToken);
  } catch (err) {
    console.error('Failed to fetch Yapily accounts:', err);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=account_fetch_failed', request.url),
    );
  }

  if (accounts.length === 0) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=no_accounts', request.url),
    );
  }

  const accountSnapshots = snapshotAccounts(accounts);

  // POT-only edge case: a Monzo consent that returned only POT accounts
  // would otherwise persist a "connected" bank with empty account_ids
  // and trigger a no-op initial sync, leaving the user with a ghost
  // connection that can never produce transactions.
  if (accountSnapshots.length === 0) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=no_usable_accounts', request.url),
    );
  }

  // Source 3, and the authoritative one: the institution attached to
  // the accounts Yapily just returned. Free — we already made this call.
  // This is what makes the hosted picker safe: even if Yapily's response
  // shape changes or institutionIdentifiers comes back empty, we never
  // persist a connection whose institution_id we had to guess.
  const resolvedInstitutionId = accounts[0]?.institution?.id || institutionId;
  if (!resolvedInstitutionId) {
    // Would previously have written an empty institution_id, which
    // silently breaks the feature-capability gate in sync-upcoming.
    console.error(
      `[yapily.callback] could not resolve an institution for user=${user.id} consentRequestId=${consentRequestId || 'n/a'}`,
    );
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=institution_unresolved', request.url),
    );
  }
  institutionId = resolvedInstitutionId;

  const bankName = accounts[0]?.institution?.name || institutionId;

  // ── 90-day UK consent expiry ──
  const consentExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── Persist via the dedup-aware store ──
  let upsertResult;
  try {
    upsertResult = await upsertYapilyConnection({
      userId: user.id,
      institutionId,
      bankName,
      consentToken,
      yapilyConsentId,
      yapilyConsentRequestId: consentRequestId || null,
      consentExpiresAt,
      accounts: accountSnapshots,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[yapily.callback] upsert failed:', msg);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=save_failed', request.url),
    );
  }

  console.log(
    `[yapily.callback] ${upsertResult.reused ? 'reused' : 'inserted'} connection ${upsertResult.connectionId}` +
    (upsertResult.previousConnectionIds.length ? ` (demoted ${upsertResult.previousConnectionIds.length} stale rows)` : ''),
  );

  // ── Record consent metadata + schedule the connection ────────────
  //
  // Two jobs, one UPDATE, both best-effort — a failure here degrades
  // scheduling and reporting but must never cost the user a connection
  // they just successfully authorised at their bank.
  //
  // 1. CONSENT METADATA. We now create consents WITHOUT a featureScope
  //    (Migle, 2026-08-21), which means the bank decides what the
  //    consent covers and the consent object is the only record of it.
  //    Capturing featureScope here is what lets sync-upcoming gate on
  //    what was actually granted rather than on what the institution
  //    advertises in general. We also take Yapily's own expiresAt and
  //    reconfirmBy in preference to the `now + 90 days` we computed
  //    above — that local guess is a fallback, not the truth.
  //
  // 2. STAGGER SLOT. Assign this connection a position in the 4-hour
  //    refresh cycle, offset from the user's existing connections so
  //    their banks refresh roughly 75 minutes apart rather than all at
  //    once on the same consent-adjacent burst. See
  //    src/lib/yapily/sync-scheduler.ts.
  try {
    const adminSched = createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Index among the user's other live connections. Counting rows
    // OTHER than this one gives 0 for a first bank, 1 for a second, and
    // so on — which is exactly the slot index the offset helper wants.
    const { count: siblingCount } = await adminSched
      .from('bank_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('provider', 'yapily')
      .is('deleted_at', null)
      .is('archived_at', null)
      .neq('id', upsertResult.connectionId);

    const offset = assignSyncOffsetMinutes(user.id, siblingCount ?? 0);

    const scheduleUpdate: Record<string, unknown> = {
      sync_offset_minutes: offset,
      next_sync_at: computeNextSyncAt(offset).toISOString(),
      // A fresh authorisation re-opens the once-per-consent endpoints
      // and invalidates anything we previously learned was unsupported
      // (the bank may have shipped support, or the old consent may
      // simply not have covered it).
      upcoming_endpoints_fetched_at: null,
      unsupported_features: [],
    };

    if (yapilyConsentId) {
      try {
        const consent = await getConsent(yapilyConsentId);
        if (Array.isArray(consent?.featureScope) && consent.featureScope.length) {
          scheduleUpdate.consent_feature_scope = consent.featureScope;
        }
        if (consent?.reconfirmBy) scheduleUpdate.consent_reconfirm_by = consent.reconfirmBy;

        // consent_expires_at holds whichever deadline bites FIRST.
        //
        // Yapily gives us two dates and they mean different things:
        // expiresAt is when the consent itself lapses, reconfirmBy is
        // when UK reconfirmation is due. Data access stops at whichever
        // arrives first, so that is the date the status-maintenance
        // sweep and the in-app banner must work from. Keeping the
        // earlier of the two here means the reminder schedule cannot be
        // caught out by a consent whose reconfirmation falls due well
        // before its nominal expiry.
        const deadlines = [consent?.expiresAt, consent?.reconfirmBy]
          .filter((d): d is string => typeof d === 'string' && !Number.isNaN(Date.parse(d)))
          .sort();
        if (deadlines.length > 0) scheduleUpdate.consent_expires_at = deadlines[0];
        if (consent?.lastConfirmedAt) {
          scheduleUpdate.consent_last_confirmed_at = consent.lastConfirmedAt;
        }
      } catch (err) {
        // Non-fatal: we keep the locally computed 90-day expiry and the
        // fail-open capability path in sync-upcoming.
        console.warn(
          `[yapily.callback] consent metadata fetch failed for ${yapilyConsentId} (non-fatal):`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    await adminSched
      .from('bank_connections')
      .update(scheduleUpdate)
      .eq('id', upsertResult.connectionId);
  } catch (err) {
    console.error(
      '[yapily.callback] consent metadata / schedule update failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  // ── Mark the pending Hosted Pages request resolved (if any) ──
  // The abandonment poller treats anything still 'pending' after 15 min
  // as abandoned. Closing the loop here keeps its working set small.
  if (consentRequestId) {
    try {
      const adminBg = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await adminBg
        .from('yapily_pending_consent_requests')
        .update({
          status: 'completed',
          resolved_at: new Date().toISOString(),
          // Backfill the bank the user actually picked, replacing the
          // 'hosted-picker-pending' sentinel we wrote when we didn't
          // yet know. Keeps the admin view and abandonment reporting
          // honest about which banks people are choosing.
          institution_id: institutionId,
        })
        .eq('consent_request_id', consentRequestId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[yapily.callback] pending row update failed (non-fatal): ${msg}`);
    }
  }

  // ── Award loyalty points ──
  import('@/lib/loyalty')
    .then(({ awardPoints }) => {
      awardPoints(user.id, 'bank_connected');
      awardPoints(user.id, 'first_scan');
    })
    .catch(() => { /* non-fatal */ });

  // ── PostHog server-side conversion ──
  // Only fire on a genuinely new connection — a re-auth of an existing
  // bank (reused=true) isn't a "bank connected" conversion.
  if (!upsertResult.reused) {
    import('@/lib/posthog-server')
      .then(({ captureServer }) => {
        captureServer('bank_connected', user.id, {
          provider: 'yapily',
          bank_name: bankName,
        });
      })
      .catch(() => { /* non-fatal */ });
  }

  // ── Trigger initial 12-month sync in the background ──
  // The body carries the account snapshots so the sync doesn't have
  // to re-fetch /accounts (saves a round-trip + uses identical hashes
  // to whatever we just stored).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
  fetch(`${appUrl}/api/yapily/initial-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      connectionId: upsertResult.connectionId,
      userId: user.id,
      consentToken,
      accountSnapshots,
    }),
  }).catch((err) => console.error('[yapily.callback] initial-sync trigger failed:', err));

  // ── Kick the upcoming-payments sync for THIS CONNECTION ONLY ─────
  //
  // On a fresh connect the user expects "Upcoming payments" to populate
  // straight away rather than waiting for the 06:00 cron. More than
  // convenience: Yapily only allows the direct-debits /
  // periodic-payments / scheduled-payments endpoints to be called once,
  // shortly after authorisation — so this immediate run IS our one
  // chance to harvest them, and waiting for the cron risks missing the
  // window entirely.
  //
  // The `?connectionId=` scope was added 2026-08-21. Without it this
  // call ran the cron over EVERY user's connections on every single
  // bank connect — a full-tenant fan-out triggered by one person
  // linking one account.
  fetch(
    `${appUrl}/api/cron/sync-upcoming?connectionId=${encodeURIComponent(upsertResult.connectionId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    },
  ).catch((err) => console.error('[yapily.callback] sync-upcoming trigger failed:', err));

  return NextResponse.redirect(
    new URL(`${returnTo}?connected=true${upsertResult.reused ? '&merged=1' : ''}`, request.url),
  );
}
