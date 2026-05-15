// src/lib/alerts/money-in.ts
//
// "Money received" alerts — Emma-style buzz when a credit lands in a
// connected account. Fires from the bank-sync cron right after fresh
// rows are upserted into bank_transactions.
//
// Design rules:
//   1. Only credits inserted in the LAST 24h count. The initial-sync
//      backfill writes 12 months of history; we must not buzz the user
//      with a year of salary alerts on first connect.
//   2. Per-row dedup: `bank_transactions.alerted_money_in_at` is stamped
//      after a successful dispatch so a second sync within the window
//      doesn't re-fire.
//   3. Threshold + channel preferences come from the unified
//      `notification_preferences` table via the dispatcher, plus the
//      per-user minimum amount stored on `profiles.money_received_min_amount`.
//   4. We never fire for rows that look like internal transfers. The
//      classifier already labels these — we trust `category=TRANSFER` /
//      `income_type=transfer` / negative-pair heuristic.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';

const DEFAULT_MIN_AMOUNT = 10; // £
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

type Row = {
  id: string;
  amount: number | string;
  signed_amount_pence: number | null;
  merchant_name: string | null;
  description: string | null;
  category: string | null;
  income_type: string | null;
  user_category: string | null;
  connection_id: string;
  account_id: string;
  timestamp: string;
  created_at: string;
};

function formatGBP(amount: number): string {
  return `£${amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function describeSource(row: Row): string {
  const merchant = (row.merchant_name || '').trim();
  if (merchant) return merchant;
  const desc = (row.description || '').trim();
  if (desc) {
    // First 40 chars of description, single-spaced.
    return desc.replace(/\s+/g, ' ').slice(0, 40);
  }
  return 'an unknown sender';
}

function looksLikeTransfer(row: Row): boolean {
  const cat = (row.category || '').toUpperCase().trim();
  if (cat === 'TRANSFER') return true;
  const userCat = (row.user_category || '').toLowerCase().trim();
  if (userCat === 'transfers' || userCat === 'transfer') return true;
  const incomeType = (row.income_type || '').toLowerCase().trim();
  if (incomeType === 'transfer') return true;
  const haystack = `${row.merchant_name || ''} ${row.description || ''}`.toLowerCase();
  return (
    haystack.includes('transfer to') ||
    haystack.includes('transfer from') ||
    haystack.includes('between accounts') ||
    haystack.startsWith('tfr ') ||
    haystack.startsWith('trf ')
  );
}

/**
 * Fire money_received alerts for any credits added in the last 24h
 * that haven't already been alerted on. One row per dispatched
 * notification.
 *
 * Idempotent — relies on `alerted_money_in_at` being non-null to skip
 * rows we've already buzzed. Safe to invoke from every sync.
 */
export async function dispatchMoneyInAlertsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ alerted: number; skipped: number }> {
  const since = new Date(Date.now() - FRESH_WINDOW_MS).toISOString();

  // Pull the user's threshold once (defaults to £10 if NULL).
  const { data: profile } = await supabase
    .from('profiles')
    .select('money_received_min_amount, subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  const minAmount = Number(profile?.money_received_min_amount ?? DEFAULT_MIN_AMOUNT) || DEFAULT_MIN_AMOUNT;

  // signed_amount_pence > minAmount*100 narrows the query to credits
  // above the threshold. alerted_money_in_at IS NULL ensures dedup.
  const { data: rows, error } = await supabase
    .from('bank_transactions')
    .select(
      'id, amount, signed_amount_pence, merchant_name, description, category, income_type, user_category, connection_id, account_id, timestamp, created_at',
    )
    .eq('user_id', userId)
    .gte('created_at', since)
    .gt('signed_amount_pence', Math.round(minAmount * 100))
    .is('alerted_money_in_at', null)
    .is('deleted_at', null)
    .order('timestamp', { ascending: false })
    .limit(20);

  if (error || !rows || rows.length === 0) {
    return { alerted: 0, skipped: 0 };
  }

  let alerted = 0;
  let skipped = 0;

  for (const row of rows as Row[]) {
    if (looksLikeTransfer(row)) {
      skipped++;
      // Still stamp so we don't re-check on every sync.
      await supabase
        .from('bank_transactions')
        .update({ alerted_money_in_at: new Date().toISOString() })
        .eq('id', row.id);
      continue;
    }

    const amt = Number(row.amount) || 0;
    if (amt < minAmount) {
      skipped++;
      continue;
    }

    const source = describeSource(row);
    const summary = `💰 ${formatGBP(amt)} received from ${source}`;

    try {
      await sendNotification(supabase, {
        userId,
        event: 'money_received',
        telegram: {
          text: `${summary}\n\nIt's just landed in your connected account — your Money Hub income for the month has been updated.`,
        },
        push: {
          title: summary,
          body: `${formatGBP(amt)} from ${source} has landed in your account.`,
          deepLink: '/dashboard/money-hub',
        },
        // Email and WhatsApp are opt-in for money_received — defaults in
        // the events catalog leave them off so we don't spam.
      });
      alerted++;
    } catch (err) {
      console.error('[money-in] dispatch failed for tx', row.id, err);
    }

    await supabase
      .from('bank_transactions')
      .update({ alerted_money_in_at: new Date().toISOString() })
      .eq('id', row.id);

    // In-app notification feed (free for all tiers, always inserts).
    try {
      await supabase.from('user_notifications').insert({
        user_id: userId,
        type: 'money_received',
        title: summary,
        body: `${formatGBP(amt)} from ${source} landed in your account on ${new Date(row.timestamp).toLocaleDateString('en-GB')}.`,
        link_url: '/dashboard/money-hub',
        metadata: {
          transaction_id: row.id,
          amount: amt,
          source,
          connection_id: row.connection_id,
          account_id: row.account_id,
        },
      });
    } catch (err) {
      console.error('[money-in] user_notifications insert failed:', err);
    }
  }

  return { alerted, skipped };
}
