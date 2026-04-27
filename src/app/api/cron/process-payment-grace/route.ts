/**
 * GET /api/cron/process-payment-grace
 *
 * Daily cron that processes the 7-day payment-grace state set by the
 * Stripe `invoice.payment_failed` webhook. See
 * supabase/migrations/20260427020000_payment_grace_columns.sql for the
 * column contract.
 *
 * Two passes per run:
 *   1. T-3 reminder — for any profile with past_due_grace_ends_at
 *      between (now+0, now+72h] and no past_due_final_warning_sent_at,
 *      send the final warning and stamp the timestamp.
 *   2. Demotion — for any profile with past_due_grace_ends_at <= now
 *      and tier in ('pro','essential'), demote to 'free', clear all
 *      grace columns, then call openDowngradeEvent() so existing
 *      bank/email overage gets archived (NOT deleted — data preserved
 *      via archived_at).
 *
 * Idempotent: once a row is demoted past_due_grace_ends_at is null, so
 * the next run skips it. Founding members are excluded — same rule as
 * the existing customer.subscription.deleted handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendFinalGraceWarning, sendDemotionConfirmation } from '@/lib/notifications/payment-grace';
import { openDowngradeEvent } from '@/lib/plan-downgrade';
import type { PlanTier } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface GraceRow {
  id: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  past_due_grace_ends_at: string | null;
  past_due_final_warning_sent_at: string | null;
  founding_member: boolean | null;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const t3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, past_due_grace_ends_at, past_due_final_warning_sent_at, founding_member')
    .not('past_due_grace_ends_at', 'is', null);
  if (error) {
    console.error('process-payment-grace: query failed', error.message);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  const finalsSent: string[] = [];
  const demoted: string[] = [];
  const errors: Array<{ userId: string; reason: string }> = [];

  for (const row of (rows ?? []) as GraceRow[]) {
    if (row.founding_member) continue;
    if (!row.past_due_grace_ends_at) continue;

    const graceEnds = new Date(row.past_due_grace_ends_at);

    // Pass 1: T-3 final warning
    if (graceEnds > now && graceEnds <= t3 && !row.past_due_final_warning_sent_at) {
      try {
        await sendFinalGraceWarning(supabase, row.id);
        await supabase
          .from('profiles')
          .update({ past_due_final_warning_sent_at: now.toISOString() })
          .eq('id', row.id);
        finalsSent.push(row.id);
      } catch (e: any) {
        errors.push({ userId: row.id, reason: `final warning: ${e?.message ?? 'unknown'}` });
      }
      continue;
    }

    // Pass 2: actual demotion (grace expired)
    if (graceEnds <= now) {
      const fromTier = (row.subscription_tier ?? 'free') as PlanTier;
      if (fromTier === 'free') {
        // Tier already free — nothing to demote. Just clear the grace
        // columns so the cron stops returning this row.
        await supabase
          .from('profiles')
          .update({
            past_due_grace_ends_at: null,
            past_due_warning_sent_at: null,
            past_due_final_warning_sent_at: null,
            updated_at: now.toISOString(),
          })
          .eq('id', row.id);
        continue;
      }

      try {
        const { error: demoteErr } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            // Stripe webhook will eventually set 'canceled' — leave the
            // status alone so we don't overwrite a more accurate state.
            past_due_grace_ends_at: null,
            past_due_warning_sent_at: null,
            past_due_final_warning_sent_at: null,
            updated_at: now.toISOString(),
          })
          .eq('id', row.id)
          .neq('founding_member', true);
        if (demoteErr) {
          errors.push({ userId: row.id, reason: `demote: ${demoteErr.message}` });
          continue;
        }

        // Archive bank/email overage. openDowngradeEvent uses archived_at
        // — data is hidden from sync but never deleted, so reactivation
        // restores everything.
        await openDowngradeEvent(supabase as any, row.id, fromTier, 'free' as PlanTier);
        await sendDemotionConfirmation(supabase, row.id, fromTier);
        demoted.push(row.id);
      } catch (e: any) {
        errors.push({ userId: row.id, reason: `demotion flow: ${e?.message ?? 'unknown'}` });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows?.length ?? 0,
    finalsSent: finalsSent.length,
    demoted: demoted.length,
    errors,
  });
}
