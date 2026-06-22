/**
 * Phase 2 learner — recompute each user's preferred_alert_hour from the
 * intelligence ledger. Calls the set-based update_preferred_alert_hours()
 * function (migration 20260621160000) so the heavy lifting stays in Postgres.
 *
 * Daily. Auth: authorizeAdminOrCron (Bearer CRON_SECRET or founder session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const minSamples = Number(process.env.SEND_TIME_MIN_SAMPLES ?? 8);
  const sb = admin();
  const { data, error } = await sb.rpc('update_preferred_alert_hours', {
    min_samples: minSamples,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, users_updated: data ?? 0 });
}
