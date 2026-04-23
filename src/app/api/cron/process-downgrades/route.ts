/**
 * Daily cron: process every active plan_downgrade_events row.
 *
 * For each event:
 *   - If the user upgraded back to ≥ their original tier → resolve upgraded_back
 *   - If the user manually disconnected below the new cap → resolve user_pruned
 *   - Send T-7 + T-1 reminder notifications when appropriate
 *   - At T+0 (grace ended), archive overflow and resolve auto_archived
 *
 * Runs once a day — no rush, the grace window is 14 days wide.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processActiveEvents } from '@/lib/plan-downgrade';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const admin = getAdmin();
  const result = await processActiveEvents(admin as any);
  return NextResponse.json({ ok: true, ...result });
}
