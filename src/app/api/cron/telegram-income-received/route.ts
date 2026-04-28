/**
 * GET /api/cron/telegram-income-received
 *
 * Hourly cron — emits an Emma-style "💰 Good news alert — money has
 * been added to your account" notification when a positive-amount
 * transaction has just landed in a user's bank.
 *
 * Mirrors Emma's behaviour: cheerful one-liner with the amount, who
 * sent it, and a "view balance" link. Defaults to telegram + push;
 * users can opt-in to email per the notification_preferences matrix.
 *
 * Filtering (so we don't spam the user with every coffee refund):
 *   - amount > £10
 *   - user_category NOT in (transfer / refund / fee_refund / interest)
 *   - description does not contain "REFUND" / "REVERSAL" / "RETURN"
 *   - txn timestamp within the last 70 minutes (cron runs hourly, +10
 *     min slack covers late syncs / cron drift)
 *   - notification_log dedup keyed on the txn id so re-runs of the
 *     cron don't double-send.
 *
 * Eligibility: same Pocket Agent rule as the other user-bot crons
 * (lib/telegram/eligibility.ts) — paid tier + retry-window status.
 *
 * Schedule (vercel.json): hourly at :15.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';

// Eligibility helper inlined here so this PR can land independently
// of #321 (lib/telegram/eligibility.ts). When #321 merges, swap to
// the shared import — same rules.
const RETRY_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);
const TERMINAL_STATUSES = new Set(['canceled', 'cancelled', 'expired', 'incomplete_expired']);
function isPocketAgentEligible(p: {
  subscription_tier?: string | null;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
  trial_ends_at?: string | null;
  trial_converted_at?: string | null;
  trial_expired_at?: string | null;
}): boolean {
  const tier = p.subscription_tier ?? 'free';
  if (tier === 'free') return false;
  const status = p.subscription_status ?? '';
  if (TERMINAL_STATUSES.has(status)) return false;
  if (!p.stripe_subscription_id) {
    if (!p.trial_ends_at) return false;
    if (p.trial_converted_at || p.trial_expired_at) return false;
    return new Date(p.trial_ends_at).getTime() > Date.now();
  }
  return RETRY_STATUSES.has(status);
}

export const runtime = 'nodejs';
export const maxDuration = 90;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const MIN_AMOUNT = 10; // £10 minimum to ping

const EXCLUDED_CATS = new Set([
  'transfer', 'transfers', 'internal_transfer', 'self_transfer',
  'refund', 'fee_refund', 'interest',
]);

// Description patterns we shouldn't celebrate as "money received"
// even when the amount is positive — refunds and reversals are
// already net-zero events from the user's perspective.
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

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const since = new Date(Date.now() - 70 * 60 * 1000).toISOString();

  // 1. Find candidate income transactions in the window. Note we
  //    filter on `amount > MIN_AMOUNT` here rather than `> 0` to keep
  //    the result set small at the DB level.
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

  // 2. Apply category + description filters in JS (DB filter would
  //    be a long ILIKE chain).
  const incomes: IncomeTxn[] = (candidates as IncomeTxn[]).filter((t) => {
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

  // 3. Filter to users who have an active Pocket Agent eligibility.
  //    Bulk-load profiles once to keep the per-row check cheap.
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
    return NextResponse.json({ ok: true, sent: 0, scanned: candidates.length, filtered_for_eligibility: incomes.length });
  }

  // 4. Bulk-check notification_log to drop already-notified txns.
  const txIds = eligible.map((t) => t.id);
  const refKeys = txIds.map((id) => `income_received_${id}`);
  const { data: alreadySent } = await supabase
    .from('notification_log')
    .select('reference_key')
    .in('reference_key', refKeys);
  const sentKeys = new Set((alreadySent ?? []).map((r) => r.reference_key));

  let sent = 0;
  const errors: string[] = [];

  for (const tx of eligible) {
    const refKey = `income_received_${tx.id}`;
    if (sentKeys.has(refKey)) continue;

    const merchant = tx.merchant_name || (tx.description?.split(/\s+/).slice(0, 4).join(' ') ?? 'someone');
    const emoji = pickEmoji(tx.user_category ?? tx.income_type);
    const amount = fmtGBP(Number(tx.amount));

    const headline = `${emoji} Good news — ${amount} just landed`;
    const detail = `From *${merchant}*. Check your balance to see the new total.`;

    try {
      const result = await sendNotification(supabase, {
        userId: tx.user_id,
        event: 'income_received',
        telegram: { text: `${headline}\n\n${detail}` },
        push: { title: headline.replace(/\*/g, ''), body: `From ${merchant}` },
        // Email opt-in only — see EVENT_CATALOG default.
      });
      if (result.delivered.length > 0) {
        sent += 1;
        await supabase.from('notification_log').insert({
          user_id: tx.user_id,
          notification_type: 'income_received',
          reference_key: refKey,
        });
      }
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
