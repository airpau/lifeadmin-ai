/**
 * GET /api/cron/whatsapp-evening-digest
 *
 * ONE consolidated evening message per user, 18:00 UTC daily.
 *
 * Part of the 2026-08-16 WhatsApp cost/fatigue rework. Every noisy cron
 * (income-received, large-debit-alert, budget alerts, whatsapp-alerts,
 * whatsapp-daily-checks) now ENQUEUES a compact one-line item into
 * `whatsapp_alert_queue` with a 'digest:' dedup prefix instead of firing
 * its own individually-billed template. The send facade
 * (src/lib/whatsapp/index.ts) also enqueues anything it defers for quiet
 * hours or the 2-paid-templates-per-day cap.
 *
 * This route drains those rows, groups them per user into ONE sectioned
 * message (Money in / Money out / Budgets / Renewals / Other) and
 * delivers it through the same in-window-free / out-of-window-template
 * mechanism the morning brief uses (`deliverBriefLike`, which wraps the
 * approved single-var `paybacker_pocket_agent_reply` UTILITY template).
 *
 * Guarantees:
 *   - Strictly ONE message per user per run.
 *   - Rows are marked 'sent' or 'failed' — never left pending on success,
 *     so the unique partial index frees the dedup key for tomorrow.
 *   - The digest itself is sent with allowUrgent so the daily cap it
 *     exists to enforce can never suppress it.
 *
 * Auth: Bearer CRON_SECRET (CLAUDE.md rule for every cron route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DIGEST_DEDUP_PREFIX,
  buildEveningDigestBody,
  type QueuedDigestRow,
} from '@/lib/whatsapp/alert-queue';
import { deliverBriefLike } from '@/lib/whatsapp/morning-brief';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Cap the blast radius of a single run. */
const MAX_ROWS_PER_RUN = 1000;
const MAX_USERS_PER_RUN = 200;

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function isAuthorised(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}

async function run() {
  const sb = getAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await sb
    .from('whatsapp_alert_queue')
    .select('id, user_id, event_type, template_name, payload')
    .eq('status', 'pending')
    .lte('release_after', nowIso)
    .like('dedup_key', `${DIGEST_DEDUP_PREFIX}%`)
    .order('user_id', { ascending: true })
    .limit(MAX_ROWS_PER_RUN);

  if (error) {
    console.error('[whatsapp-evening-digest] queue read failed', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, users: 0, items: 0, sent: 0 });
  }

  // Group by user — strictly one message each.
  const byUser = new Map<string, QueuedDigestRow[]>();
  for (const row of due as QueuedDigestRow[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  const userIds = Array.from(byUser.keys()).slice(0, MAX_USERS_PER_RUN);

  // Bulk-load the recipient pool: active WhatsApp session + Pro tier.
  const [{ data: sessions }, { data: profiles }] = await Promise.all([
    sb
      .from('whatsapp_sessions')
      .select('user_id, whatsapp_phone')
      .in('user_id', userIds)
      .eq('is_active', true)
      .is('opted_out_at', null),
    sb
      .from('profiles')
      .select(
        'id, first_name, full_name, email, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at',
      )
      .in('id', userIds),
  ]);

  const phoneByUser = new Map<string, string>(
    (sessions ?? []).map((s) => [s.user_id as string, s.whatsapp_phone as string]),
  );
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as Record<string, unknown>]),
  );

  let sent = 0;
  let cancelled = 0;
  let failed = 0;
  let items = 0;

  for (const userId of userIds) {
    const rows = byUser.get(userId) ?? [];
    const ids = rows.map((r) => r.id);
    items += rows.length;

    const phone = phoneByUser.get(userId);
    const profile = profileById.get(userId);
    const eligible =
      !!phone &&
      !!profile &&
      isProPocketAgentEligible(profile as Parameters<typeof isProPocketAgentEligible>[0]);

    if (!eligible) {
      // No active Pro WhatsApp session any more — retire the rows rather
      // than letting them block tomorrow's dedup keys.
      await markRows(sb, ids, 'cancelled');
      cancelled += rows.length;
      continue;
    }

    const firstName =
      (
        ((profile?.first_name as string | undefined) ||
          (profile?.full_name as string | undefined) ||
          (profile?.email as string | undefined) ||
          'there') as string
      )
        .toString()
        .trim()
        .split(/\s+/)[0] || 'there';

    const body = buildEveningDigestBody(firstName, rows);

    try {
      const outcome = await deliverBriefLike(sb, userId, phone!, body, {
        eventType: 'evening_summary',
        allowUrgent: true,
      });
      if (outcome.status === 'sent') {
        await markRows(sb, ids, 'sent');
        sent += 1;
      } else if (outcome.status === 'skipped') {
        // Intentional skip (template not approved) — retire the rows so we
        // don't retry the same unapproved template every evening.
        await markRows(sb, ids, 'cancelled');
        cancelled += rows.length;
      } else {
        failed += 1;
        console.warn(
          `[whatsapp-evening-digest] delivery failed for ${userId}: ${outcome.reason ?? 'unknown'}`,
        );
        // Leave rows pending — the next run retries them.
      }
    } catch (e) {
      failed += 1;
      console.error(
        '[whatsapp-evening-digest] send threw for',
        userId,
        (e as Error)?.message ?? e,
      );
    }
  }

  console.log(
    `[whatsapp-evening-digest] users=${userIds.length} items=${items} sent=${sent} cancelled=${cancelled} failed=${failed}`,
  );

  return NextResponse.json({
    ok: true,
    users: userIds.length,
    items,
    sent,
    cancelled,
    failed,
  });
}

async function markRows(
  sb: SupabaseClient,
  ids: string[],
  status: 'sent' | 'cancelled',
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await sb
      .from('whatsapp_alert_queue')
      .update({ status, sent_at: new Date().toISOString() })
      .in('id', ids);
  } catch (e) {
    console.warn('[whatsapp-evening-digest] mark rows failed', (e as Error)?.message ?? e);
  }
}
