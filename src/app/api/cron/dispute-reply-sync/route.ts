/**
 * POST /api/cron/dispute-reply-sync
 *
 * Watchdog background sync. Iterates every linked dispute→email-thread,
 * respects per-tier minimum intervals, fetches new supplier replies, and
 * imports them into the dispute's correspondence timeline.
 *
 * Schedule: every 30 minutes  (cron: "*\/30 * * * *" in vercel.json; gated per-user by plan tier)
 * Auth:     Bearer CRON_SECRET
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §6
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PLAN_LIMITS, getEffectiveTier } from '@/lib/plan-limits';
import { syncLinkedThread } from '@/lib/dispute-sync/sync-runner';

export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

// Vercel cron invokes via GET by default — accept both.
export async function GET(request: NextRequest) {
  return POST(request);
}

async function runSync() {
  const startedAt = Date.now();
  const db = admin();

  // Grab all active linked threads, ordered by staleness so the longest-unsynced
  // run first if we hit the time budget.
  const { data: links, error } = await db
    .from('dispute_watchdog_links')
    .select('id, user_id, last_synced_at')
    .eq('sync_enabled', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: 'Failed to load linked threads' }, { status: 500 });
  }
  if (!links || links.length === 0) {
    return NextResponse.json({ success: true, processed: 0, imported: 0, skipped: 0 });
  }

  // Cache per-user tier so we only look it up once per run
  const tierCache = new Map<string, Awaited<ReturnType<typeof getEffectiveTier>>>();

  let processed = 0;
  let importedTotal = 0;
  let skipped = 0;
  const errors: Array<{ linkId: string; message: string }> = [];

  for (const link of links) {
    // 5-minute time budget — stop early if close to Vercel timeout
    if (Date.now() - startedAt > 270_000) break;

    // Tier gating
    let tier = tierCache.get(link.user_id);
    if (!tier) {
      tier = await getEffectiveTier(link.user_id);
      tierCache.set(link.user_id, tier);
    }

    const interval = PLAN_LIMITS[tier].watchdogSyncIntervalMinutes;

    // Free tier has manual-only sync — the cron skips them entirely
    if (interval === null) {
      skipped++;
      continue;
    }

    // Respect per-tier minimum interval
    if (link.last_synced_at) {
      const ageMs = Date.now() - new Date(link.last_synced_at).getTime();
      if (ageMs < interval * 60_000) {
        skipped++;
        continue;
      }
    }

    const result = await syncLinkedThread(link.id, { sendNotifications: true });
    processed++;
    if (result.imported > 0) importedTotal += result.imported;
    if (result.error) errors.push({ linkId: link.id, message: result.error });
  }

  return NextResponse.json({
    success: true,
    processed,
    imported: importedTotal,
    skipped,
    elapsedMs: Date.now() - startedAt,
    errors: errors.length ? errors : undefined,
  });
}
