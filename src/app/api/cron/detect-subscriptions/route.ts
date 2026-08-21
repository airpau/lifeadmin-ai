import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deriveRecurringGroup } from '@/lib/subscription-key';
import {
  qualifyRecurringSeries,
  isHighVarianceMerchant,
  isExcludedTransactionCategory,
  isCouncilTaxMerchant,
  LOOKBACK_DAYS,
} from '@/lib/subscriptions/recurring-qualification';

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Normalise a provider name for deduplication.
 * Strips suffixes, numbers, special chars; lowercases.
 */
function normaliseProviderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk|uk)\b/g, '')
    .replace(/\d{4,}/g, '')           // strip long number references
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Council tax / local authority blocklist now lives in
// src/lib/subscriptions/recurring-qualification.ts (COUNCIL_TAX_PATTERNS /
// isCouncilTaxMerchant) so every writer shares one list.

// ─── Retro re-validation of legacy bank-detected subscriptions ────────
//
// Rows created by the OLD loose heuristics (2 payments 2-12 days apart
// matched "weekly", then got rewritten to "monthly") are still sitting in
// users' accounts. This pass re-runs the NEW qualification core against
// each merchant's real transaction series and, when a row no longer
// qualifies, flags it `needs_review = true` with a short note.
//
// Deliberately non-destructive: NEVER deletes a row, NEVER changes
// `status`, `amount`, `category` or `billing_cycle`. The user decides.

/** Max rows re-validated per cron run. */
const REVALIDATION_ROW_CAP = 500;

/** Marker so a row is only ever auto-flagged once. */
const REVALIDATION_NOTE_PREFIX = '[auto-review]';

/**
 * Notes text written by the auto-detectors themselves. Anything else in
 * `notes` is treated as user-authored content.
 */
const AUTO_SEED_NOTES = new Set([
  'detected from bank transactions',
  'detected from bank transactions - please review',
  'auto-detected from bank transactions',
]);

interface RevalidationRow {
  id: string;
  user_id: string;
  provider_name: string;
  recurring_group: string | null;
  bank_description: string | null;
  notes: string | null;
  subcategory: string | null;
  account_email: string | null;
  login_url: string | null;
  contract_end_source: string | null;
}

/**
 * `subscriptions` has no explicit "user edited this row" column, so we use
 * a conservative proxy: a row counts as user-touched if it carries any
 * content only a human could have put there — a note that isn't one of the
 * detector's own seed strings, a hand-picked subcategory, an account email
 * or login URL, or a user-sourced contract end date. Over-skipping is the
 * safe direction: the worst case is a stale false positive stays unflagged.
 */
function looksUserEdited(row: RevalidationRow): boolean {
  if (row.subcategory || row.account_email || row.login_url) return true;
  if (row.contract_end_source === 'user' || row.contract_end_source === 'manual') return true;

  const notes = (row.notes || '').trim();
  if (!notes) return false;
  // Already auto-flagged by a previous run — don't touch it again.
  if (notes.includes(REVALIDATION_NOTE_PREFIX)) return true;
  return !AUTO_SEED_NOTES.has(notes.toLowerCase());
}

interface RevalidationResults {
  checked: number;
  flagged: number;
  skipped_user_edited: number;
  skipped_no_transactions: number;
}

