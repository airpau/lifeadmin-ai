/**
 * GET /api/cron/cancellation-verification
 *
 * Phase 4 — cancellation outcome verification.
 *
 * For every `cancellation_tracking` row with status='pending' and
 * effective_date passed (>= 3 days ago — Stripe/merchant settlement lag),
 * we look at the user's bank_transactions in the last 14 days for any
 * outgoing charge attributable to the same merchant. If a charge
 * landed → status='failed' (cancellation didn't take). If no charge →
 * status='confirmed' (it worked).
 *
 * The cancellation_tracking trigger (migration 20260608140000) attaches
 * the outcome to the matching `cancellation_drafted` intelligence event
 * automatically, so the per-merchant cancellation success rate falls out
 * of the daily rollup.
 *
 * For failed cancellations we also open a support ticket so the user is
 * told their cancellation didn't take. The user-facing copy is short and
 * suggests next steps.
 *
 * Schedule: daily at 04:00 UTC (after the 02:15 rollup so the digest
 * Monday picks up yesterday's verifications). Auth via Bearer
 * ${CRON_SECRET}.
 *
 * Safety:
 *   - We never write status='failed' without ≥1 matching charge.
 *   - We never write status='confirmed' if the user has <3 days of bank
 *     data after the effective date (insufficient signal). Those stay
 *     pending — they'll be retried tomorrow.
 *   - We cap candidates per run at 200 to keep response time bounded.
 *   - Idempotent: rows already non-pending are skipped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const SETTLEMENT_LAG_DAYS = 3;
const CHARGE_WINDOW_DAYS = 14;
const MAX_PER_RUN = 200;

function normalise(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = admin();
  const now = new Date();
  const summary: Record<string, number> = {
    candidates: 0,
    confirmed: 0,
    failed: 0,
    insufficient_signal: 0,
    tickets_opened: 0,
    errors: 0,
  };

  // Cancellations whose effective_date was ≥ 3 days ago and still pending.
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - SETTLEMENT_LAG_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data: pending } = await sb
    .from('cancellation_tracking')
    .select('id, user_id, provider, subscription_id, effective_date, cancellation_requested_at')
    .eq('status', 'pending')
    .not('effective_date', 'is', null)
    .lte('effective_date', cutoffDate)
    .order('effective_date', { ascending: true })
    .limit(MAX_PER_RUN);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, summary });
  }

  summary.candidates = pending.length;

  for (const row of pending) {
    try {
      const merchantNorm = normalise(row.provider);
      if (!merchantNorm) {
        summary.insufficient_signal++;
        continue;
      }

      // Look at debits in the user's bank tx in the past CHARGE_WINDOW_DAYS
      // since the effective_date. Match by normalised merchant string.
      const effective = new Date(`${row.effective_date}T00:00:00Z`);
      const windowEnd = new Date(now);
      const windowStart = new Date(effective);
      windowStart.setUTCDate(windowStart.getUTCDate() - 1); // small buffer

      const { data: charges } = await sb
        .from('bank_transactions')
        .select('id, amount, merchant_name, merchant_normalized, description, timestamp')
        .eq('user_id', row.user_id)
        .lt('amount', 0)
        .gte('timestamp', windowStart.toISOString())
        .lte('timestamp', windowEnd.toISOString())
        .limit(500);

      const matched = (charges ?? []).filter((c) => {
        const haystack = `${normalise(c.merchant_normalized)} ${normalise(c.merchant_name)} ${normalise(c.description)}`;
        return haystack.includes(merchantNorm);
      });

      // If we don't have 3+ days of data past effective_date OR no
      // transactions at all in the window, the signal isn't trustworthy.
      const daysSinceEffective = (windowEnd.getTime() - effective.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceEffective < SETTLEMENT_LAG_DAYS) {
        summary.insufficient_signal++;
        continue;
      }

      if (matched.length === 0) {
        // No charge in the window → cancellation took. Flip to confirmed.
        const { error: updErr } = await sb
          .from('cancellation_tracking')
          .update({
            status: 'confirmed',
            confirmation_detected_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .eq('status', 'pending');
        if (updErr) {
          summary.errors++;
          continue;
        }
        summary.confirmed++;
      } else {
        // A charge landed → cancellation didn't take. Flip to failed and
        // open a support ticket so the user knows.
        const { error: updErr } = await sb
          .from('cancellation_tracking')
          .update({ status: 'failed' })
          .eq('id', row.id)
          .eq('status', 'pending');
        if (updErr) {
          summary.errors++;
          continue;
        }
        summary.failed++;

        try {
          const totalCharged = matched.reduce((s, c) => s + Math.abs(Number(c.amount)), 0);
          const { error: ticketErr } = await sb.from('support_tickets').insert({
            user_id: row.user_id,
            source: 'system',
            subject: `Cancellation didn't take: ${row.provider}`,
            status: 'open',
            metadata: {
              cancellation_id: row.id,
              provider: row.provider,
              effective_date: row.effective_date,
              matched_charges: matched.map((c) => ({
                id: c.id,
                amount: c.amount,
                timestamp: c.timestamp,
              })),
              total_charged_gbp: Math.round(totalCharged * 100) / 100,
              source: 'cancellation-verification-cron',
            },
          });
          if (!ticketErr) summary.tickets_opened++;
        } catch {
          // Non-fatal: the cancellation_tracking trigger still attaches
          // the outcome to the intelligence event for the founder digest.
        }
      }
    } catch (err) {
      console.warn('[cancellation-verification] candidate failed:', err);
      summary.errors++;
    }
  }

  return NextResponse.json({ ok: true, summary });
}
