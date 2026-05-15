// src/app/api/money-hub/upcoming/route.ts
//
// GET /api/money-hub/upcoming?days=7|14|30
//
// Returns the user's upcoming payments bucketed by date with
// incoming/outgoing totals. Reads from the `upcoming_payments`
// table populated by /api/cron/sync-upcoming.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applySpaceToTxnQuery, resolveActiveSpaceFromRequest } from '@/lib/spaces';

export const dynamic = 'force-dynamic';

export interface UpcomingPaymentRow {
  id: string;
  account_id: string;
  source:
    | 'pending_credit'
    | 'pending_debit'
    | 'scheduled_payment'
    | 'standing_order'
    | 'direct_debit'
    | 'predicted_recurring';
  direction: 'incoming' | 'outgoing';
  counterparty: string | null;
  amount: number;
  currency: string;
  expected_date: string;
  confidence: number | null;
  yapily_resource_id: string | null;
}

export interface UpcomingDayGroup {
  date: string;         // YYYY-MM-DD
  items: UpcomingPaymentRow[];
  incoming: number;
  outgoing: number;
  net: number;
}

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
  // Empty-state context so the widget can distinguish between
  // "no bank yet" and "bank connected but nothing scheduled".
  hasBankConnected: boolean;
  // Whether any of the connected banks are on a provider that
  // actually feeds upcoming_payments (currently Yapily only).
  hasUpcomingCapableBank: boolean;
}

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
      'id, connection_id, account_id, source, direction, counterparty, amount, currency, expected_date, confidence, yapily_resource_id',
    )
    .eq('user_id', user.id)
    .gte('expected_date', from)
    .lte('expected_date', to)
    .order('expected_date', { ascending: true });

  if (!includePredicted) {
    query = query.neq('source', 'predicted_recurring');
  }
  query = applySpaceToTxnQuery(query, activeSpace);

  let connQuery = supabase
    .from('bank_connections')
    .select('id, provider, status')
    .eq('user_id', user.id)
    .neq('status', 'revoked');

  let futureTxnQuery = supabase
    .from('bank_transactions')
    .select('id, amount, description, merchant_name, timestamp, category, user_category, connection_id, account_id')
    .eq('user_id', user.id)
    .gt('timestamp', new Date().toISOString())
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
  // Yapily connections populate upcoming_payments; future-dated bank_transactions also work.
  const hasUpcomingCapableBank =
    conns.some((c) => c.provider === 'yapily' && c.status === 'active') ||
    !!(futureTxns && futureTxns.length > 0);

  // Convert future-dated bank_transactions to UpcomingPaymentRow shape.
  // Deduplicate against upcoming_payments rows using the transaction id.
  const existingIds = new Set((data || []).map((r: any) => r.yapily_resource_id).filter(Boolean));
  const futureRows: UpcomingPaymentRow[] = (futureTxns || [])
    .filter((t: any) => !existingIds.has(t.id))
    .map((t: any) => {
      const amount = parseFloat(t.amount);
      const date = t.timestamp.slice(0, 10);
      return {
        id: t.id,
        account_id: '',
        source: amount > 0 ? 'pending_credit' : 'pending_debit',
        direction: amount > 0 ? 'incoming' : 'outgoing',
        counterparty: t.merchant_name || t.description || null,
        amount: Math.abs(amount),
        currency: 'GBP',
        expected_date: date,
        confidence: 0.95, // future-dated = Yapily told us about it explicitly
        yapily_resource_id: t.id,
      } as UpcomingPaymentRow;
    });

  const rows: UpcomingPaymentRow[] = [
    ...((data || []) as UpcomingPaymentRow[]),
    ...futureRows,
  ].sort((a, b) => a.expected_date.localeCompare(b.expected_date));
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

    if (r.source === 'predicted_recurring') predictedCount++;
    else confirmedCount++;
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const body: UpcomingApiResponse = {
    days,
    from,
    to,
    groups,
    totals: {
      incoming: Math.round(totalIncoming * 100) / 100,
      outgoing: Math.round(totalOutgoing * 100) / 100,
      net: Math.round((totalIncoming - totalOutgoing) * 100) / 100,
      confirmedCount,
      predictedCount,
    },
    hasBankConnected,
    hasUpcomingCapableBank,
  };

  return NextResponse.json(body);
}