async function revalidateBankSubscriptions(
  supabase: SupabaseClient
): Promise<RevalidationResults> {
  const out: RevalidationResults = {
    checked: 0,
    flagged: 0,
    skipped_user_edited: 0,
    skipped_no_transactions: 0,
  };

  // Candidates: bank-sourced, still live, not already flagged. Dismissed /
  // cancelled / archived rows are left completely alone.
  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select(
      'id, user_id, provider_name, recurring_group, bank_description, notes, subcategory, account_email, login_url, contract_end_source'
    )
    .in('source', ['bank', 'bank_auto'])
    .eq('status', 'active')
    .is('dismissed_at', null)
    .is('archived_at', null)
    .is('cancelled_at', null)
    .or('needs_review.is.null,needs_review.eq.false')
    .order('created_at', { ascending: true })
    .limit(REVALIDATION_ROW_CAP);

  if (error || !rows || rows.length === 0) {
    if (error) console.error('[detect-subscriptions] revalidation query failed:', error);
    return out;
  }

  // Group by user so we fetch each user's transaction history once.
  const byUser = new Map<string, RevalidationRow[]>();
  for (const row of rows as RevalidationRow[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  for (const [userId, userRows] of byUser) {
    const { data: txs } = await supabase
      .from('bank_transactions')
      .select('merchant_name, description, amount, timestamp, category, user_category')
      .eq('user_id', userId)
      .lt('amount', 0) // outgoing only
      .gte('timestamp', since)
      .order('timestamp', { ascending: true })
      .limit(5000);

    // Index the series by the same canonical key the subscriptions carry.
    const seriesByKey = new Map<string, Array<{ date: string; amount: number }>>();
    for (const tx of txs || []) {
      if (isExcludedTransactionCategory(tx.user_category || tx.category)) continue;
      const key = deriveRecurringGroup(tx.merchant_name || tx.description);
      if (!key) continue;
      if (!seriesByKey.has(key)) seriesByKey.set(key, []);
      seriesByKey.get(key)!.push({
        date: tx.timestamp,
        amount: Math.abs(parseFloat(String(tx.amount)) || 0),
      });
    }

    for (const row of userRows) {
      if (looksUserEdited(row)) {
        out.skipped_user_edited++;
        continue;
      }

      const key = row.recurring_group || deriveRecurringGroup(row.provider_name);
      const series = key ? seriesByKey.get(key) : undefined;

      // No matching transactions in the window (disconnected bank, renamed
      // merchant, email-sourced row mislabelled as bank). We can't judge it,
      // so we say nothing.
      if (!series || series.length === 0) {
        out.skipped_no_transactions++;
        continue;
      }

      out.checked++;

      const result = qualifyRecurringSeries(series, {
        highVariance: isHighVarianceMerchant(row.provider_name, row.bank_description),
      });

      if (result.qualifies) continue;

      const reason = isCouncilTaxMerchant(row.provider_name)
        ? 'council_tax_belongs_in_expected_bills'
        : result.reason;

      const note =
        `${REVALIDATION_NOTE_PREFIX} ${today}: re-checked against your bank history and this no longer ` +
        `looks like a recurring subscription (${reason}). Nothing has been changed — confirm it's yours or remove it.`;
      const nextNotes = [(row.notes || '').trim(), note].filter(Boolean).join('\n');

      // needs_review + note ONLY. Status, amount, cycle and category are
      // left exactly as they are.
      const { error: updateErr } = await supabase
        .from('subscriptions')
        .update({ needs_review: true, notes: nextNotes })
        .eq('id', row.id);

      if (updateErr) {
        console.error(`[detect-subscriptions] revalidation update failed for ${row.id}:`, updateErr);
      } else {
        out.flagged++;
      }
    }
  }

  return out;
}

/**
 * Daily subscription auto-detection cron.
 * Scans bank_transactions for recurring patterns, enriches merchant_name,
 * and auto-creates subscriptions from high-confidence matches.
 *
 * Schedule: Daily at 4am (after bank-sync at 3am)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const results = { enriched: 0, detected: 0, created: 0, skipped: 0 };

  // ── Who is in scope for this run? ────────────────────────────────
  //
  // Resolved FIRST so the enrichment below can be scoped to it.
  //
  // Two bugs fixed here on 2026-08-21:
  //
  //   1. The merchant_name enrichment underneath used to run with no
  //      user filter at all. On a service-role client that meant every
  //      daily run rewrote merchant_name across EVERY user's
  //      transactions, not just the ones being processed. It is now
  //      bounded to `userIds`.
  //
  //   2. This query had no ORDER BY under its limit(1000), so once the
  //      table passed a thousand rows the set of users the cron
  //      actually processed was whatever Postgres happened to return.
  //      Ordering by timestamp makes it "the most recently active
  //      users", which is at least a defensible rule.
  //
  // The `.not('merchant_name', 'is', null)` filter also had to go: it
  // excluded exactly the users whose transactions the enrichment step
  // was about to populate, so a brand new connection could sit
  // unprocessed until something else filled a merchant name in.
  const { data: users } = await supabase
    .from('bank_transactions')
    .select('user_id')
    .gte('timestamp', sixMonthsAgo.toISOString())
    .order('timestamp', { ascending: false })
    .limit(1000);

  const userIds = [...new Set((users || []).map(u => u.user_id))];

  // Step 1: Enrich merchant_name on any new unmatched transactions,
  // for the users in scope only.
  const { data: rules } = await supabase
    .from('merchant_rules')
    .select('raw_name, display_name');

  if (rules && userIds.length > 0) {
    for (const rule of rules) {
      await supabase
        .from('bank_transactions')
        .update({ merchant_name: rule.display_name })
        .in('user_id', userIds)
        .is('merchant_name', null)
        .ilike('description', `%${rule.raw_name}%`);
    }
  }

  // Step 2: Find recurring patterns — group by merchant_name + user_id

  for (const userId of userIds) {
    // Get all transactions with merchant_name for this user in last 6 months
    const { data: txs } = await supabase
      .from('bank_transactions')
      .select('merchant_name, amount, timestamp, description, category')
      .eq('user_id', userId)
      .not('merchant_name', 'is', null)
      .lt('amount', 0) // Only outgoing
      .gte('timestamp', sixMonthsAgo.toISOString())
      .order('timestamp', { ascending: true });

    if (!txs || txs.length === 0) continue;

    // Group by merchant_name
    const groups = new Map<string, typeof txs>();
    for (const tx of txs) {
      if (!groups.has(tx.merchant_name!)) groups.set(tx.merchant_name!, []);
      groups.get(tx.merchant_name!)!.push(tx);
    }

    // Get existing subscriptions for this user (all statuses — including dismissed).
    // Pull recurring_group too so we can short-circuit duplicates on the canonical
    // key rather than a loose lowercase-provider-name compare.
    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('provider_name, recurring_group')
      .eq('user_id', userId);

    // Build two sets: exact lowercase names AND normalised names for fuzzy dedup
    const existingExact = new Set(
      (existingSubs || []).map(s => (s.provider_name || '').toLowerCase())
    );
    const existingNormalised = new Set(
      (existingSubs || []).map(s => normaliseProviderName(s.provider_name || ''))
    );
    const existingKeys = new Set(
      (existingSubs || [])
        .map(s => s.recurring_group)
        .filter((k): k is string => !!k)
    );

    for (const [merchant, merchantTxs] of groups) {
      // Skip council tax / local authority payments — they belong in Expected Bills
      if (isCouncilTaxMerchant(merchant)) continue;

      // Skip if already tracked (exact match, normalised match, or canonical
      // recurring_group key from post-20260422020000 migration).
      if (existingExact.has(merchant.toLowerCase())) continue;
      if (existingNormalised.has(normaliseProviderName(merchant))) continue;
      const merchantKey = deriveRecurringGroup(merchant);
      if (merchantKey && existingKeys.has(merchantKey)) continue;

      // Need at least 2 payments
      if (merchantTxs.length < 2) continue;

      // Check for recurring pattern: similar amounts appearing regularly
      const amounts = merchantTxs.map(t => Math.abs(parseFloat(String(t.amount))));
      const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;

      // Check amount consistency (within 15%)
      const consistent = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.15);
      if (!consistent) continue;

      // Check frequency: are payments roughly monthly?
      const dates = merchantTxs.map(t => new Date(t.timestamp).getTime());
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)); // Days between
      }

      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

      // Determine billing cycle
      let billingCycle = 'monthly';
      if (avgGap >= 350 && avgGap <= 380) billingCycle = 'yearly';
      else if (avgGap >= 80 && avgGap <= 100) billingCycle = 'quarterly';
      else if (avgGap >= 6 && avgGap <= 8) billingCycle = 'weekly';
      else if (avgGap < 25 || avgGap > 35) continue; // Not a clear monthly pattern

      results.detected++;

      // Check confidence: is this from a known subscription merchant?
      const { data: rule } = await supabase
        .from('merchant_rules')
        .select('is_subscription, category, payment_type')
        .ilike('display_name', merchant)
        .maybeSingle();

      const isKnownSub = rule?.is_subscription === true;
      const confidence = isKnownSub ? 95 : (consistent && merchantTxs.length >= 3 ? 75 : 50);

      // Auto-create if high confidence
      if (confidence >= 80) {
        const { error: insertErr } = await supabase.from('subscriptions').insert({
          user_id: userId,
          provider_name: merchant,
          amount: Math.round(avgAmount * 100) / 100,
          category: rule?.category || merchantTxs[0].category || 'other',
          billing_cycle: billingCycle,
          status: 'active',
          source: 'bank_auto',
          recurring_group: merchantKey,
        });

        if (!insertErr) {
          results.created++;
          // Add to both dedup sets so concurrent iterations in this run don't re-insert
          existingExact.add(merchant.toLowerCase());
          existingNormalised.add(normaliseProviderName(merchant));
        }
      } else {
        results.skipped++;
      }
    }
  }

  // Step 3: Retro re-validation of legacy bank-detected subscriptions.
  // Runs after detection so freshly-inserted rows in this run are already
  // excluded (they carry needs_review from their own writer, or qualify).
  let revalidation: RevalidationResults;
  try {
    revalidation = await revalidateBankSubscriptions(supabase);
  } catch (e) {
    console.error('[detect-subscriptions] revalidation pass failed:', e);
    revalidation = { checked: 0, flagged: 0, skipped_user_edited: 0, skipped_no_transactions: 0 };
  }

  console.log(`[detect-subscriptions] Results:`, results, 'revalidation:', revalidation);
  return NextResponse.json({ ok: true, ...results, revalidation });
}
