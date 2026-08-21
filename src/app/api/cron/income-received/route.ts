/**
 * GET /api/cron/income-received
 *
 * Hourly cron — emits an Emma-style "💰 Money landed in your account"
 * notification when a positive-amount transaction has just synced into
 * one of the user's connected bank accounts.
 *
 * Channels (subject to per-user notification_preferences for the
 * `income_received` event):
 *   - Telegram or WhatsApp Pocket Agent (whichever the user connected)
 *   - In-app notification bell (user_notifications row, always)
 *   - Push (when the mobile app ships a transport)
 *   - Email (opt-in only — defaults OFF to avoid one-mail-per-credit
 *     inbox clutter)
 *
 * Tier gating: paid plans only (Essential + Pro). Free users see the
 * relevant transactions in Money Hub but don't get pinged about them.
 *
 * Filtering — keeps signal high so we don't celebrate every coffee
 * refund or self-transfer:
 *   - amount > MIN_AMOUNT (£10)
 *   - user_category NOT in (transfer / refund / fee_refund / interest)
 *   - description does not contain "REFUND" / "REVERSAL" / "RETURN"
 *   - txn timestamp within the last LOOKBACK_HOURS (see const below)
 *   - notification_log dedup keyed on the txn id so re-runs don't
 *     double-send
 *
 * 2026-08-16 — WhatsApp leg now ENQUEUES to the 18:00 evening digest
 * instead of firing a billed template per credit. Cadence dropped from
 * 5x/day to 2x/day in vercel.json accordingly, and the lookback widened
 * to cover the longer gap between runs.
 *
 * Bank-sync cadence (vercel.json `bank-sync` schedule) is the upstream
 * bottleneck: a 9am salary won't be detected until the next sync. We
 * bumped bank-sync from 3x daily to 5x daily in this same PR to land
 * income alerts within ~3 hours of the credit hitting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';
import { isPocketAgentEligible } from '@/lib/telegram/eligibility';
import { enqueueDigestItem } from '@/lib/whatsapp/alert-queue';
import { loadUsersWithActiveWhatsApp } from '@/lib/telegram/whatsapp-dedup';
import { isFutureDated } from '@/lib/alerts/future-dated';

export const runtime = 'nodejs';
export const maxDuration = 90;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const MIN_AMOUNT = 10; // £10 minimum to ping

/**
 * Detection lookback. The cron now runs twice daily (08:00 and 17:00 UTC),
 * so the longest gap between runs is 15h (17:00 → 08:00). 16h gives an
 * hour of slack; notification_log dedup makes the overlap harmless.
 */
const LOOKBACK_HOURS = 16;

const EXCLUDED_CATS = new Set([
  'transfer', 'transfers', 'internal_transfer', 'self_transfer',
  'refund', 'fee_refund', 'interest',
]);

// Description patterns we shouldn't celebrate as "money received" even
// when amount is positive — refunds and reversals are net-zero events.
const EXCLUDED_DESC = /\b(refund|reversal|return|chargeback|cashback adjustment|interest credit)\b/i;

function fmtGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2,
  }).format(n);
}

function pickEmoji(cat: string | null | undefined): string {
  switch ((cat || '').toLowerCase()) {
    case 'salary':
    case 'income':
    case 'wages': return '💼';
    case 'rent': return '🏠';
    case 'pension': return '🪙';
    case 'benefits':
    case 'gov': return '🏛';
    case 'gift': return '🎁';
    default: return '💰';
  }
}

interface IncomeTxn {
  id: string;
  user_id: string;
  amount: number;
  description: string | null;
  merchant_name: string | null;
  user_category: string | null;
  category: string | null;
  income_type: string | null;
  timestamp: string;
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
  return runCron();
}

export async function POST(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runCron();
}

