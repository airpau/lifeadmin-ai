import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ANNUAL_LOOKBACK_DAYS,
  isCouncilTaxMerchant,
  isHighVarianceMerchant,
} from '@/lib/subscriptions/recurring-qualification';
import {
  groupTransactionsByMerchant,
  isOneOffRetailMerchant,
  reviewExistingRow,
  type DetectionStatus,
} from '@/lib/subscriptions/recurrence-detector';
import { detectionColumnsFor, updateSubscriptionDetection } from '@/lib/subscriptions/detection-writes';
import { isPayrollLike } from '@/lib/subscriptions/payroll-filter';
import { detectRecurring } from '@/lib/detect-recurring';
import { merchantRuleRegexSource } from '@/lib/merchant-rule-match';

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Council tax / local authority blocklist now lives in
// src/lib/subscriptions/recurring-qualification.ts (COUNCIL_TAX_PATTERNS /
// isCouncilTaxMerchant) so every writer shares one list.

// ─── Re-validation of existing bank-detected subscriptions ────────────
//
// Rewritten 2026-10-14 with the new detector
// (src/lib/subscriptions/recurrence-detector.ts). Every live
// bank-detected row is re-judged against the user's real transaction
// history and given a detection_status:
//
//   confirmed            real recurring payment; needs_review cleared
//   needs_review         lapsed, low confidence, or no transactions to
//                        judge it by; left visible and flagged
//   dismissed_by_system  one-off, irregular, or an excluded kind of
//                        payment (fee, interest, card repayment, buy now
//                        pay later, payroll); HIDDEN by default in the
//                        UI, never deleted, and the user can restore it
//
// Deliberately non-destructive: NEVER deletes a row, NEVER changes
// `status`, `amount`, `category` or `billing_cycle`. Manual rows, email
// rows and rows a user has edited are never touched.

/** Max rows re-validated per cron run. */
const REVALIDATION_ROW_CAP = 500;

/** Marker so the legacy note is recognisable. */
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
  category: string | null;
  notes: string | null;
  needs_review: boolean | null;
  subcategory: string | null;
  account_email: string | null;
  login_url: string | null;
  contract_end_source: string | null;
  /** Absent until migration 20261014120000 is applied. */
  detection_reason?: string | null;
}

/**
 * True when the user has already confirmed or restored this row through
 * the app (PATCH /api/subscriptions/[id] records detection_reason
 * 'user_confirmed' or 'user_restored'). The detector never overrides
 * that. needs_review === false on its own proves nothing: it is the
 * column default, so most detector-inserted rows carry it.
 */
function userHasDecided(row: RevalidationRow): boolean {
  const reason = row.detection_reason ?? null;
  return !!reason && reason.startsWith('user_');
}

/**
 * `subscriptions` has no explicit "user edited this row" column, so we use
 * a conservative proxy: a row counts as user-touched if it carries any
 * content only a human could have put there: a note that isn't one of the
 * detectors' own strings, a hand-picked subcategory, an account email or
 * login URL, or a user-sourced contract end date. Over-skipping is the
 * safe direction.
 */
function looksUserEdited(row: RevalidationRow): boolean {
  if (row.subcategory || row.account_email || row.login_url) return true;
  if (row.contract_end_source === 'user' || row.contract_end_source === 'manual') return true;

  const humanLines = (row.notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(REVALIDATION_NOTE_PREFIX) && !AUTO_SEED_NOTES.has(l.toLowerCase()));
  return humanLines.length > 0;
}

interface RevalidationResults {
  checked: number;
  confirmed: number;
  needs_review: number;
  dismissed_by_system: number;
  skipped_user_edited: number;
  failed: number;
}

