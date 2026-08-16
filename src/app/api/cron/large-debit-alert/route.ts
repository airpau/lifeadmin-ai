/**
 * GET /api/cron/large-debit-alert
 *
 * 2x daily cron (matches income-received cadence). Mirrors
 * income-received but for OUTGOING transactions ≥ MIN_AMOUNT.
 *
 * 2026-08-16 cost/fatigue rework: routine debits are now ENQUEUED into
 * `whatsapp_alert_queue` and delivered as part of the ONE 18:00 evening
 * digest instead of firing an individually-billed
 * `paybacker_payment_outgoing` template per transaction. Only a single
 * debit at or above URGENT_AMOUNT still sends immediately (with
 * allowUrgent, so it bypasses quiet hours and the daily cap) — that is
 * the only case where minutes matter.
 *
 * Filters keep the signal high:
 *   - amount ≤ -MIN_AMOUNT (£50 — higher than income's £10 since
 *     debits include rent/mortgage that would otherwise spam)
 *   - user_category NOT in (transfer / refund / interest)
 *   - description does not contain SELF / TRANSFER / SAVINGS
 *   - txn within the last LOOKBACK_HOURS
 *   - notification_log dedup on txn id
 *
 * Tier gate: paid plans only (Essential + Pro) per the EVENT_CATALOG
 * default for `payment_outgoing`.
 *
 * Auth: Bearer CRON_SECRET (CLAUDE.md rule).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { isPocketAgentEligible } from '@/lib/telegram/eligibility';
import { enqueueDigestItem } from '@/lib/whatsapp/alert-queue';
import { isFutureDated, endOfTodayLondonIso } from '@/lib/alerts/future-dated';

export const runtime = 'nodejs';
export const maxDuration = 90;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const MIN_AMOUNT = 50; // pounds — cap below which we stay silent
/**
 * A single debit at or above this is worth interrupting someone's day
 * for. Everything smaller waits for the 18:00 evening digest.
 */
const URGENT_AMOUNT = 500;
/**
 * Detection lookback. Runs twice daily (08:30 and 17:30 UTC), so the
 * longest gap is 15h; 16h gives slack. notification_log dedup makes the
 * overlap harmless.
 */
const LOOKBACK_HOURS = 16;
const EXCLUDED_CATS = new Set(['transfer', 'savings', 'interest', 'fee_refund']);
const EXCLUDED_DESC = /\b(SELF|TRANSFER|SAVINGS|INTERNAL)\b/i;

interface DebitTxn {
  id: string;
  user_id: string;
  amount: number;
  description: string | null;
  merchant_name: string | null;
  user_category: string | null;
  category: string | null;
  timestamp: string;
}

