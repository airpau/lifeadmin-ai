// src/app/api/cron/purge-soft-deletes/route.ts
//
// Daily cron — permanently removes bank_transactions rows that were
// soft-deleted more than 30 days ago via the disconnect modal's
// "Stop syncing and delete the transactions" option.
//
// The 30-day recovery window is the user-facing promise: after the
// soft-delete the user has up to a month to call /api/bank/restore
// and un-deleted_at the rows. This cron makes the second half of
// that promise real ("...then they're purged permanently").
//
// Without this cron, option 2 of the disconnect modal half-works:
// rows are hidden from the dashboard but never reclaimed, so the
// table grows forever. Adding it to vercel.json under
//   { "path": "/api/cron/purge-soft-deletes", "schedule": "0 4 * * *" }
// runs it daily at 04:00 UTC, after the 03:00 bank-sync but before
// users wake up.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // The RPC handles the WHERE deleted_at < now() - 30 days filter and
  // returns the row count it deleted. Wrapped in a single call so the
  // operation is atomic from the cron's perspective.
  const { data, error } = await supabase.rpc('purge_expired_soft_deletes');

  if (error) {
    console.error('[purge-soft-deletes] RPC error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const purged = Number(data ?? 0);
  console.log(`[purge-soft-deletes] purged ${purged} bank_transactions rows older than 30 days`);

  return NextResponse.json({ ok: true, purged });
}