async function revalidateBankSubscriptions(
  supabase: SupabaseClient
): Promise<RevalidationResults> {
  const out: RevalidationResults = {
    checked: 0,
    confirmed: 0,
    needs_review: 0,
    dismissed_by_system: 0,
    skipped_user_edited: 0,
    failed: 0,
  };

  // Candidates: bank-sourced and still live. Dismissed, cancelled and
  // archived rows are left completely alone. Manual and email rows are
  // never selected.
  const baseCols =
    'id, user_id, provider_name, recurring_group, bank_description, category, notes, needs_review, subcategory, account_email, login_url, contract_end_source';
  const selectRows = (cols: string) =>
    supabase
      .from('subscriptions')
      .select(cols)
      .in('source', ['bank', 'bank_auto'])
      .eq('status', 'active')
      .is('dismissed_at', null)
      .is('archived_at', null)
      .is('cancelled_at', null)
      .order('created_at', { ascending: true })
      .limit(REVALIDATION_ROW_CAP);
  // detection_reason exists only once migration 20261014120000 is applied.
  let detectionColumns = true;
  let { data: rows, error } = await selectRows(`${baseCols}, detection_reason`);
  if (error) {
    detectionColumns = false;
    ({ data: rows, error } = await selectRows(baseCols));
  }

  if (error || !rows || rows.length === 0) {
    if (error) console.error('[detect-subscriptions] revalidation query failed:', error);
    return out;
  }

  // Group by user so we fetch each user's transaction history once.
  const byUser = new Map<string, RevalidationRow[]>();
  for (const row of rows as unknown as RevalidationRow[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  const since = new Date(Date.now() - ANNUAL_LOOKBACK_DAYS * 86_400_000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const isHighVariance = (m: string, d?: string | null) =>
    isHighVarianceMerchant(m, d) || isOneOffRetailMerchant(m, d);

  for (const [userId, userRows] of byUser) {
    const { data: txs } = await supabase
      .from('bank_transactions')
      .select('merchant_name, description, amount, timestamp, category, user_category, transfer_pair_id')
      .eq('user_id', userId)
      .lt('amount', 0) // outgoing only
      .is('deleted_at', null)
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(5000);

    const groups = groupTransactionsByMerchant(txs || []);
    // Judge liveness against the freshest transaction we hold, so a bank
    // feed that stopped syncing does not mark everything as lapsed.
    const latest = txs && txs[0]?.timestamp ? new Date(txs[0].timestamp) : new Date();
    const asOf = latest.getTime() < Date.now() ? latest : new Date();

    for (const row of userRows) {
      if (userHasDecided(row) || looksUserEdited(row)) {
        out.skipped_user_edited++;
        continue;
      }
      // Without the detection columns nothing can be hidden, so only the
      // legacy flag-and-note behaviour is available. Skip rows already
      // noted so they are not rewritten every night.
      if (!detectionColumns && (row.notes || '').includes(REVALIDATION_NOTE_PREFIX)) {
        out.skipped_user_edited++;
        continue;
      }
      out.checked++;

      let status: DetectionStatus;
      let reason: string;
      let result = null;
      if (isPayrollLike({ provider_name: row.provider_name, description: row.bank_description })) {
        status = 'dismissed_by_system';
        reason = 'payroll';
      } else {
        const review = reviewExistingRow(row, groups, { now: asOf, isHighVariance });
        status = review.status;
        reason = review.reason;
        result = review.result;
        // Council tax is real and recurring, but belongs in Expected Bills.
        if (status === 'confirmed' && isCouncilTaxMerchant(row.provider_name)) {
          status = 'needs_review';
          reason = 'council_tax_belongs_in_expected_bills';
        }
      }

      const fields: Record<string, unknown> = { ...detectionColumnsFor(status, reason, result) };
      if (status === 'confirmed') {
        // The detector is confident: stop asking the user to confirm it.
        // Only once the detection columns exist, so the cleared flag can
        // still be told apart from a user's own confirmation.
        if (row.needs_review && detectionColumns) fields.needs_review = false;
      } else if (row.needs_review !== true) {
        fields.needs_review = true;
      }
      if (status === 'dismissed_by_system' && !(row.notes || '').includes(REVALIDATION_NOTE_PREFIX)) {
        const note =
          `${REVALIDATION_NOTE_PREFIX} ${today}: re-checked against your bank history and this does not look ` +
          `like a regular payment (${reason}). ` +
          (detectionColumns
            ? 'It has been hidden, not deleted. Show hidden items to restore it.'
            : 'Nothing has been changed. Confirm it is yours or remove it.');
        fields.notes = [(row.notes || '').trim(), note].filter(Boolean).join('\n');
      }

      const { error: updateErr } = await updateSubscriptionDetection(supabase, row.id, fields);
      if (updateErr) {
        out.failed++;
        console.error(`[detect-subscriptions] revalidation update failed for ${row.id}:`, updateErr);
      } else {
        out[status]++;
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

  //
  // Matched with a word-aware regex, not `ILIKE '%raw_name%'`. The
  // substring test stamped "Transport for London" on rent paid through
  // PayProp ("ACCRENTFLAT1" contains t-f-l), "RAC" on every gym member
  // called Tracey or Rachel, and "EE" on anything with a double e.
  // Because this step only fills NULLs, whichever wrong rule got there
  // first stuck for good. See src/lib/merchant-rule-match.ts.
  //
  // Longest rule first, so "AIRBNB PAYMENTS UK" wins over a shorter rule
  // that also matches the same line.
  if (rules && userIds.length > 0) {
    const ordered = [...rules].sort(
      (a, b) => (b.raw_name || '').trim().length - (a.raw_name || '').trim().length,
    );
    for (const rule of ordered) {
      const pattern = merchantRuleRegexSource(rule.raw_name);
      if (!pattern || !rule.display_name) continue;
      const { error: enrichErr } = await supabase
        .from('bank_transactions')
        .update({ merchant_name: rule.display_name })
        .in('user_id', userIds)
        .is('merchant_name', null)
        // PostgREST `imatch` is PostgreSQL `~*`.
        .filter('description', 'imatch', pattern);
      if (enrichErr) {
        console.error(
          `[detect-subscriptions] merchant enrichment failed for rule "${rule.raw_name}": ${enrichErr.message}`,
        );
      }
    }
  }

  // Step 2: detection. The loose two-payment heuristic that used to live
  // here (average gap, +/-15% of the average amount) is gone; every
  // writer now goes through the same detector as bank sync.
  const started = Date.now();
  for (const userId of userIds) {
    if (Date.now() - started > 60_000) {
      results.skipped += 1;
      continue;
    }
    try {
      const created = await detectRecurring(userId, supabase);
      results.detected += 1;
      results.created += created;
    } catch (e) {
      console.error(`[detect-subscriptions] detection failed for user ${userId}:`, e);
    }
  }

  // Step 3: re-validation of existing bank-detected subscriptions.
  let revalidation: RevalidationResults;
  try {
    revalidation = await revalidateBankSubscriptions(supabase);
  } catch (e) {
    console.error('[detect-subscriptions] revalidation pass failed:', e);
    revalidation = { checked: 0, confirmed: 0, needs_review: 0, dismissed_by_system: 0, skipped_user_edited: 0, failed: 0 };
  }

  console.log(`[detect-subscriptions] Results:`, results, 'revalidation:', revalidation);
  return NextResponse.json({ ok: true, ...results, revalidation });
}
