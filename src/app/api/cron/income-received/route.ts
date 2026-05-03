/**
 * Income-received cron.
 *
 * Detects new salary / inbound-payment bank transactions and pings the
 * user's Pocket Agent (Telegram or WhatsApp) with the amount + lifetime
 * received total.
 *
 * Detection heuristic
 * -------------------
 * We treat a positive bank transaction as "income" when ALL of:
 *   - amount > INCOME_MIN_AMOUNT (£250 default — filters refunds /
 *     small inbound transfers)
 *   - timestamp falls within the cron's lookback window (the cron
 *     runs every 4 hours, lookback = 8h to give one chance of overlap)
 *   - user_category is null OR matches one of the income labels
 *     (salary / income / wages / pay / inflow / refund — refunds DO
 *     fire this alert, by design)
 *
 * Idempotency
 * -----------
 * We log each fired alert in `notification_log` keyed on the bank
 * transaction id so a re-run inside the same lookback window can't
 * double-send. notification_type='income_received'.
 *
 * Routing
 * -------
 * Telegram users get a rich single-line message via the existing user
 * bot (sendProactiveAlert path). WhatsApp users go through
 * whatsappFanoutForCron which (a) prefers free-form text inside the
 * 24h customer-service window — £0 cost — and (b) falls back to the
 * paybacker_income_received template outside the window. The template
 * SID is currently PENDING_RESUBMISSION; outside-window sends will
 * fail until Meta approves it, but are returned as `skipped` not
 * thrown — so the cron never crashes on a missing SID.
 *
 * Pro-only
 * --------
 * Both branches are gated to Pro users by canUseWhatsApp /
 * isProPocketAgentEligible. Free + Essential users don't get this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';
import {
  dispatchPocketAgentAlert,
  type ActiveSession,
} from '@/lib/pocket-agent/dispatch';
import { whatsappFanoutForCron } from '@/lib/pocket-agent/whatsapp-fanout';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const INCOME_MIN_AMOUNT = 250; // £250 floor
const LOOKBACK_HOURS = 8; // cron runs every 4h; 8h overlap = belt and braces

const INCOME_CATEGORIES = new Set([
  'salary',
  'income',
  'wages',
  'pay',
  'inflow',
  'refund',
]);

function fmt(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface IncomeTx {
  id: string;
  user_id: string;
  amount: number;
  merchant_name: string | null;
  description: string | null;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const sinceIso = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Pull every recent positive transaction over the floor, then
  // filter category in JS (saves an awkward .or() chain that mixes
  // null + IN comparisons). This is one user-spanning query — fine
  // until we cross ~10k Pro accounts.
  const { data: rawTx, error: txErr } = await supabase
    .from('bank_transactions')
    .select('id, user_id, amount, merchant_name, description, user_category')
    .gte('amount', INCOME_MIN_AMOUNT)
    .gte('timestamp', sinceIso);

  if (txErr) {
    console.error('[income-received]', txErr);
    return NextResponse.json({ ok: false, error: txErr.message }, { status: 500 });
  }

  const candidates: IncomeTx[] = (rawTx ?? [])
    .filter((t) => {
      const cat = (t.user_category ?? '').toLowerCase();
      return cat === '' || INCOME_CATEGORIES.has(cat);
    })
    .map((t) => ({
      id: t.id,
      user_id: t.user_id,
      amount: Number(t.amount),
      merchant_name: t.merchant_name,
      description: t.description,
    }));

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, candidates: 0, sent: 0 });
  }

  // Skip transactions we've already alerted on. notification_log keyed
  // by reference_key=`tx_<id>` is the idempotency record.
  const txIds = candidates.map((c) => c.id);
  const { data: alreadyLogged } = await supabase
    .from('notification_log')
    .select('reference_key')
    .eq('notification_type', 'income_received')
    .in('reference_key', txIds.map((id) => `tx_${id}`));

  const seen = new Set(
    (alreadyLogged ?? []).map((r: { reference_key: string }) => r.reference_key),
  );
  const fresh = candidates.filter((c) => !seen.has(`tx_${c.id}`));

  if (fresh.length === 0) {
    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      fresh: 0,
      sent: 0,
    });
  }

  // Take the largest fresh inbound per user — typical case is one
  // big salary deposit; if the cron sees two, we surface the bigger.
  const byUser = new Map<string, IncomeTx>();
  for (const tx of fresh) {
    const existing = byUser.get(tx.user_id);
    if (!existing || tx.amount > existing.amount) {
      byUser.set(tx.user_id, tx);
    }
  }

  // Filter to Pro-eligible users. Same eligibility helper the other
  // pocket-agent crons use (covers past_due / unpaid / incomplete
  // grace window).
  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .in('id', userIds);

  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => isProPocketAgentEligible(p))
      .map((p) => p.id),
  );

  const proUsers = userIds.filter((uid) => proUserIds.has(uid));

  // Pre-compute lifetime income per Pro user. One round trip.
  const lifetimeByUser = new Map<string, number>();
  if (proUsers.length > 0) {
    const { data: allInbound } = await supabase
      .from('bank_transactions')
      .select('user_id, amount, user_category')
      .in('user_id', proUsers)
      .gte('amount', INCOME_MIN_AMOUNT);
    for (const t of allInbound ?? []) {
      const cat = (t.user_category ?? '').toLowerCase();
      if (cat !== '' && !INCOME_CATEGORIES.has(cat)) continue;
      lifetimeByUser.set(
        t.user_id,
        (lifetimeByUser.get(t.user_id) ?? 0) + Number(t.amount),
      );
    }
  }

  // ─── Telegram path ───
  // Gather active Telegram sessions for these users; send the
  // existing rich proactive-alert format via dispatchPocketAgentAlert
  // (which routes per session.channel).
  const { data: tgRows } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .in('user_id', proUsers)
    .eq('is_active', true);

  let tgSent = 0;
  for (const row of tgRows ?? []) {
    const tx = byUser.get(row.user_id);
    if (!tx) continue;
    const lifetime = lifetimeByUser.get(row.user_id) ?? tx.amount;
    const merchant = tx.merchant_name || tx.description || 'a deposit';
    const session: ActiveSession = {
      user_id: row.user_id,
      channel: 'telegram',
      destination: row.telegram_chat_id,
    };
    const result = await dispatchPocketAgentAlert({
      session,
      alertType: 'income_received',
      detectedIssueId: `income:${tx.id}`,
      supabase,
      telegram: {
        title: `${fmt(tx.amount)} from ${merchant} just landed`,
        detail: `Lifetime received via Paybacker tracking: ${fmt(lifetime)}.`,
        recommendation: 'Want me to look at where it should go this month? Reply BUDGET.',
        amount_impact: tx.amount,
      },
    });
    if (result.ok) {
      tgSent += 1;
      await supabase
        .from('notification_log')
        .insert({
          user_id: row.user_id,
          notification_type: 'income_received',
          reference_key: `tx_${tx.id}`,
        });
    }
  }

  // ─── WhatsApp path ───
  // Fanout helper handles the 24h service window + marketing gate +
  // template SID lookup. Returns counts.
  const waResult = await whatsappFanoutForCron({
    supabase,
    alertType: 'income_received',
    userIds: proUsers,
    logLabel: 'income-received',
    buildVars: async (userId) => {
      const tx = byUser.get(userId);
      if (!tx) return null;
      const lifetime = lifetimeByUser.get(userId) ?? tx.amount;

      // Mark as fired BEFORE sending so a partial failure doesn't
      // cause a re-fire on the next cron tick.
      await supabase
        .from('notification_log')
        .insert({
          user_id: userId,
          notification_type: 'income_received',
          reference_key: `tx_${tx.id}`,
        })
        .select()
        .single();

      return {
        amount: fmt(tx.amount),
        merchant: tx.merchant_name || tx.description || 'a deposit',
        lifetime_received: fmt(lifetime),
      };
    },
  });

  console.log(
    `[income-received] candidates=${candidates.length} fresh=${fresh.length} pro=${proUsers.length} tg_sent=${tgSent} wa_attempted=${waResult.attempted} wa_sent=${waResult.sent}`,
  );

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    fresh: fresh.length,
    pro_users: proUsers.length,
    telegram: { sent: tgSent },
    whatsapp: {
      attempted: waResult.attempted,
      sent: waResult.sent,
      skipped: waResult.skipped.length,
      errors: waResult.errors.length,
    },
  });
}
