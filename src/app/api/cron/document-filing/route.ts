// GET /api/cron/document-filing: automatic daily document filing for
// Essential and above (PlanLimits.autoDocumentFiling).
//
// OFF BY DEFAULT. Scheduled in vercel.json, but returns a no-op unless
// DOCUMENT_FILING_CRON_ENABLED === 'true', so the founder decides when
// the Anthropic spend starts. Protected with CRON_SECRET like every
// other cron.
//
// Candidates are chosen in the query: users on a paid tier, in an
// onboarding trial or holding a Household seat, then those with an active
// OAuth inbox, least recently filed first. Free users are never read, so
// they cannot crowd paid users out. CRON_SECRET must be set; an unset
// secret rejects every call. Each user is run under the per-user
// documents lock, so a cron run never overlaps that user's own Find.
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
import { priceRiseWatchAfterFiling } from '@/lib/documents/price-rise-watch';
import { getEffectiveTier } from '@/lib/plan-limits';
import { FULL_EMAIL_SCAN_DAYS } from '@/lib/email-scan-window';
import { PAID_PLAN_TIERS } from '@/lib/tier-rank';
import { acquireDocumentRunLock, releaseDocumentRunLock } from '@/lib/documents/run-lock';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RUN_BUDGET_MS = 250_000;
const PER_USER_MS = 60_000;
const PER_USER_MAX_SAVES = 25;
const PER_CONNECTION_MAX_MESSAGES = 30;
const MIN_TIME_TO_START_USER_MS = 40_000;
/** Upper bound on candidate users read per run (safety cap). */
const MAX_CANDIDATE_USERS = 20_000;
/** First automatic run for an inbox with no cursor looks back this far. */
const FIRST_RUN_LOOKBACK_DAYS = 30;

export async function GET(req: NextRequest) {
  // Reject outright when CRON_SECRET is unset, so "Bearer undefined" can
  // never authenticate.
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (process.env.DOCUMENT_FILING_CRON_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: 'DOCUMENT_FILING_CRON_ENABLED is not true' });
  }

  const startedAt = Date.now();
  const runDeadline = startedAt + RUN_BUDGET_MS;
  const admin = documentsAdmin();

  // 1. Users who may be entitled, found in the query itself so Free
  //    inboxes (the majority) can never crowd paid users out of a limit:
  //    stored paid tiers, open onboarding trials and active Household
  //    seats. getEffectiveTier still makes the final call per user.
  const nowIso = new Date().toISOString();
  const entitled = new Set<string>();
  for (let from = 0; from < MAX_CANDIDATE_USERS; from += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      // The timestamp is quoted: it contains '.' and ':', which PostgREST
      // treats as reserved inside or().
      .or(`subscription_tier.in.(${PAID_PLAN_TIERS.join(',')}),trial_ends_at.gt."${nowIso}"`)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error('[cron document-filing] profile lookup failed:', error.message);
      return NextResponse.json({ ok: false, error: 'profile_lookup_failed' }, { status: 500 });
    }
    for (const p of data ?? []) entitled.add(p.id as string);
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; from < MAX_CANDIDATE_USERS; from += 1000) {
    const { data } = await admin
      .from('household_members')
      .select('user_id')
      .eq('status', 'active')
      .order('user_id', { ascending: true })
      .range(from, from + 999);
    for (const m of data ?? []) if (m.user_id) entitled.add(m.user_id as string);
    if ((data ?? []).length < 1000) break;
  }

  // 2. Of those, users with an active OAuth inbox, least recently filed first.
  const oldestCursor = new Map<string, string | null>();
  const entitledIds = Array.from(entitled);
  for (let i = 0; i < entitledIds.length; i += 200) {
    const { data: conns, error } = await admin
      .from('email_connections')
      .select('user_id, documents_scanned_at')
      .in('user_id', entitledIds.slice(i, i + 200))
      .eq('auth_method', 'oauth')
      .eq('status', 'active')
      .is('archived_at', null);
    if (error) {
      console.error('[cron document-filing] connection lookup failed:', error.message);
      return NextResponse.json({ ok: false, error: 'connection_lookup_failed' }, { status: 500 });
    }
    for (const c of conns ?? []) {
      const id = c.user_id as string;
      const at = (c.documents_scanned_at as string | null) ?? null;
      if (!oldestCursor.has(id)) oldestCursor.set(id, at);
      else {
        const prev = oldestCursor.get(id) ?? null;
        if (prev !== null && (at === null || Date.parse(at) < Date.parse(prev))) oldestCursor.set(id, at);
      }
    }
  }
  const userIds = Array.from(oldestCursor.keys()).sort((x, y) => {
    const a = oldestCursor.get(x) ?? null;
    const b = oldestCursor.get(y) ?? null;
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return Date.parse(a) - Date.parse(b);
  });
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
      // Skip a user whose own "Find my documents" (or import) is running.
      const lock = await acquireDocumentRunLock(admin, userId, Math.ceil(PER_USER_MS / 1000) + 60, 'cron');
      if (!lock.ok) {
        results.push({ user: userId.slice(0, 8), status: lock.reason === 'busy' ? 'busy' : 'lock_unavailable' });
        continue;
      }
      const userDeadline = Math.min(runDeadline, Date.now() + PER_USER_MS);
      let summary;
      try {
        summary = await findDocumentsForUser(admin, {
          userId,
          ent,
          trigger: 'cron',
          deadlineAt: userDeadline,
          maxMessagesPerConnection: PER_CONNECTION_MAX_MESSAGES,
          maxSaves: quota.remaining === null ? PER_USER_MAX_SAVES : Math.min(quota.remaining, PER_USER_MAX_SAVES),
          lookbackDays: Math.min(FIRST_RUN_LOOKBACK_DAYS, FULL_EMAIL_SCAN_DAYS),
          endpoint: '/api/cron/document-filing',
        });
      } finally {
        await releaseDocumentRunLock(admin, userId, lock.holder);
      }
      usersRun++;
      saved += summary.saved;
      // Price-rise watch over the new bills (no AI call).
      await priceRiseWatchAfterFiling(admin, userId, ent.priceRiseWatch, summary.saved);
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
    entitledUsers: entitled.size,
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
