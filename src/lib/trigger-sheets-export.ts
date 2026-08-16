// src/lib/trigger-sheets-export.ts
//
// Fire-and-forget helper that pushes new transactions into a user's connected
// Google Sheet immediately after a bank sync.
//
// Called from:
//   - /api/bank/sync-now           (Money Hub manual "Sync" button)
//   - /api/cron/bank-sync          (3am/2pm/7pm tier-aware cron)
//   - /api/yapily/callback         (post-reconnect)
//   - /api/auth/google-sheets/callback (initial full export — uses full_export:true)
//
// The /api/google-sheets/export endpoint is idempotent (driven by
// last_synced_timestamp), so calling it on every sync costs nothing extra
// when there is no new data. The daily 6am cron at /api/cron/google-sheets-sync
// remains as a safety net for users whose bank sync hasn't fired recently.
//
// IMPORTANT: this never blocks the caller. The export is scheduled with
// Next's after() so it runs once the caller's response has been sent, but
// still inside a runtime that Vercel keeps alive. A bare un-awaited fetch()
// (what this used to do) is dropped when the lambda freezes on response —
// which is why post-sync sheet writes silently never happened in production.
// Errors are logged but never bubble up to the user.

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

type TriggerOpts = {
  /** When true, exports the user's full history (used on first connect). */
  fullExport?: boolean;
};

/**
 * Check whether the user has a connected Google Sheet, and if so kick off
 * an incremental export. Returns immediately — does not block the caller.
 */
export async function triggerSheetsExport(
  supabase: SupabaseClient,
  userId: string,
  opts: TriggerOpts = {}
): Promise<void> {
  try {
    const { data: conn } = await supabase
      .from('google_sheets_connections')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!conn) return; // no sheet connected — nothing to do

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const internalKey = process.env.INTERNAL_API_KEY;

    if (!appUrl || !internalKey) {
      console.error(
        'triggerSheetsExport: missing NEXT_PUBLIC_APP_URL or INTERNAL_API_KEY — skipping'
      );
      return;
    }

    const runExport = async () => {
      try {
        const res = await fetch(`${appUrl}/api/google-sheets/export`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': internalKey,
          },
          body: JSON.stringify({
            user_id: userId,
            full_export: opts.fullExport === true,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error(
            `triggerSheetsExport: export returned ${res.status} for user ${userId}: ${text.slice(0, 300)}`
          );
        }
      } catch (err) {
        console.error(`triggerSheetsExport: fetch failed for user ${userId}:`, err);
      }
    };

    try {
      // Runs after the caller's response is flushed, with the runtime kept alive.
      after(runExport);
    } catch {
      // after() throws outside a request/render context (e.g. a script or a
      // non-Next caller). Fall back to running it inline so the work isn't lost.
      await runExport();
    }
  } catch (err) {
    // Never let sheets-export wiring break a bank sync.
    console.error(`triggerSheetsExport: unexpected error for user ${userId}:`, err);
  }
}