async function runCron() {
  const supabase = getAdmin();
  // Wider than the longest gap between income-received cron runs plus
  // slack. notification_log dedup prevents double-sends for transactions
  // that overlap multiple windows.
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // 1. Find candidate income transactions in the window.
  const { data: candidates, error } = await supabase
    .from('bank_transactions')
    .select('id, user_id, amount, description, merchant_name, user_category, category, income_type, timestamp')
    .gte('timestamp', since)
    .gt('amount', MIN_AMOUNT)
    .order('timestamp', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[income-received] query failed', error.message);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, scanned: 0 });
  }

  // 2. Apply category + description filters in JS.
  const incomes: IncomeTxn[] = (candidates as IncomeTxn[]).filter((t) => {
    // FUTURE-DATED GUARD. Open Banking providers (HSBC confirmed) return
    // scheduled credits/debits as ordinary rows dated on the day they're
    // DUE, with is_pending = false — so is_pending can't be trusted here.
    // This alert says the money "just landed", which is false for a
    // credit dated next Monday. Future-dated rows belong in the
    // upcoming/scheduled surface, not in a "money received" alert.
    if (isFutureDated(t.timestamp)) return false;
    const cat = (t.user_category ?? t.category ?? '').toLowerCase();
    if (EXCLUDED_CATS.has(cat)) return false;
    if (t.income_type && ['transfer', 'credit_loan', 'refund'].includes(t.income_type)) return false;
    const desc = `${t.description ?? ''} ${t.merchant_name ?? ''}`;
    if (EXCLUDED_DESC.test(desc)) return false;
    return true;
  });

  if (incomes.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, scanned: candidates.length });
  }

  // 3. Bulk-load eligibility profiles, gate on paid tier.
  const userIds = Array.from(new Set(incomes.map((t) => t.user_id)));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .in('id', userIds);

  const eligibleUsers = new Set(
    (profiles ?? []).filter(isPocketAgentEligible).map((p) => p.id),
  );

  const eligible = incomes.filter((t) => eligibleUsers.has(t.user_id));
  if (eligible.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      scanned: candidates.length,
      eligible_after_filters: incomes.length,
    });
  }

  // 4. Bulk-check notification_log to drop already-notified txns.
  const txIds = eligible.map((t) => t.id);
  const refKeys = txIds.map((id) => `income_received_${id}`);
  const { data: alreadySent } = await supabase
    .from('notification_log')
    .select('reference_key')
    .in('reference_key', refKeys);
  const sentKeys = new Set((alreadySent ?? []).map((r) => r.reference_key));

  // Only users on WhatsApp get a digest row — Telegram users already
  // receive the full rich alert below and would otherwise accumulate
  // queue rows the digest cron just cancels.
  const whatsappUsers = await loadUsersWithActiveWhatsApp(supabase);

  let sent = 0;
  const errors: string[] = [];

  for (const tx of eligible) {
    const refKey = `income_received_${tx.id}`;
    if (sentKeys.has(refKey)) continue;

    const merchant = tx.merchant_name || (tx.description?.split(/\s+/).slice(0, 4).join(' ') ?? 'someone');
    const emoji = pickEmoji(tx.user_category ?? tx.income_type);
    const amount = fmtGBP(Number(tx.amount));

    const headline = `${emoji} Good news — ${amount} just landed`;
    const detail = `From *${merchant}*. Tap to see your new balance.`;

    try {
      // Always insert into the in-app notification bell so the website
      // notifications tab shows the alert regardless of which Pocket
      // Agent channel (or none) the user has connected. This is the
      // "notifications tab on the website" the founder asked for.
      await supabase.from('user_notifications').insert({
        user_id: tx.user_id,
        type: 'income_received',
        title: `${emoji} ${amount} landed in your account`,
        body: `From ${merchant}.`,
        link_url: '/dashboard/money-hub',
        metadata: {
          transaction_id: tx.id,
          amount: tx.amount,
          merchant,
          category: tx.user_category ?? tx.category,
        },
      });

      // Look up the user's first name so the paybacker_payment_received
      // template feels personal. Balance lookup is skipped for now —
      // IncomeTxn doesn't carry account_id and pulling it on every txn
      // doubles the DB hits. We pass "see Money Hub" as the {{4}} value
      // so the line still reads cleanly: "Balance now: see Money Hub".
      let firstName = 'there';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, full_name, email')
          .eq('id', tx.user_id)
          .maybeSingle();
        if (profile) {
          const raw = (profile.first_name || profile.full_name || profile.email || 'there')
            .toString()
            .trim();
          firstName = raw.split(/\s+/)[0] || 'there';
        }
      } catch {
        // Fallback above is fine.
      }
      const balanceLabel = 'see Money Hub';

      // WhatsApp leg — ENQUEUED, not sent (2026-08-16 cost/fatigue rework).
      // A credit landing is worth knowing about but is never urgent enough
      // to justify an individually-billed template per transaction. The
      // 18:00 evening digest rolls every credit into one "Money in" section.
      // Telegram, push, in-app and email behaviour below is UNCHANGED.
      if (whatsappUsers.has(tx.user_id)) {
        await enqueueDigestItem(supabase, {
          userId: tx.user_id,
          eventType: 'income_received',
          section: 'money_in',
          line: `${amount} from ${merchant}.`,
          amount: Number(tx.amount),
          provider: merchant,
          url: 'paybacker.co.uk/dashboard/money-hub',
          templateName: 'paybacker_payment_received',
          parameters: [firstName, merchant, amount, balanceLabel],
          // Transaction id keys the queue row, matching the notification_log
          // reference_key, so an item can't be enqueued twice across runs.
          dedupKey: refKey,
        });
      }

      const result = await sendNotification(supabase, {
        userId: tx.user_id,
        event: 'income_received',
        telegram: { text: `${headline}\n\n${detail}` },
        push: {
          title: headline.replace(/\*/g, ''),
          body: `From ${merchant}`,
          deepLink: '/dashboard/money-hub',
        },
        // Email opt-in only — see EVENT_CATALOG default.
      });
      void result;
      // Always stamp the dedup log — the in-app notification (above)
      // IS the delivery for users without a Pocket Agent connected,
      // so even when sendNotification's channels all skip we still
      // shouldn't ping again next cron tick.
      sent += 1;
      await supabase.from('notification_log').insert({
        user_id: tx.user_id,
        notification_type: 'income_received',
        reference_key: refKey,
      });
    } catch (e: any) {
      errors.push(`${tx.id}: ${e?.message ?? 'unknown'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    eligible_after_filters: incomes.length,
    eligible_users: eligibleUsers.size,
    sent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
