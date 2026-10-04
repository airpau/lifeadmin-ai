// POST /api/documents/find: "Find my documents" for the logged-in user.
//
// Available on every plan. This is the ONLY way documents are found on
// Free (no automatic scanning). Free saves at most
// PLAN_LIMITS.free.documentsPerMonth documents a calendar month: a cheap
// count before each classification, then the atomic documents_monthly_cap
// trigger at insert time. One run per user at a time (run-lock.ts), so a
// double click or a second tab gets a friendly "already running" reply
// instead of a second run classifying the same files. Looks back over the
// same window as the inbox scan (resolveEmailScanWindow).

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, documentQuota, getDocumentEntitlements } from '@/lib/documents/plan';
import { findDocumentsForUser } from '@/lib/documents/pipeline';
import { resolveEmailScanWindow } from '@/lib/email-scan-window';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { RUN_BUSY_MESSAGE, acquireDocumentRunLock, releaseDocumentRunLock } from '@/lib/documents/run-lock';

export const runtime = 'nodejs';
// Several inboxes one after another, with attachment downloads.
export const maxDuration = 300;

/** Upper bound on documents saved by one manual run on any plan (cost guard). */
const MANUAL_RUN_MAX_SAVES = 100;
/** Lock lifetime: longer than maxDuration, so it outlives any real run. */
const RUN_LOCK_TTL_SECONDS = 330;

export async function POST() {
  const startedAt = Date.now();
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const ent = await getDocumentEntitlements(user.id);
  const quota = await documentQuota(admin, user.id, ent);
  if (quota.remaining !== null && quota.remaining <= 0) {
    return NextResponse.json(
      { error: UPGRADE_COPY.quota(quota.limit ?? 0), upgradeRequired: true, minimumPlan: 'essential', upgradeUrl: '/pricing', quota },
      { status: 403 },
    );
  }

  const rate = await checkClaudeRateLimit(user.id, ent.tier);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'You have run a lot of searches recently. Please try again a little later.' }, { status: 429 });
  }

  const { count: inboxes } = await admin
    .from('email_connections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('auth_method', 'oauth')
    .eq('status', 'active')
    .is('archived_at', null);
  if (!inboxes) {
    return NextResponse.json(
      { error: 'Connect your Gmail or Outlook inbox first, then we can find your receipts and bills.', needsInbox: true },
      { status: 400 },
    );
  }

  const lock = await acquireDocumentRunLock(admin, user.id, RUN_LOCK_TTL_SECONDS, 'find');
  if (!lock.ok) {
    return lock.reason === 'busy'
      ? NextResponse.json({ error: RUN_BUSY_MESSAGE, alreadyRunning: true }, { status: 409 })
      : NextResponse.json({ error: 'Finding documents is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }

  const window = await resolveEmailScanWindow(user.id);
  const maxSaves = quota.remaining === null ? MANUAL_RUN_MAX_SAVES : Math.min(quota.remaining, MANUAL_RUN_MAX_SAVES);

  let summary;
  try {
    summary = await findDocumentsForUser(admin, {
      userId: user.id,
      ent,
      trigger: 'manual',
      deadlineAt: startedAt + 240_000,
      maxMessagesPerConnection: 40,
      maxSaves,
      lookbackDays: window.days,
      endpoint: '/api/documents/find',
    });
  } finally {
    await releaseDocumentRunLock(admin, user.id, lock.holder);
  }

  if (summary.classified > 0) {
    try {
      await recordClaudeCall(user.id, ent.tier);
    } catch {
      // rate-limit bookkeeping only
    }
  }

  const after = await documentQuota(admin, user.id, ent);
  return NextResponse.json({
    saved: summary.saved,
    duplicates: summary.duplicates,
    driveFiled: summary.driveFiled,
    driveFailed: summary.driveFailed,
    stoppedFor: summary.stoppedFor,
    connections: summary.connections.map((c) => ({
      email: c.email,
      provider: c.provider,
      status: c.status,
      saved: c.saved,
      error: c.error,
    })),
    quota: after,
    message:
      summary.stoppedFor === 'quota' && after.limit !== null
        ? UPGRADE_COPY.quota(after.limit)
        : summary.stoppedFor === 'time'
          ? 'We found plenty, so we stopped for now. Press the button again to carry on.'
          : null,
  });
}
