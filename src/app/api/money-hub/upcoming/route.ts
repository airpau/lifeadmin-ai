// src/app/api/money-hub/upcoming/route.ts
//
// GET /api/money-hub/upcoming?days=7|14|30
//
// The forward view for Money Hub: what is LANDING, what is LEAVING, and
// what is LEFT. Three data sources are merged here, in descending order
// of trust:
//
//   1. Future-dated rows in `bank_transactions`. HSBC (and others)
//      return scheduled payments as ordinary transaction rows dated on
//      the day they are DUE — confirmed in production, e.g. rows dated
//      17 Aug synced on 15 Aug with is_pending = false. The bank has
//      already scheduled these, so they are the strongest signal we
//      have. See src/lib/alerts/future-dated.ts for the alerting guard.
//   2. Deterministic `upcoming_payments` rows from Yapily's
//      scheduled-payments / periodic-payments / direct-debits endpoints
//      and pending transactions.
//   3. Predicted rows from the recurrence detectors —
//      `predicted_recurring` (outgoings) and `predicted_income`
//      (salary, regular client payments, benefits).
//
// Conflicts are resolved in resolveDuplicates() below: a confirmed item
// always beats a predicted one for the same counterparty and date, so a
// direct debit the bank has already scheduled is never double-counted
// against the pattern we detected for the same merchant.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applySpaceToTxnQuery, resolveActiveSpaceFromRequest } from '@/lib/spaces';
import { normaliseCounterparty } from '@/lib/upcoming/detect-recurring';
import { endOfTodayLondonIso, londonDateKey } from '@/lib/alerts/future-dated';

export const dynamic = 'force-dynamic';

export type UpcomingSource =
  | 'pending_credit'
  | 'pending_debit'
  | 'scheduled_payment'
  | 'standing_order'
  | 'direct_debit'
  | 'predicted_recurring'
  | 'predicted_income'
  | 'future_dated_txn';

/** How sure are we this will actually happen? Drives the UI label:
 *  "Scheduled by your bank" / "Regular payment" / "Predicted". */
export type UpcomingCertainty = 'bank_scheduled' | 'regular' | 'predicted';

export interface UpcomingPaymentRow {
  id: string;
  account_id: string;
  source: UpcomingSource;
  certainty: UpcomingCertainty;
  direction: 'incoming' | 'outgoing';
  counterparty: string | null;
  amount: number;
  currency: string;
  expected_date: string;
  confidence: number | null;
  yapily_resource_id: string | null;
  /** Present on predicted rows: 'Monthly', 'Most weekdays', … */
  cadence: string | null;
  /** Present on volatile predicted income — the p25..p75 spread. */
  amount_low: number | null;
  amount_high: number | null;
  /** True when the pound figure should be read as "about", not exact. */
  amount_varies: boolean;
}

export interface UpcomingDayGroup {
  date: string;         // YYYY-MM-DD
  items: UpcomingPaymentRow[];
  incoming: number;
  outgoing: number;
  net: number;
}

export interface UpcomingProjection {
  /** False when no connected account reports a balance — the UI must
   *  then show net movement instead of an invented balance. */
  balanceAvailable: boolean;
  currentBalance: number | null;
  expectedIncoming: number;
  expectedOutgoing: number;
  /** currentBalance + incoming − outgoing. Null when no balance. */
  projectedBalance: number | null;
  /** incoming − outgoing. Always available. */
  netMovement: number;
  /** Lowest point the projected balance reaches inside the window,
   *  walking day by day. Null when no balance. */
  lowestPoint: number | null;
  lowestPointDate: string | null;
  balanceUpdatedAt: string | null;
}

export type UpcomingEmptyReason =
  | 'no_bank'
  | 'consent_expired'
  | 'no_forward_data'
  | null;

export interface UpcomingApiResponse {
  days: number;
  from: string;
  to: string;
  groups: UpcomingDayGroup[];
  totals: {
    incoming: number;
    outgoing: number;
    net: number;
    confirmedCount: number;
    predictedCount: number;
  };
  projection: UpcomingProjection;
  // Empty-state context so the widget can distinguish between
  // "no bank yet" and "bank connected but nothing scheduled".
  hasBankConnected: boolean;
  // Whether any of the connected banks are on a provider that
  // actually feeds upcoming_payments (currently Yapily only).
  hasUpcomingCapableBank: boolean;
  emptyReason: UpcomingEmptyReason;
}

