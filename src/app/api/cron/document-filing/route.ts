// GET /api/cron/document-filing: automatic daily document filing for
// Essential and above (PlanLimits.autoDocumentFiling).
//
// OFF BY DEFAULT. Scheduled in vercel.json, but returns a no-op unless
// DOCUMENT_FILING_CRON_ENABLED === 'true', so the founder decides when
// the Anthropic spend starts. Protected with CRON_SECRET like every
// other cron.
//
// Budget: the whole run stops starting new users at ~250s of the 300s
// limit. Each user gets at most PER_USER_MS and PER_USER_MAX_SAVES per
// run, and inboxes are visited least recently filed first, so a busy
// day does not starve the same people. The cron is incremental: each
// inbox is searched from its documents_scanned_at cursor (less a two
// day overlap), and the processed-messages ledger stops any message
// being handled twice.
//
// It never sends anything to anyone. It only writes into each user's
// own vault and, for Pro with Drive connected, their own Drive.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { documentEntitlements, documentQuota } from '@/lib/documents/plan';
import { findDocumentsForUser } from '@/lib/documents/pipeline';
import { getEffectiveTier } from '@/lib/plan-limits';
import { FULL_EMAIL_SCAN_DAYS } from '@/lib/email-scan-window';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RUN_BUDGET_MS = 250_000;
const PER_USER_MS = 60_000;
const PER_USER_MAX_SAVES = 25;
const PER_CONNECTION_MAX_MESSAGES = 30;
const MIN_TIME_TO_START_USER_MS = 40_000;
/** First automatic run for an inbox with no cursor looks back this far. */
const FIRST_RUN_LOOKBACK_DAYS = 30;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (process.env.DOCUMENT_FILING_CRON_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: 'DOCUMENT_FILING_CRON_ENABLED is not true' });
  }

  const startedAt = Date.now();
  const runDeadline = startedAt + RUN_BUDGET_MS;
  const admin = documentsAdmin();

  // Users with at least one active OAuth inbox, least recently filed first.
  const { data: conns, error } = await admin
    .from('email_connections')
    .select('user_id, documents_scanned_at')
    .eq('auth_method', 'oauth')
    .eq('status', 'active')
    .is('archived_at', null)
    .order('documents_scanned_at', { ascending: true, nullsFirst: true })
    .limit(2000);
  if (error) {
    console.error('[cron document-filing] connection lookup failed:', error.message);
    return NextResponse.json({ ok: false, error: 'connection_lookup_failed' }, { status: 500 });
  }
  const connectedIds: string[] = [];
  const seen = new Set<string>();
  for (const c of conns ?? []) {
    const id = c.user_id as string;
    if (!seen.has(id)) {
      seen.add(id);
      connectedIds.push(id);
    }
  }

  // Cheap pre-filter so Free users (the majority) never cost a tier
  // lookup each: keep stored paid tiers, open onboarding trials and
  // active Household seats. getEffectiveTier still makes the final call.
  const maybeEntitled = new Set<string>();
  const nowIso = new Date().toISOString();
  for (let i = 0; i < connectedIds.length; i += 200) {
    const chunk = connectedIds.slice(i, i + 200);
    const [{ data: profiles }, { data: seats }] = await Promise.all([
      admin.from('profiles').select('id, subscription_tier, trial_ends_at').in('id', chunk),
      admin.from('household_members').select('user_id').in('user_id', chunk).eq('status', 'active'),
    ]);
    for (const p of profiles ?? []) {
      const paid = !!p.subscription_tier && p.subscription_tier !== 'free';
      const trial = !!p.trial_ends_at && (p.trial_ends_at as string) > nowIso;
      if (paid || trial) maybeEntitled.add(p.id as string);
    }
    for (const m of seats ?? []) maybeEntitled.add(m.user_id as string);
  }
  const userIds = connectedIds.filter((id) => maybeEntitled.has(id));

  const results: Array<{ user: string; status: string; saved?: number; duplicates?: number; driveFiled?: number; error?: string }> = [];
  let usersRun = 0;
  let notEntitled = 0;
  let saved = 0;

  for (const userId of userIds) {
    if (Date.now() > runDeadline - MIN_TIME_TO_START_USER_MS) break;
    try {
      const ent = documentEntitlements(await getEffectiveTier(userId));
      if (!ent.autoDocumentFiling) {
        notEntitled++;
        continue;
      }
      const quota = await documentQuota(admin, userId, ent);
      if (quota.remaining !== null && quota.remaining <= 0) {
        results.push({ user: userId.slice(0, 8), status: 'quota' });
        continue;
      }
      const userDeadline = Math.min(runDeadline, Date.now() + PER_USER_MS);
      const summary = await findDocumentsForUser(admin, {
        userId,
        ent,
        trigger: 'cron',
        deadlineAt: userDeadline,
        maxMessagesPerConnection: PER_CONNECTION_MAX_MESSAGES,
        maxSaves: quota.remaining === null ? PER_USER_MAX_SAVES : Math.min(quota.remaining, PER_USER_MAX_SAVES),
        lookbackDays: Math.min(FIRST_RUN_LOOKBACK_DAYS, FULL_EMAIL_SCAN_DAYS),
        endpoint: '/api/cron/document-filing',
      });
      usersRun++;
      saved += summary.saved;
      results.push({
        user: userId.slice(0, 8),
        status: summary.stoppedFor ?? 'ok',
        saved: summary.saved,
        duplicates: summary.duplicates,
        driveFiled: summary.driveFiled,
      });
    } catch (err) {
      // One user's failure never stops the run.
      results.push({ user: userId.slice(0, 8), status: 'error', error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' });
    }
  }

  const body = {
    ok: true,
    connectedUsers: connectedIds.length,
    candidates: userIds.length,
    usersRun,
    notEntitled,
    saved,
    elapsedMs: Date.now() - startedAt,
    results: results.slice(0, 200),
  };
  console.log('[cron document-filing]', JSON.stringify({ ...body, results: undefined }));
  return NextResponse.json(body);
}
