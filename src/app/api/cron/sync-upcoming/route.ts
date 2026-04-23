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
  consent_token: string | null;
  consent_expires_at: string | null;
  account_ids: string[] | null;
  status: string;
}

interface UpsertRow {
  user_id: string;
  account_id: string;
  source: UpcomingRow['source'] | 'predicted_recurring';
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
    .select('id, user_id, provider, provider_id, consent_token, consent_expires_at, account_ids, status')
    .eq('provider', 'yapily')
    .eq('status', 'active');

  if (connErr) {
    console.error('[sync-upcoming] connection fetch failed:', connErr.message);
    return NextResponse.json({ ok: false, reason: connErr.message }, { status: 500 });
  }

  const summary: {
    connectionsProcessed: number;
    deterministicRowsUpserted: number;
    predictedRowsUpserted: number;
    staleRowsPruned: number;
    pendingEndpointsFailed: number;
    otherFailures: number;
    alertsDispatched: number;
    telegramAlertsDispatched: number;
    startedAt: string;
  } = {
    connectionsProcessed: 0,
    deterministicRowsUpserted: 0,
    predictedRowsUpserted: 0,
    staleRowsPruned: 0,
    pendingEndpointsFailed: 0,
    otherFailures: 0,
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

    for (const accountId of conn.account_ids) {
      const rows: UpsertRow[] = [];

      // Deterministic endpoints — small wrapper so one failing
      // source doesn't block the others.
      const endpoints: Array<[string, () => Promise<UpcomingRow[]>]> = [
        ['scheduled-payments', () => getScheduledPayments(accountId, decrypted)],
        ['periodic-payments',  () => getPeriodicPayments(accountId, decrypted)],
        ['direct-debits',      () => getDirectDebits(accountId, decrypted)],
      ];

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

      // Optional pending transactions — graceful degradation.
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

      // Recurrence detector over 180 days of history.
      try {
        const since = new Date(today.getTime() - 180 * 86_400_000).toISOString();
        const { data: txns } = await supabase
          .from('bank_transactions')
          .select('id, amount, merchant_name, description, timestamp')
          .eq('user_id', conn.user_id)
          .eq('account_id', accountId)
          .gte('timestamp', since)
          .order('timestamp', { ascending: true })
          .limit(5000);

        const detectorInput: DetectorTransaction[] = (txns || []).map((t) => ({
          id: t.id,
          amount: parseFloat(String(t.amount)) || 0,
          counterparty: t.merchant_name || null,
          description: t.description || null,
          date: t.timestamp,
        }));

        const predicted = detectRecurringUpcoming(detectorInput, new Date());
        for (const p of predicted) {
          rows.push({
            user_id: conn.user_id,
            account_id: accountId,
            source: 'predicted_recurring',
            direction: p.direction,
            counterparty: p.displayCounterparty,
            amount: p.amount,
            currency: 'GBP',
            expected_date: p.expectedDate,
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
      } catch (err) {
        console.error(
          `[sync-upcoming] detector failed for account=${accountId}`,
          err,
        );
        summary.otherFailures++;
      }

      // Upsert in two passes: deterministic rows match on
      // (user, account, source, yapily_resource_id); predicted rows
      // match on (user, account, source, counterparty, date, amount).
      const deterministicRows = rows.filter((r) => r.yapily_resource_id !== null);
      const predictedRows = rows.filter((r) => r.yapily_resource_id === null);

      if (deterministicRows.length) {
        const { error } = await supabase
          .from('upcoming_payments')
          .upsert(deterministicRows, {
            onConflict: 'user_id,account_id,source,yapily_resource_id',
          });
        if (error) {
          console.error('[sync-upcoming] deterministic upsert failed:', error.message);
          summary.otherFailures++;
        } else {
          summary.deterministicRowsUpserted += deterministicRows.length;
        }
      }

      if (predictedRows.length) {
        const { error } = await supabase
          .from('upcoming_payments')
          .upsert(predictedRows, {
            onConflict: 'user_id,account_id,source,counterparty,expected_date,amount',
          });
        if (error) {
          console.error('[sync-upcoming] predicted upsert failed:', error.message);
          summary.otherFailures++;
        } else {
          summary.predictedRowsUpserted += predictedRows.length;
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

      const tier = (profile?.subscription_tier || 'free') as 'free' | 'essential' | 'pro';
      // Pro: instant. Essential: email only (handled elsewhere). Free: in-app only.
      if (tier !== 'pro') continue;

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
  }

  // Business-log summary.
  try {
    const { error: logErr } = await supabase
      .from('business_log')
      .insert({
        event_type: 'upcoming_payments_sync',
        details: summary,
        severity: summary.otherFailures > 0 ? 'warning' : 'info',
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