const CERTAINTY_BY_SOURCE: Record<UpcomingSource, UpcomingCertainty> = {
  future_dated_txn: 'bank_scheduled',
  pending_credit: 'bank_scheduled',
  pending_debit: 'bank_scheduled',
  scheduled_payment: 'bank_scheduled',
  standing_order: 'regular',
  direct_debit: 'regular',
  predicted_recurring: 'predicted',
  predicted_income: 'predicted',
};

const CERTAINTY_RANK: Record<UpcomingCertainty, number> = {
  bank_scheduled: 3,
  regular: 2,
  predicted: 1,
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = parseInt(url.searchParams.get('days') || '7', 10);
  const days = [7, 14, 30].includes(requested) ? requested : 7;
  const includePredicted = url.searchParams.get('predicted') !== '0';

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const from = today.toISOString().slice(0, 10);
  const horizon = new Date(today.getTime() + days * 86_400_000);
  const to = horizon.toISOString().slice(0, 10);

  // Resolve the active Space so this endpoint matches the filter the
  // main Money Hub view is showing. Default Space → no filter.
  const activeSpace = await resolveActiveSpaceFromRequest(supabase, user.id, request);

  let query = supabase
    .from('upcoming_payments')
    .select(
      'id, connection_id, account_id, source, direction, counterparty, amount, currency, expected_date, confidence, yapily_resource_id, raw',
    )
    .eq('user_id', user.id)
    .gte('expected_date', from)
    .lte('expected_date', to)
    .order('expected_date', { ascending: true });

  if (!includePredicted) {
    query = query.not('source', 'in', '(predicted_recurring,predicted_income)');
  }
  query = applySpaceToTxnQuery(query, activeSpace);

  let connQuery = supabase
    .from('bank_connections')
    .select('id, provider, status, current_balance, balance_updated_at')
    .eq('user_id', user.id)
    .neq('status', 'revoked');

  // Future-dated transactions: strictly AFTER the end of today in
  // Europe/London. A row stamped midnight today is today's money, not
  // tomorrow's — londonDateKey handles the timezone edge.
  let futureTxnQuery = supabase
    .from('bank_transactions')
    .select('id, amount, description, merchant_name, timestamp, category, user_category, connection_id, account_id')
    .eq('user_id', user.id)
    .gt('timestamp', endOfTodayLondonIso())
    .lte('timestamp', horizon.toISOString())
    .order('timestamp', { ascending: true });
  futureTxnQuery = applySpaceToTxnQuery(futureTxnQuery, activeSpace);

  // Apply space filter to connections list too (used for hasBankConnected)
  // so that a Business-only space doesn't say "you have a bank" when the
  // user's only connection in that space is excluded.
  const spaceTxnFilter = (() => {
    const refs = activeSpace?.account_refs ?? [];
    const conns = activeSpace?.connection_ids ?? [];
    if (conns.length === 0 && refs.length === 0) return null;
    const set = new Set<string>(conns);
    for (const r of refs) {
      const id = r.split(':')[0];
      if (id) set.add(id);
    }
    return Array.from(set);
  })();
  if (spaceTxnFilter) {
    connQuery = connQuery.in('id', spaceTxnFilter);
  }

  const [{ data, error }, { data: connections }, { data: futureTxns }] = await Promise.all([
    query,
    connQuery,
    futureTxnQuery,
  ]);
  if (error) {
    console.error('[upcoming] list failed:', error.message);
    return NextResponse.json({ error: 'Failed to load upcoming payments' }, { status: 500 });
  }

  const conns = connections || [];
  const hasBankConnected = conns.length > 0;
  const activeConns = conns.filter((c) => c.status === 'active');
  // Yapily connections populate upcoming_payments; future-dated bank_transactions also work.
  const hasUpcomingCapableBank =
    activeConns.some((c) => c.provider === 'yapily') ||
    !!(futureTxns && futureTxns.length > 0);

  // ── Source 2 + 3: upcoming_payments ───────────────────────────────
  const storedRows: UpcomingPaymentRow[] = ((data || []) as StoredRow[]).map((r) => {
    const raw = (r.raw || {}) as Record<string, unknown>;
    const source = r.source as UpcomingSource;
    const low = numOrNull(raw.amountLow);
    const high = numOrNull(raw.amountHigh);
    const variability = numOrNull(raw.amountVariability) ?? 0;
    return {
      id: r.id,
      account_id: r.account_id,
      source,
      certainty: CERTAINTY_BY_SOURCE[source] ?? 'predicted',
      direction: r.direction,
      counterparty: r.counterparty,
      amount: Number(r.amount),
      currency: r.currency || 'GBP',
      expected_date: r.expected_date,
      confidence: r.confidence === null ? null : Number(r.confidence),
      yapily_resource_id: r.yapily_resource_id,
      cadence: typeof raw.cadence === 'string' ? raw.cadence : null,
      amount_low: low,
      amount_high: high,
      amount_varies: variability > 0.35,
    };
  });

  // ── Source 1: future-dated bank_transactions ──────────────────────
  const futureRows: UpcomingPaymentRow[] = (futureTxns || []).map((t) => {
    const amount = parseFloat(String(t.amount)) || 0;
    return {
      id: `txn:${t.id}`,
      account_id: t.account_id || '',
      source: 'future_dated_txn',
      certainty: 'bank_scheduled',
      direction: amount > 0 ? 'incoming' : 'outgoing',
      counterparty: t.merchant_name || t.description || null,
      amount: Math.abs(amount),
      currency: 'GBP',
      // Group by the London calendar date the money moves, matching how
      // expected_date is stored for every other source.
      expected_date: londonDateKey(t.timestamp),
      confidence: 1,
      yapily_resource_id: t.id,
      cadence: null,
      amount_low: null,
      amount_high: null,
      amount_varies: false,
    };
  });

  const rows = resolveDuplicates([...futureRows, ...storedRows]).filter(
    (r) => r.expected_date >= from && r.expected_date <= to,
  );

  const groupsMap = new Map<string, UpcomingDayGroup>();

  let totalIncoming = 0;
  let totalOutgoing = 0;
  let confirmedCount = 0;
  let predictedCount = 0;

  for (const r of rows) {
    const g = groupsMap.get(r.expected_date) || {
      date: r.expected_date,
      items: [],
      incoming: 0,
      outgoing: 0,
      net: 0,
    };
    g.items.push(r);
    if (r.direction === 'incoming') {
      g.incoming += Number(r.amount);
      totalIncoming += Number(r.amount);
    } else {
      g.outgoing += Number(r.amount);
      totalOutgoing += Number(r.amount);
    }
    g.net = g.incoming - g.outgoing;
    groupsMap.set(r.expected_date, g);

    if (r.certainty === 'predicted') predictedCount++;
    else confirmedCount++;
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  for (const g of groups) {
    // Biggest movements first inside a day, incoming ahead of outgoing —
    // "what's landing" is the first question the page answers.
    g.items.sort(
      (a, b) =>
        (a.direction === b.direction ? 0 : a.direction === 'incoming' ? -1 : 1) ||
        b.amount - a.amount,
    );
  }

  // ── Projection ────────────────────────────────────────────────────
  // Balances live on bank_connections.current_balance and are frequently
  // null (HSBC Business currently returns none). Never invent a number:
  // when nothing reports a balance we hand back netMovement only and the
  // UI shows "what's left" as a movement, not a balance.
  const balanceConns = activeConns.filter((c) => c.current_balance !== null);
  const balanceAvailable = balanceConns.length > 0;
  const currentBalance = balanceAvailable
    ? round2(
        balanceConns.reduce(
          (s, c) => s + (parseFloat(String(c.current_balance)) || 0),
          0,
        ),
      )
    : null;

  let lowestPoint: number | null = null;
  let lowestPointDate: string | null = null;
  if (currentBalance !== null) {
    let running = currentBalance;
    for (const g of groups) {
      running = running + g.incoming - g.outgoing;
      if (lowestPoint === null || running < lowestPoint) {
        lowestPoint = round2(running);
        lowestPointDate = g.date;
      }
    }
  }

  const projection: UpcomingProjection = {
    balanceAvailable,
    currentBalance,
    expectedIncoming: round2(totalIncoming),
    expectedOutgoing: round2(totalOutgoing),
    projectedBalance:
      currentBalance === null
        ? null
        : round2(currentBalance + totalIncoming - totalOutgoing),
    netMovement: round2(totalIncoming - totalOutgoing),
    lowestPoint,
    lowestPointDate,
    balanceUpdatedAt:
      (balanceConns[0]?.balance_updated_at as string | null | undefined) ?? null,
  };

  const emptyReason: UpcomingEmptyReason =
    rows.length > 0
      ? null
      : !hasBankConnected
        ? 'no_bank'
        : activeConns.length === 0
          ? 'consent_expired'
          : 'no_forward_data';

  const body: UpcomingApiResponse = {
    days,
    from,
    to,
    groups,
    totals: {
      incoming: round2(totalIncoming),
      outgoing: round2(totalOutgoing),
      net: round2(totalIncoming - totalOutgoing),
      confirmedCount,
      predictedCount,
    },
    projection,
    hasBankConnected,
    hasUpcomingCapableBank,
    emptyReason,
  };

  return NextResponse.json(body);
}

// ─── conflict resolution ───────────────────────────────────────────
/**
 * Collapse the three sources onto one row per (counterparty, date).
 *
 * Two payments genuinely can fall on the same day for the same
 * counterparty, so the key includes the rounded amount for confirmed
 * rows. Predicted rows are matched loosely — on counterparty and date
 * only — because the whole point of a prediction is that its amount is
 * an estimate, and a £47.29 Raylo direct debit the bank has already
 * scheduled must suppress the £37.44 Raylo prediction for the same day
 * rather than sit next to it.
 *
 * Predicted rows are also suppressed when a confirmed row for the same
 * counterparty lands within ±2 days, which covers a direct debit that
 * settles a day either side of the detected cadence.
 */
// Not exported: Next.js route modules must only export route handlers
// and the known config symbols.
function resolveDuplicates(rows: UpcomingPaymentRow[]): UpcomingPaymentRow[] {
  // Strongest evidence first, so anything kept is always at least as
  // trustworthy as the row it suppresses.
  const sorted = [...rows].sort(
    (a, b) =>
      CERTAINTY_RANK[b.certainty] - CERTAINTY_RANK[a.certainty] ||
      a.expected_date.localeCompare(b.expected_date),
  );

  const kept: UpcomingPaymentRow[] = [];
  // "party|direction" → the rows we've already committed to for it.
  const keptByParty = new Map<
    string,
    Array<{ date: string; rank: number; amountPence: number }>
  >();

  for (const r of sorted) {
    const party = normaliseCounterparty(r.counterparty || '') || '∅';
    const key = `${party}|${r.direction}`;
    const rank = CERTAINTY_RANK[r.certainty];
    const amountPence = Math.round(r.amount * 100);
    const existing = keptByParty.get(key) || [];

    // Exact repeat of something already kept — same party, same day,
    // same amount. Always a duplicate, whatever the source.
    if (existing.some((e) => e.date === r.expected_date && e.amountPence === amountPence)) {
      continue;
    }

    // A weaker source for the same counterparty within ±2 days is the
    // same payment seen twice: the direct-debit mandate row and the
    // future-dated transaction the bank raised for it, or the detected
    // pattern and the real scheduled instance. Amounts legitimately
    // differ between those views, so we match on party and date only.
    if (
      existing.some(
        (e) => e.rank > rank && Math.abs(daysBetween(e.date, r.expected_date)) <= 2,
      )
    ) {
      continue;
    }

    // Two predictions for the same counterparty on the same day — one
    // merchant can't be picked up twice by the detectors.
    if (
      rank === CERTAINTY_RANK.predicted &&
      existing.some((e) => e.rank === rank && e.date === r.expected_date)
    ) {
      continue;
    }

    existing.push({ date: r.expected_date, rank, amountPence });
    keptByParty.set(key, existing);
    kept.push(r);
  }

  return kept.sort(
    (a, b) => a.expected_date.localeCompare(b.expected_date) || b.amount - a.amount,
  );
}

// ─── helpers ───────────────────────────────────────────────────────
interface StoredRow {
  id: string;
  connection_id: string | null;
  account_id: string;
  source: string;
  direction: 'incoming' | 'outgoing';
  counterparty: string | null;
  amount: number | string;
  currency: string | null;
  expected_date: string;
  confidence: number | string | null;
  yapily_resource_id: string | null;
  raw: unknown;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.round(
    (new Date(`${bIso}T00:00:00Z`).getTime() - new Date(`${aIso}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}
