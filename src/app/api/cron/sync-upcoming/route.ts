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
import { getInstitutionFeatures } from '@/lib/yapily';
import {
  getScheduledPayments,
  getPeriodicPayments,
  getDirectDebits,
  getPendingTransactions,
  type UpcomingRow,
} from '@/lib/yapily/upcoming';
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
}

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

  // Pull active Yapily connections with a non-expired consent.
  const { data: connections, error: connErr } = await supabase
    .from('bank_connections')
    .select('id, user_id, provider, provider_id, institution_id, consent_token, consent_expires_at, account_ids, status')
    .eq('provider', 'yapily')
    .eq('status', 'active')
    .is('archived_at', null);

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
    alertsDispatched: 0,
    telegramAlertsDispatched: 0,
    startedAt: runStartedAt,
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);

  for (const conn of (connections || []) as BankConnection[]) {
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

    // ── Endpoint capability verification (build review step 10) ──
    //
    // Not every UK bank exposes every endpoint. Yapily publishes what
    // each institution supports in the `features` array on
    // GET /institutions, and asks integrators to check it BEFORE
    // invoking an endpoint. Previously this loop called all four
    // endpoints for every bank and swallowed the failures — which meant
    // we generated avoidable failed requests against Yapily's platform
    // every night, for every unsupported endpoint, forever.
    //
    // getInstitutions() is cached for an hour at module level, so this
    // gate costs no additional API calls.
    //
    // Fail-open: if institution_id is missing (legacy rows) or the
    // feature list comes back empty (lookup failed), we fall back to
    // attempting the endpoints as before. A degraded lookup must not
    // silently stop collecting a user's direct debits.
    const features = conn.institution_id
      ? await getInstitutionFeatures(conn.institution_id)
      : [];
    const featuresKnown = features.length > 0;
    const supports = (feature: string) => !featuresKnown || features.includes(feature);

    if (!featuresKnown) {
      console.warn(
        `[sync-upcoming] no feature list for conn=${conn.id} institution=${conn.institution_id ?? 'null'} — attempting all endpoints (fail-open)`,
      );
    }

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

      const endpoints: Array<[string, () => Promise<UpcomingRow[]>]> = [];
      for (const [feature, label, fn] of candidateEndpoints) {
        if (supports(feature)) {
          endpoints.push([label, fn]);
        } else {
          summary.endpointsSkippedUnsupported++;
          console.log(
            `[sync-upcoming] skipping ${label} for account=${accountId} — institution=${conn.institution_id} does not advertise ${feature}`,
          );
        }
      }

      for (const [label, fn] of endpoints) {
        try {
          const fetched = await fn();
          for (const r of fetched) {
            rows.push(toUpsertRow(r, conn, accountId));
          }
        } catch (err) {
          console.error(`[sync-upcoming] ${label} failed for account=${accountId}`, err);
          summary.otherFailures++;
        }
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
        const { data: waSession } = await supabase
          .from('whatsapp_sessions')
          .select('whatsapp_phone')
          .eq('user_id', row.user_id)
          .eq('is_active', true)
          .is('opted_out_at', null)
          .maybeSingle();
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
