// src/app/api/cron/sync-upcoming/route.ts
//
// Daily Vercel cron (06:00 UTC). For every active Yapily consent,
// refresh the four deterministic upcoming-payment endpoints and run
// the recurrence detector, then upsert/prune rows in
// `upcoming_payments`. Pending-transactions is best-effort — a bank
// that doesn't expose it just produces a log line, not an error.
//
// Auth: Bearer ${CRON_SECRET} — same pattern as bank-sync cron.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/encrypt';
import { getInstitutionFeatures, isUnsupportedFeatureError } from '@/lib/yapily';
import {
  getScheduledPayments,
  getPeriodicPayments,
  getDirectDebits,
  getPendingTransactions,
  type UpcomingRow,
} from '@/lib/yapily/upcoming';
import { projectMandateOccurrences } from '@/lib/yapily/project-mandates';
import {
  detectRecurringUpcoming,
  type DetectorTransaction,
} from '@/lib/upcoming/detect-recurring';
import {
  detectRecurringIncome,
  occurrencesFrom,
} from '@/lib/upcoming/detect-income';
import { endOfTodayLondonIso } from '@/lib/alerts/future-dated';
import { isAtLeastPro } from '@/lib/tier-rank';
import { resolveWhatsAppSession } from '@/lib/pocket-agent/resolve-session';

export const maxDuration = 300;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  provider_id: string | null;
  /** Needed to look up what this bank actually supports before calling
   *  its endpoints — Yapily build review step 10. */
  institution_id: string | null;
  consent_token: string | null;
  consent_expires_at: string | null;
  account_ids: string[] | null;
  status: string;
  /** Yapily consent identifier. A change here means a new authorisation,
   *  which re-opens the once-per-consent endpoints. */
  yapily_consent_id: string | null;
  /** When the authorisation behind the current consent was granted. */
  consent_granted_at: string | null;
  /** Set the first time we successfully harvest the once-per-consent
   *  endpoints on this consent. Non-null means "don't call them again". */
  upcoming_endpoints_fetched_at: string | null;
  /** Yapily features this bank returned 424/501 for. Never call again. */
  unsupported_features: string[] | null;
  /** featureScope Yapily GRANTED on this consent, captured at callback. */
  consent_feature_scope: string[] | null;
}

/**
 * Endpoints UK banks allow exactly ONCE per consent.
 *
 * Yapily's data-restrictions doc: "For UK institutions, certain
 * endpoints can be accessed once and for a short duration after the
 * consent has been authorised … To access these endpoints again or
 * after the valid period, you will have to obtain a new consent or
 * reauthorise the existing consent."
 *
 * Everything in this set is therefore harvested once, cached in
 * upcoming_endpoint_snapshots, and re-projected locally on later runs.
 * /transactions is NOT in this set — it is freely re-callable, so
 * pending transactions continue to be fetched every run.
 */
const ONCE_PER_CONSENT_ENDPOINTS = new Set([
  'scheduled-payments',
  'periodic-payments',
  'direct-debits',
]);

/**
 * Yapily feature names gating each upcoming-payments endpoint.
 * Source: institution metadata on GET /institutions (`features` array).
 */
const FEATURE_SCHEDULED_PAYMENTS = 'ACCOUNT_SCHEDULED_PAYMENTS';
const FEATURE_PERIODIC_PAYMENTS = 'ACCOUNT_PERIODIC_PAYMENTS';
const FEATURE_DIRECT_DEBITS = 'ACCOUNT_DIRECT_DEBITS';
const FEATURE_TRANSACTIONS = 'ACCOUNT_TRANSACTIONS';

interface UpsertRow {
  user_id: string;
  /** Owning bank_connections row — added 2026-08-16 so the upcoming feed
   *  can be Space-filtered the same way bank_transactions is. */
  connection_id: string;
  account_id: string;
  source: UpcomingRow['source'] | 'predicted_recurring' | 'predicted_income';
  direction: 'incoming' | 'outgoing';
  counterparty: string | null;
  amount: number;
  currency: string;
  expected_date: string;
  confidence: number;
  yapily_resource_id: string | null;
  yapily_provider_id: string | null;
  raw: unknown;
}

/** How far ahead the forward view runs. The UI offers 7/14/30 days, so
 *  35 gives the 30-day window a little slack either side of a cron run. */