function fmtGBP(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

function isAuthorised(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getAdmin();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await supabase
    .from('bank_transactions')
    .select(
      'id, user_id, amount, description, merchant_name, user_category, category, timestamp',
    )
    .gte('timestamp', since)
    .lt('amount', -MIN_AMOUNT)
    .order('timestamp', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[large-debit-alert] query failed', error.message);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, scanned: 0 });
  }

  // Filter by category + description.
  const debits: DebitTxn[] = (candidates as DebitTxn[]).filter((t) => {
    // FUTURE-DATED GUARD. HSBC returns scheduled payments as ordinary
    // rows dated on the day they're DUE, with is_pending = false — so
    // is_pending tells us nothing. This alert says the money "just left
    // your account", which is a lie for a payment scheduled for Monday.
    // A future-dated debit belongs in upcoming/scheduled payments, not
    // here, so drop it. See src/lib/alerts/future-dated.ts.
    if (isFutureDated(t.timestamp)) return false;
    const cat = (t.user_category ?? t.category ?? '').toLowerCase();
    if (EXCLUDED_CATS.has(cat)) return false;
    const desc = `${t.description ?? ''} ${t.merchant_name ?? ''}`;
    if (EXCLUDED_DESC.test(desc)) return false;
    return true;
  });

  if (debits.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, scanned: candidates.length });
  }

  // Bulk eligibility (paid tier only).
  const userIds = Array.from(new Set(debits.map((t) => t.user_id)));
  const { data: profiles } = await supabase
    .from('profiles')
    .select(
      'id, first_name, full_name, email, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at',
    )
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p as Record<string, unknown>]),
  );
  const eligibleUsers = new Set(
    (profiles ?? [])
      .filter((p) =>
        isPocketAgentEligible(p as Parameters<typeof isPocketAgentEligible>[0]),
      )
      .map((p) => p.id),
  );

  const eligible = debits.filter((t) => eligibleUsers.has(t.user_id));
  if (eligible.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      scanned: candidates.length,
      eligible_after_filters: debits.length,
    });
  }

  // Dedup.
  const refKeys = eligible.map((t) => `payment_outgoing_${t.id}`);
  const { data: alreadySent } = await supabase
    .from('notification_log')
    .select('reference_key')
    .in('reference_key', refKeys);
  const sentKeys = new Set((alreadySent ?? []).map((r) => r.reference_key));

  // Per-user monthly outgoing total — best-effort, single bulk query.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();
  const { data: monthly } = await supabase
    .from('bank_transactions')
    .select('user_id, amount')
    .in('user_id', Array.from(eligibleUsers))
    .gte('timestamp', monthStartIso)
    // Same reason as the future-dated guard above: a payment scheduled
    // for next Monday hasn't been spent yet, so it must not inflate the
    // "spend this month" figure we quote back to the user.
    .lte('timestamp', endOfTodayLondonIso())
    .lt('amount', 0);
  const monthlyTotalByUser = new Map<string, number>();
  for (const r of (monthly ?? []) as Array<{ user_id: string; amount: number }>) {
    monthlyTotalByUser.set(
      r.user_id,
      (monthlyTotalByUser.get(r.user_id) ?? 0) + Math.abs(Number(r.amount) || 0),
    );
  }

  let sent = 0;
  let queued = 0;
  const errors: string[] = [];

  for (const tx of eligible) {
    const refKey = `payment_outgoing_${tx.id}`;
    if (sentKeys.has(refKey)) continue;
    try {
      const { data: session } = await supabase
        .from('whatsapp_sessions')
        .select('whatsapp_phone')
        .eq('user_id', tx.user_id)
        .eq('is_active', true)
        .is('opted_out_at', null)
        .maybeSingle();
      if (!session?.whatsapp_phone) {
        // No WhatsApp session — stamp the log so we don't keep
        // looking it up across re-runs.
        await supabase.from('notification_log').insert({
          user_id: tx.user_id,
          notification_type: 'payment_outgoing',
          reference_key: refKey,
        });
        continue;
      }
      const profile = profileMap.get(tx.user_id) as
        | { first_name?: string; full_name?: string; email?: string }
        | undefined;
      const firstName =
        (
          (profile?.first_name as string | undefined) ||
          (profile?.full_name as string | undefined) ||
          (profile?.email as string | undefined) ||
          'there'
        )
          .toString()
          .trim()
          .split(/\s+/)[0] || 'there';
      const merchant =
        tx.merchant_name ||
        (tx.description?.split(/\s+/).slice(0, 4).join(' ') ?? 'a merchant');
      const amount = fmtGBP(Number(tx.amount));
      const category = tx.user_category ?? tx.category ?? 'spending';
      const monthTotal = `£${(monthlyTotalByUser.get(tx.user_id) ?? 0).toFixed(2)}`;

      // Vars: [first_name, amount, merchant, category, monthly_total] —
      // amount and monthly_total go WITHOUT the £ because the template
      // body has the £ baked into the static text.
      const parameters = [
        firstName,
        amount.replace(/£/, ''),
        merchant,
        category,
        monthTotal.replace(/£/, ''),
      ];
      const absAmount = Math.abs(Number(tx.amount)) || 0;
      const digestLine = `${amount} to ${merchant} (${category})`;

      if (absAmount >= URGENT_AMOUNT) {
        // Big single debit — send now. allowUrgent bypasses quiet hours
        // and the daily cap; textFallback lets the facade deliver it
        // FREE as in-window text when the user has messaged us recently.
        await sendWhatsAppTemplate(
          {
            to: session.whatsapp_phone,
            templateName: 'paybacker_payment_outgoing',
            parameters,
          },
          {
            userId: tx.user_id,
            eventType: 'payment_outgoing',
            allowUrgent: true,
            amount: absAmount,
            dedupKey: refKey,
            textFallback:
              `💳 ${amount} just left your account to ${merchant}. ` +
              `Your ${category} spend this month: ${monthTotal}. ` +
              `Reply DISPUTE if this doesn't look right.`,
          },
        );
        sent += 1;
      } else {
        // Routine debit — into the 18:00 evening digest.
        await enqueueDigestItem(supabase, {
          userId: tx.user_id,
          eventType: 'payment_outgoing',
          section: 'money_out',
          line: digestLine,
          amount: absAmount,
          templateName: 'paybacker_payment_outgoing',
          parameters,
          dedupKey: refKey,
        });
        queued += 1;
      }

      await supabase.from('notification_log').insert({
        user_id: tx.user_id,
        notification_type: 'payment_outgoing',
        reference_key: refKey,
      });
    } catch (e: any) {
      errors.push(`${tx.id}: ${e?.message ?? 'unknown'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    eligible_after_filters: debits.length,
    eligible_users: eligibleUsers.size,
    sent,
    queued,
    errors: errors.length > 0 ? errors : undefined,
  });
}
