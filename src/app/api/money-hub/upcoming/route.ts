// src/app/api/money-hub/upcoming/route.ts
//
// GET /api/money-hub/upcoming?days=7|14|30
//
// Returns the user's upcoming payments bucketed by date with
// incoming/outgoing totals. Reads from the `upcoming_payments`
// table populated by /api/cron/sync-upcoming.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  // TrueLayer-only users will see a "nothing scheduled" state
  // because upcoming-payments data is not available for them.
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

  let query = supabase
    .from('upcoming_payments')
    .select(
      'id, account_id, source, direction, counterparty, amount, currency, expected_date, confidence, yapily_resource_id',
    )
    .eq('user_id', user.id)
    .gte('expected_date', from)
    .lte('expected_date', to)
    .order('expected_date', { ascending: true });

  if (!includePredicted) {
    query = query.neq('source', 'predicted_recurring');
  }

  const [{ data, error }, { data: connections }] = await Promise.all([
    query,
    supabase
      .from('bank_connections')
      .select('provider, status')
      .eq('user_id', user.id)
      .neq('status', 'revoked'),
  ]);
  if (error) {
    console.error('[upcoming] list failed:', error.message);
    return NextResponse.json({ error: 'Failed to load upcoming payments' }, { status: 500 });
  }

  const conns = connections || [];
  const hasBankConnected = conns.length > 0;
  // Only Yapily connections populate upcoming_payments today.
  const hasUpcomingCapableBank = conns.some((c) => c.provider === 'yapily' && c.status === 'active');

  const rows = (data || []) as UpcomingPaymentRow[];
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