const FORWARD_HORIZON_DAYS = 35;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const runStartedAt = new Date().toISOString();

  // Optional single-connection scope.
  //
  // The Yapily callback calls this route immediately after a bank is
  // linked, because the once-per-consent endpoints are only open for a
  // short window after authorisation. Before 2026-08-21 that call had
  // no scope, so one user connecting one bank ran the whole cron over
  // every user's connections. With a connectionId we do exactly the
  // work that connect actually needs.
  const scopedConnectionId = new URL(request.url).searchParams.get('connectionId');

  // Pull active Yapily connections with a non-expired consent.
  let connectionQuery = supabase
    .from('bank_connections')
    .select(
      'id, user_id, provider, provider_id, institution_id, consent_token, consent_expires_at, account_ids, status, ' +
      'yapily_consent_id, consent_granted_at, upcoming_endpoints_fetched_at, unsupported_features, consent_feature_scope',
    )
    .eq('provider', 'yapily')
    .eq('status', 'active')
    .is('archived_at', null);

  if (scopedConnectionId) {
    connectionQuery = connectionQuery.eq('id', scopedConnectionId);
  }

  const { data: connections, error: connErr } = await connectionQuery;

  if (connErr) {
    console.error('[sync-upcoming] connection fetch failed:', connErr.message);
    return NextResponse.json({ ok: false, reason: connErr.message }, { status: 500 });
  }

  const summary: {
    connectionsProcessed: number;
    deterministicRowsUpserted: number;
    predictedRowsUpserted: number;
    incomeRowsDetected: number;
    staleRowsPruned: number;
    pendingEndpointsFailed: number;
    otherFailures: number;
    endpointsSkippedUnsupported: number;
    /** Once-per-consent endpoints not called because we already have them. */
    endpointsSkippedAlreadyHarvested: number;
    /** Endpoints newly recorded as 424/501 unsupported this run. */
    endpointsMarkedUnsupported: number;
    /** Rows re-projected from a stored snapshot instead of a fresh call. */
    mandateRowsProjected: number;
    alertsDispatched: number;
    telegramAlertsDispatched: number;
    startedAt: string;
  } = {
    connectionsProcessed: 0,
    deterministicRowsUpserted: 0,
    predictedRowsUpserted: 0,
    incomeRowsDetected: 0,
    staleRowsPruned: 0,
    pendingEndpointsFailed: 0,
    otherFailures: 0,
    endpointsSkippedUnsupported: 0,
    endpointsSkippedAlreadyHarvested: 0,
    endpointsMarkedUnsupported: 0,
    mandateRowsProjected: 0,
    alertsDispatched: 0,
    telegramAlertsDispatched: 0,
    startedAt: runStartedAt,
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);

  // `as unknown as` rather than a direct cast: supabase-js parses the
  // select() string literal to infer the row type, and it cannot do
  // that through the string concatenation the column list now needs.
  // The runtime shape is correct; the inference isn't available.
  for (const conn of (connections || []) as unknown as BankConnection[]) {
    if (!conn.consent_token || !conn.account_ids?.length) continue;
    if (conn.consent_expires_at && new Date(conn.consent_expires_at) < today) continue;

    let decrypted: string;
    try {
      decrypted = decrypt(conn.consent_token);
    } catch (err) {
      console.error(`[sync-upcoming] decrypt failed for conn=${conn.id}`, err);
      summary.otherFailures++;
      continue;
    }

    // ── Endpoint capability verification ────────────────────────────
    //
    // Three independent gates, cheapest and most authoritative first.
    // Each answers a different question, and skipping any of them means
    // generating requests Yapily has told us cannot succeed.
    //
    // GATE 1 — what did this consent actually GRANT?
    //   As of 2026-08-21 we no longer send a featureScope when creating
    //   a consent (Migle's instruction: naming scopes makes them hard
    //   requirements and causes bank-side failures). So the granted
    //   scope is decided by the bank and recorded on the consent. Where
    //   we captured it, it is the most accurate answer available —
    //   better than the institution's advertised capabilities, which
    //   describe the bank in general rather than this consent.
    //
    // GATE 2 — what does the institution advertise?
    //   Fallback for connections created before we captured the granted
    //   scope. Cached for an hour at module level, so it costs no
    //   additional API call.
    //
    // GATE 3 — what has this bank already told us it can't do?
    //   unsupported_features accumulates every feature that returned a
    //   424 or 501 on this consent. Those are permanent facts about the
    //   bank, not transient errors, so once recorded we never ask again.
    //   This is the gate that actually stops the recurring failed-call
    //   traffic, because it learns from reality rather than from
    //   metadata the bank may report inaccurately.
    //
    // Fail-open on gates 1 and 2 only: if we know neither the granted
    // scope nor the institution's features, we attempt the call. A
    // degraded metadata lookup must not silently stop collecting a
    // user's direct debits — and gate 3 will catch it permanently the
    // first time it genuinely fails.
    const grantedScope = Array.isArray(conn.consent_feature_scope)
      ? conn.consent_feature_scope
      : [];
    const institutionFeatures = conn.institution_id
      ? await getInstitutionFeatures(conn.institution_id)
      : [];
    const knownUnsupported = new Set(conn.unsupported_features ?? []);

    // Each gate can VETO independently; none can override another.
    //
    // An earlier draft had the granted scope replace the institution
    // list when present. That was wrong in one direction that matters:
    // Migle's spec is explicit that the institution's `features` array
    // from GET /institutions is the check to make before polling
    // ("System checks selected institution's features list from GET
    // /institutions … If required feature is absent: do not call the
    // endpoint"). A consent can carry a scope the institution does not
    // in fact implement, and calling on that basis is exactly the 424
    // traffic we were asked to stop.
    //
    // So: call only if nothing known says no.
    const featuresKnown = grantedScope.length > 0 || institutionFeatures.length > 0;
    const supports = (feature: string) => {
      // Learned from reality — the bank has already refused this.
      if (knownUnsupported.has(feature)) return false;
      // The institution does not advertise it.
      if (institutionFeatures.length > 0 && !institutionFeatures.includes(feature)) return false;
      // The consent does not cover it.
      if (grantedScope.length > 0 && !grantedScope.includes(feature)) return false;
      return true;
    };

    if (!featuresKnown) {
      console.warn(
        `[sync-upcoming] no granted scope or feature list for conn=${conn.id} institution=${conn.institution_id ?? 'null'} — attempting all endpoints (fail-open)`,
      );
    }

    // ── Once-per-consent gate ───────────────────────────────────────
    //
    // See ONCE_PER_CONSENT_ENDPOINTS above. `upcoming_endpoints_fetched_at`
    // records when we last harvested them successfully; a
    // `consent_granted_at` newer than that means the user has
    // re-authorised, which re-opens the window and justifies one more
    // harvest.
    //
    // This column has existed since the 20260429220000 migration but
    // was only ever written as null, so the nightly re-poll continued
    // regardless. Now it does what it was added for.
    const harvestedAt = conn.upcoming_endpoints_fetched_at
      ? new Date(conn.upcoming_endpoints_fetched_at).getTime()
      : null;
    const grantedAt = conn.consent_granted_at
      ? new Date(conn.consent_granted_at).getTime()
      : null;
    const consentIsFresherThanHarvest =
      harvestedAt !== null && grantedAt !== null && grantedAt > harvestedAt;
    const shouldHarvestOnceOnly = harvestedAt === null || consentIsFresherThanHarvest;

    // Accumulates features that fail with 424/501 during this run so we
    // can persist them once at the end rather than issuing an UPDATE
    // per failure.
    const newlyUnsupported = new Set<string>();
    let harvestSucceeded = false;

    for (const accountId of conn.account_ids) {
      const rows: UpsertRow[] = [];

      // Deterministic endpoints — small wrapper so one failing
      // source doesn't block the others. Each is gated on the feature
      // the institution actually advertises.
      const candidateEndpoints: Array<[string, string, () => Promise<UpcomingRow[]>]> = [
        [FEATURE_SCHEDULED_PAYMENTS, 'scheduled-payments', () => getScheduledPayments(accountId, decrypted)],
        [FEATURE_PERIODIC_PAYMENTS,  'periodic-payments',  () => getPeriodicPayments(accountId, decrypted)],
        [FEATURE_DIRECT_DEBITS,      'direct-debits',      () => getDirectDebits(accountId, decrypted)],
      ];

      const endpoints: Array<[string, string, () => Promise<UpcomingRow[]>]> = [];
      for (const [feature, label, fn] of candidateEndpoints) {
        if (!supports(feature)) {
          summary.endpointsSkippedUnsupported++;
          console.log(
            `[sync-upcoming] skipping ${label} for account=${accountId} — ${
              knownUnsupported.has(feature)
                ? `previously returned 424/501 on this consent`
                : `institution=${conn.institution_id} does not advertise ${feature}`
            }`,
          );
          // Record a metadata-based skip the same way we record a
          // 424/501, so the user is told their bank doesn't offer this
          // rather than being left to wonder why the section is empty.
          // Migle: "Log that the feature is unsupported for the
          // institution … Inform user that this data is unavailable for
          // their bank."
          if (!knownUnsupported.has(feature)) newlyUnsupported.add(feature);
          continue;
        }
        if (ONCE_PER_CONSENT_ENDPOINTS.has(label) && !shouldHarvestOnceOnly) {
          summary.endpointsSkippedAlreadyHarvested++;
          continue;
        }
        endpoints.push([feature, label, fn]);
      }

      for (const [feature, label, fn] of endpoints) {
        try {
          const fetched = await fn();
          for (const r of fetched) {
            rows.push(toUpsertRow(r, conn, accountId));
          }

          if (ONCE_PER_CONSENT_ENDPOINTS.has(label)) {
            harvestSucceeded = true;
            // Keep the payload. This is the only copy we will get until
            // the user reauthorises, and the daily prune would otherwise
            // delete the derived rows once their dates passed.
            await persistSnapshot(supabase, conn, accountId, label, fetched);
          }
        } catch (err) {
          // ── 424 / 501: the bank does not implement this endpoint ──
          //
          // Yapily returns 424 FAILED_DEPENDENCY when "the feature to be
          // accessed is not supported by the Institution"; Migle flagged
          // 501 as the code we were generating in practice. Either way
          // it is a permanent property of the bank, so retrying is pure
          // waste — and it used to be worse than waste, because 501 fell
          // into the `status >= 500` retryable branch and was attempted
          // three times per account per night, forever.
          //
          // Record it and stop asking.
          if (isUnsupportedFeatureError(err)) {
            newlyUnsupported.add(feature);
            summary.endpointsMarkedUnsupported++;
            console.log(
              `[sync-upcoming] ${label} unsupported by institution=${conn.institution_id} (conn=${conn.id}) — recording ${feature} and skipping in future runs`,
            );
            continue;
          }
          console.error(`[sync-upcoming] ${label} failed for account=${accountId}`, err);
          summary.otherFailures++;
        }
      }

      // ── Re-project stored mandates ──────────────────────────────
      //
      // Runs on EVERY pass, including the ones where we deliberately
      // made no once-per-consent calls. Direct debits and standing
      // orders are recurring by definition; the bank gave us the
      // amount, counterparty and cadence once, so future occurrences
      // are arithmetic, not an API call.
      //
      // Emitted as predicted_recurring / predicted_income rather than
      // direct_debit / standing_order on purpose: the mandate is
      // bank-confirmed but these particular dates are our extrapolation,
      // and the alerting block below only fires on confirmed sources.
      // Keeping them predicted means we never push "£62.40 leaving
      // tomorrow" off the back of a date the bank never gave us.
      try {
        const horizonIso = new Date(today.getTime() + FORWARD_HORIZON_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const todayIso = today.toISOString().slice(0, 10);

        const { data: snapshots } = await supabase
          .from('upcoming_endpoint_snapshots')
          .select('endpoint, rows')
          .eq('connection_id', conn.id)
          .eq('account_id', accountId)
          .in('endpoint', ['direct-debits', 'periodic-payments']);

        for (const snap of snapshots || []) {
          const storedRows = (Array.isArray(snap.rows) ? snap.rows : []) as UpcomingRow[];
          for (const r of storedRows) {
            const rawFrequency = (r.raw as { frequency?: unknown } | null)?.frequency;
            const occurrences = projectMandateOccurrences({
              lastKnownDate: r.expectedDate,
              frequency: rawFrequency,
              source: snap.endpoint === 'direct-debits' ? 'direct_debit' : 'standing_order',
              horizonIso,
              afterIso: todayIso,
            });
            for (const expectedDate of occurrences) {
              rows.push({
                user_id: conn.user_id,
                connection_id: conn.id,
                account_id: accountId,
                source: r.direction === 'incoming' ? 'predicted_income' : 'predicted_recurring',
                direction: r.direction,
                counterparty: r.counterparty,
                amount: r.amount,
                currency: r.currency,
                expected_date: expectedDate,
                // Below 1.0: the mandate is real, the date is projected.
                confidence: 0.9,
                yapily_resource_id: null,
                yapily_provider_id: conn.provider_id,
                raw: {
                  projectedFrom: 'upcoming_endpoint_snapshots',
                  endpoint: snap.endpoint,
                  lastKnownDate: r.expectedDate,
                  frequency: rawFrequency ?? null,
                },
              });
              summary.mandateRowsProjected++;
            }
          }
        }
      } catch (err) {
        console.error(`[sync-upcoming] mandate projection failed for account=${accountId}`, err);
        summary.otherFailures++;
      }

      // Optional pending transactions — gated on ACCOUNT_TRANSACTIONS,
      // then still wrapped in try/catch because `bookingStatus=pending`
      // support varies WITHIN banks that advertise transactions.
      if (supports(FEATURE_TRANSACTIONS)) {
        try {
          const pending = await getPendingTransactions(accountId, decrypted);
          for (const r of pending) rows.push(toUpsertRow(r, conn, accountId));
        } catch (err) {
          console.log(
            `[sync-upcoming] pending transactions unavailable for account=${accountId}:`,
            err instanceof Error ? err.message : err,
          );
          summary.pendingEndpointsFailed++;
        }
      } else {
        summary.endpointsSkippedUnsupported++;
        console.log(
          `[sync-upcoming] skipping pending transactions for account=${accountId} — institution=${conn.institution_id} does not advertise ${FEATURE_TRANSACTIONS}`,
        );
      }

      // Recurrence detectors over 180 days of history. History is
      // fetched ONCE and fed to both detectors:
      //   • detectRecurringUpcoming — outgoings (amount ±2% grouping)
      //   • detectRecurringIncome   — credits (cadence-led grouping)
      // Future-dated rows are excluded from the detector input: HSBC
      // returns scheduled payments as ordinary transactions dated on the
      // due date, and feeding tomorrow's scheduled debit back in as
      // "history" would shift every predicted date forward by a cycle.
      try {
        const since = new Date(today.getTime() - 180 * 86_400_000).toISOString();
        const { data: txns } = await supabase
          .from('bank_transactions')
          .select('id, amount, merchant_name, description, timestamp')
          .eq('user_id', conn.user_id)
          .eq('account_id', accountId)
          .gte('timestamp', since)
          .lte('timestamp', endOfTodayLondonIso())
          .order('timestamp', { ascending: true })
          .limit(5000);

        const detectorInput: DetectorTransaction[] = (txns || []).map((t) => ({
          id: t.id,
          amount: parseFloat(String(t.amount)) || 0,
          counterparty: t.merchant_name || null,
          description: t.description || null,
          date: t.timestamp,
        }));

        const horizonIso = new Date(today.getTime() + FORWARD_HORIZON_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const todayIso = today.toISOString().slice(0, 10);

        // ── Outgoings ──────────────────────────────────────────────
        // The detector returns only the NEXT occurrence, which left a
        // weekly direct debit showing up once in a 30-day view instead
        // of four times. Expand each series across the horizon.
        const predicted = detectRecurringUpcoming(detectorInput, new Date());
        for (const p of predicted) {
          const dates = [
            p.expectedDate,
            ...occurrencesFrom({
              cadence: p.cadence,
              lastSeen: p.expectedDate,
              afterIso: p.expectedDate,
              horizonIso,
              max: 12,
            }),
          ];
          for (const expectedDate of dates) {
            if (expectedDate > horizonIso) continue;
            rows.push({
              user_id: conn.user_id,
              connection_id: conn.id,
              account_id: accountId,
              source: 'predicted_recurring',
              direction: p.direction,
              counterparty: p.displayCounterparty,
              amount: p.amount,
              currency: 'GBP',
              expected_date: expectedDate,
              confidence: p.confidence,
              yapily_resource_id: null,
              yapily_provider_id: conn.provider_id,
              raw: {
                cadence: p.cadence,
                sampleSize: p.sampleSize,
                lastSeen: p.lastSeen,
                normalised: p.counterparty,
              },
            });
          }
        }

        // ── Incoming ───────────────────────────────────────────────
        const income = detectRecurringIncome(detectorInput, {
          now: new Date(),
          horizonDays: FORWARD_HORIZON_DAYS,
        });
        for (const inc of income) {
          if (inc.expectedDate <= todayIso) continue;
          rows.push({
            user_id: conn.user_id,
            connection_id: conn.id,
            account_id: accountId,
            source: 'predicted_income',
            direction: 'incoming',
            counterparty: inc.displayCounterparty,
            amount: inc.amount,
            currency: 'GBP',
            expected_date: inc.expectedDate,
            confidence: inc.confidence,
            yapily_resource_id: null,
            yapily_provider_id: conn.provider_id,
            raw: {
              cadence: inc.cadence,
              sampleSize: inc.sampleSize,
              lastSeen: inc.lastSeen,
              normalised: inc.counterparty,
              amountLow: inc.amountLow,
              amountHigh: inc.amountHigh,
              amountVariability: inc.amountVariability,
              occurrenceIndex: inc.occurrenceIndex,
            },
          });
          summary.incomeRowsDetected++;
        }
      } catch (err) {
        console.error(
          `[sync-upcoming] detector failed for account=${accountId}`,
          err,
        );
        summary.otherFailures++;
      }

      // ── Write in two passes ────────────────────────────────────
      //
      // Deterministic rows are UPSERTED so created_at survives, which
      // is what the alerting block below uses to tell a genuinely new
      // detection from a repeat. The conflict target is now backed by
      // uniq_upcoming_deterministic_full — a NON-partial index. The
      // original uniq_upcoming_deterministic is partial
      // (WHERE yapily_resource_id IS NOT NULL) and Postgres cannot
      // infer a partial index from a predicate-less ON CONFLICT, so
      // every upsert this cron has ever issued failed with 42P10 and
      // the table stayed empty. See the 20260816190000 migration.
      //
      // Predicted rows are REPLACED wholesale for the forward window.
      // They're recomputed from scratch on every run anyway, so
      // replacing them clears predictions that no longer hold instead
      // of leaving them to rot until the date prune. Predicted rows are
      // never alerted on (the alert query filters to the deterministic
      // sources), so re-inserting them daily can't spam anyone.
      const deterministicRows = rows.filter((r) => r.yapily_resource_id !== null);
      const predictedRows = rows.filter((r) => r.yapily_resource_id === null);

      if (deterministicRows.length) {
        // Guard against the same resource id arriving twice in one run —
        // an upsert batch containing two rows with the same conflict key
        // errors with "cannot affect row a second time".
        const seen = new Set<string>();
        const deduped = deterministicRows.filter((r) => {
          const k = `${r.account_id}|${r.source}|${r.yapily_resource_id}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const { error } = await supabase
          .from('upcoming_payments')
          .upsert(deduped, {
            onConflict: 'user_id,account_id,source,yapily_resource_id',
          });
        if (error) {
          console.error('[sync-upcoming] deterministic upsert failed:', error.message);
          summary.otherFailures++;
        } else {
          summary.deterministicRowsUpserted += deduped.length;
        }
      }

      // Clear the forward window even when the detectors returned
      // nothing — a merchant the user has stopped paying should stop
      // being predicted.
      const { error: clearErr } = await supabase
        .from('upcoming_payments')
        .delete()
        .eq('user_id', conn.user_id)
        .eq('account_id', accountId)
        .in('source', ['predicted_recurring', 'predicted_income'])
        .gte('expected_date', today.toISOString().slice(0, 10));
      if (clearErr) {
        console.error('[sync-upcoming] predicted clear failed:', clearErr.message);
        summary.otherFailures++;
      }

      if (predictedRows.length) {
        const seen = new Set<string>();
        const deduped = predictedRows.filter((r) => {
          const k = `${r.account_id}|${r.source}|${r.counterparty}|${r.expected_date}|${r.amount}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const { error } = await supabase.from('upcoming_payments').insert(deduped);
        if (error) {
          console.error('[sync-upcoming] predicted insert failed:', error.message);
          summary.otherFailures++;
        } else {
          summary.predictedRowsUpserted += deduped.length;
        }
      }
    }

    // ── Persist what we learned about this connection ──────────────
    //
    // One UPDATE per connection rather than one per failure. Both
    // fields are "facts about this consent" and only change on a
    // successful harvest or a newly discovered 424/501.
    const connectionUpdate: Record<string, unknown> = {};

    if (harvestSucceeded) {
      // Stamps the once-per-consent gate closed. Until the user
      // reauthorises (which moves consent_granted_at past this), we
      // will not call these endpoints again.
      connectionUpdate.upcoming_endpoints_fetched_at = new Date().toISOString();
    }

    if (newlyUnsupported.size > 0) {
      // Union with what was already there — never replace, or a run
      // that discovers one unsupported feature would forget the others.
      connectionUpdate.unsupported_features = Array.from(
        new Set([...(conn.unsupported_features ?? []), ...newlyUnsupported]),
      );
    }

    if (Object.keys(connectionUpdate).length > 0) {
      const { error: updErr } = await supabase
        .from('bank_connections')
        .update(connectionUpdate)
        .eq('id', conn.id);
      if (updErr) {
        console.error(
          `[sync-upcoming] failed to persist endpoint state for conn=${conn.id}: ${updErr.message}`,
        );
        summary.otherFailures++;
      }
    }

    summary.connectionsProcessed++;
  }

  // Prune rows older than yesterday — payments that were expected
  // yesterday but never arrived can be manually inspected by the user
  // via their transaction history; we don't want to clutter the feed.
  const { count } = await supabase
    .from('upcoming_payments')
    .delete({ count: 'exact' })
    .lt('expected_date', yesterday);
  summary.staleRowsPruned = count || 0;

  // ── Alert the user for newly-inserted confirmed incoming rows
  //    arriving within the next 2 days. Upserts on an existing row
  //    bump updated_at but not created_at, so we use created_at to
  //    distinguish genuinely new detections from repeats.           //
  //    Fires a user_notifications row + a best-effort Telegram
  //    proactive alert for Pro users with a linked session.
  const tomorrow = new Date(today.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const alertCutoff = today.toISOString();

  const { data: freshRows } = await supabase
    .from('upcoming_payments')
    .select('id, user_id, source, direction, counterparty, amount, currency, expected_date, confidence, account_id, yapily_provider_id')
    .gte('created_at', runStartedAt)
    .gte('expected_date', alertCutoff.slice(0, 10))
    .lte('expected_date', tomorrow)
    .in('source', ['pending_credit', 'scheduled_payment', 'direct_debit', 'standing_order'])
    .order('expected_date', { ascending: true });

  summary.alertsDispatched = 0;
  summary.telegramAlertsDispatched = 0;

  for (const row of (freshRows || [])) {
    const direction = row.direction as 'incoming' | 'outgoing';
    const isIncoming = direction === 'incoming';
    const amountStr = `£${Number(row.amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const who = row.counterparty || 'a counterparty';
    const whenIso = row.expected_date as string;
    const isTomorrow = new Date(whenIso + 'T00:00:00Z').getTime() === today.getTime() + 86_400_000;
    const when = isTomorrow ? 'tomorrow' : `on ${new Date(whenIso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;

    const title = isIncoming
      ? `${amountStr} arriving ${when} from ${who}`
      : `${amountStr} leaving ${when} · ${who}`;

    const body = isIncoming
      ? `Your bank has flagged an incoming payment of ${amountStr} arriving ${when}. We'll update the total on Money Hub.`
      : `A scheduled outgoing payment of ${amountStr} to ${who} is due ${when}. Make sure your account has enough to cover it.`;

    // In-app notification (free for all tiers).
    try {
      await supabase.from('user_notifications').insert({
        user_id: row.user_id,
        type: 'upcoming_payment',
        title,
        body,
        link_url: '/dashboard/money-hub/upcoming',
        metadata: {
          source: row.source,
          direction: row.direction,
          amount: row.amount,
          currency: row.currency,
          expected_date: row.expected_date,
          account_id: row.account_id,
        },
      });
      summary.alertsDispatched++;
    } catch (e) {
      console.error('[sync-upcoming] notification insert failed:', e);
    }

    // Best-effort Telegram push for Pro users. Look up the session
    // directly — if the user hasn't linked Telegram, skip.
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', row.user_id)
        .single();

      // Left as a plain string rather than a narrowed union — the inline
      // 'free' | 'essential' | 'pro' union silently excluded the tiers
      // added above Pro and would have to be widened on every new tier.
      const tier = profile?.subscription_tier || 'free';
      // Pro AND ABOVE: instant. Essential: email only (handled elsewhere).
      // Free: in-app only.
      if (!isAtLeastPro(tier)) continue;

      const { data: session } = await supabase
        .from('telegram_sessions')
        .select('telegram_chat_id')
        .eq('user_id', row.user_id)
        .eq('is_active', true)
        .single();

      if (!session?.telegram_chat_id) continue;

      const { sendProactiveAlert } = await import('@/lib/telegram/user-bot');
      await sendProactiveAlert({
        chatId: session.telegram_chat_id as number,
        issue: {
          id: row.id,
          title: isIncoming ? `💷 ${title}` : `📅 ${title}`,
          detail: body,
          amount_impact: isIncoming ? null : Number(row.amount),
          issue_type: 'upcoming_payment',
        },
      });
      summary.telegramAlertsDispatched++;
    } catch (e) {
      console.error('[sync-upcoming] telegram alert failed:', e);
    }

    // WhatsApp paybacker_dd_warning — fires for OUTGOING direct_debit /
    // standing_order rows in the next 24-72h. Template vars:
    // [first_name, provider, amount, date, balance].
    // Skipped for incoming (paybacker_payment_received handles those
    // when the credit actually lands) and for the 0-1 day window (the
    // user can no longer act anyway).
    if (direction === 'outgoing' && (row.source === 'direct_debit' || row.source === 'standing_order')) {
      try {
        const waSession = await resolveWhatsAppSession(supabase, row.user_id, 'sync-upcoming');
        if (waSession?.whatsapp_phone) {
          const { data: profile2 } = await supabase
            .from('profiles')
            .select('first_name, full_name, email')
            .eq('id', row.user_id)
            .maybeSingle();
          const firstName =
            ((profile2?.first_name as string | null) ||
              (profile2?.full_name as string | null) ||
              (profile2?.email as string | null) ||
              'there')
              .toString()
              .trim()
              .split(/\s+/)[0] || 'there';
          const friendlyDate = new Date(whenIso + 'T00:00:00Z').toLocaleDateString(
            'en-GB',
            { day: 'numeric', month: 'short' },
          );
          // Account balance lookup would double DB hits; pass the
          // "see Money Hub" hint for now. Future: thread balance
          // through from upcoming_payments via a join.
          const balanceLabel = 'see Money Hub';
          const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
          await sendWhatsAppTemplate({
            to: waSession.whatsapp_phone,
            templateName: 'paybacker_dd_warning',
            parameters: [firstName, who, amountStr, friendlyDate, balanceLabel],
          });
        }
      } catch (e) {
        console.error('[sync-upcoming] dd_warning send failed:', e);
      }
    }
  }

  // Business-log summary.
  try {
    const { error: logErr } = await supabase
      .from('business_log')
      .insert({
        // business_log columns are category/title/content/created_by — the
        // previous event_type/details/severity trio matched no column, so
        // every run of this cron silently failed to log.
        category: 'upcoming_payments_sync',
        title: `Upcoming payments sync (${summary.otherFailures > 0 ? 'warning' : 'info'})`,
        content: JSON.stringify(summary),
        created_by: 'cron/sync-upcoming',
      });
    if (logErr) {
      console.error('[sync-upcoming] business_log insert failed:', logErr.message);
    }
  } catch (e) {
    console.error('[sync-upcoming] business_log insert threw:', e);
  }

  return NextResponse.json({ ok: true, summary });
}

/**
 * Stores the raw result of a once-per-consent endpoint.
 *
 * Best-effort by design: a snapshot write failure degrades the forward
 * view (we lose the ability to re-project this mandate) but must not
 * abort the run or lose the rows we just wrote to upcoming_payments.
 *
 * Upserts on (connection_id, account_id, endpoint) so a reauthorisation
 * replaces the previous capture rather than accumulating stale mandates
 * the user may have since cancelled.
 */
async function persistSnapshot(
  supabase: ReturnType<typeof getAdmin>,
  conn: BankConnection,
  accountId: string,
  endpoint: string,
  rows: UpcomingRow[],
): Promise<void> {
  try {
    const { error } = await supabase.from('upcoming_endpoint_snapshots').upsert(
      {
        user_id: conn.user_id,
        connection_id: conn.id,
        account_id: accountId,
        endpoint,
        consent_id: conn.yapily_consent_id,
        rows,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id,account_id,endpoint' },
    );
    if (error) {
      console.error(
        `[sync-upcoming] snapshot upsert failed conn=${conn.id} account=${accountId} endpoint=${endpoint}: ${error.message}`,
      );
    }
  } catch (err) {
    console.error(
      `[sync-upcoming] snapshot upsert threw conn=${conn.id} endpoint=${endpoint}`,
      err,
    );
  }
}

function toUpsertRow(r: UpcomingRow, conn: BankConnection, accountId: string): UpsertRow {
  return {
    user_id: conn.user_id,
    connection_id: conn.id,
    account_id: accountId,
    source: r.source,
    direction: r.direction,
    counterparty: r.counterparty,
    amount: r.amount,
    currency: r.currency,
    expected_date: r.expectedDate,
    confidence: r.confidence,
    yapily_resource_id: r.yapilyResourceId,
    yapily_provider_id: conn.provider_id,
    raw: r.raw,
  };
}
