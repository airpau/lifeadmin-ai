/**
 * Helpers around `user_intelligence_profile` and `merchant_category_wisdom`.
 *
 * Schemas (master, migration 20260516000000_space_type_and_self_learning.sql
 * and 20260515110000_merchant_category_wisdom.sql):
 *
 * - `user_intelligence_profile` (one row per user):
 *     user_id, account_mode ('personal'|'business'|'mixed'),
 *     alert_sensitivity, preferred_alert_hour,
 *     large_transaction_threshold_pence, dismissed_alert_types[],
 *     engagement_score, last_updated_at.
 *
 * - `merchant_category_wisdom` (anonymous, NO user_id):
 *     merchant_pattern (UNIQUE), suggested_category, confidence,
 *     vote_count, source, created_at, updated_at.
 *   Maintained via the `upsert_merchant_wisdom(pattern, category, source)`
 *   RPC and the `bank_txn_learn_category` trigger that auto-votes on
 *   every bank_transactions.user_category update.
 *
 * All writes here are fire-and-forget — they must never block the
 * request path.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Categories that are predominantly used on business / sole-trader
// accounts. Used to nudge account_mode toward 'business'.
const BUSINESS_CATEGORIES = new Set([
  'professional', 'business', 'tax', 'accounting', 'legal',
  'office', 'marketing', 'advertising',
  'staff', 'payroll', 'contractor',
  'travel_business', 'commercial', 'business_rates',
  'business_income', 'client_payment', 'invoice_payment',
]);

const PERSONAL_CATEGORIES = new Set([
  'groceries', 'eating_out', 'streaming', 'fitness',
  'childcare', 'mortgage', 'council_tax', 'energy', 'water',
  'broadband', 'mobile', 'shopping', 'fuel', 'transport',
]);

/**
 * Bump the user's intelligence profile after a category save.
 * Writes only the columns that exist on master's schema:
 *   - account_mode (rolling window over recent corrections)
 *   - last_updated_at
 * Counters live in the daily-learning cron, not here.
 *
 * Fire-and-forget. Errors are swallowed.
 */
export async function bumpUserIntelligence(
  // SupabaseClient typings diverge between server-side and admin-role
  // creators; accept either by typing as `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  newCategory: string,
): Promise<void> {
  if (!userId || !newCategory) return;

  try {
    const cat = newCategory.toLowerCase().trim();
    const isBusiness = BUSINESS_CATEGORIES.has(cat);
    const isPersonal = PERSONAL_CATEGORIES.has(cat);

    // Read current row so we don't flip account_mode on a single save.
    const { data: existing } = await client
      .from('user_intelligence_profile')
      .select('account_mode')
      .eq('user_id', userId)
      .maybeSingle();

    let accountMode: string = existing?.account_mode ?? 'personal';

    // Conservative transitions:
    //   - First-ever save with a business category on a 'personal' row → 'mixed'
    //   - Business save on 'mixed' row → stays 'mixed' (cron promotes to 'business')
    //   - Personal save on 'business' row → 'mixed'
    if (isBusiness && accountMode === 'personal') accountMode = 'mixed';
    if (isPersonal && accountMode === 'business') accountMode = 'mixed';

    await client
      .from('user_intelligence_profile')
      .upsert(
        {
          user_id: userId,
          account_mode: accountMode,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  } catch (err) {
    console.warn(
      '[user-intelligence] bump failed (non-blocking):',
      (err as Error)?.message ?? err,
    );
  }
}

/**
 * Cast a vote in `merchant_category_wisdom` via the master RPC
 * `upsert_merchant_wisdom(p_pattern, p_category, p_source)`. The RPC
 * handles confidence accumulation + vote_count.
 *
 * NOTE: the `bank_txn_learn_category` trigger on bank_transactions
 * already auto-votes whenever user_category is updated, so this
 * helper is mostly a no-op redundancy when called from a code path
 * that just wrote user_category. Keeping it for code paths that
 * change the category WITHOUT touching bank_transactions (e.g. the
 * income-type recategorisation branch).
 *
 * Fire-and-forget.
 */
export async function voteMerchantCategoryWisdom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  merchantPattern: string,
  userCategory: string,
  source: 'user' | 'ai' | 'system' = 'user',
): Promise<void> {
  if (!merchantPattern || !userCategory) return;

  const pattern = merchantPattern.toLowerCase().trim().slice(0, 200);
  const cat = userCategory.toLowerCase().trim();
  if (!pattern || !cat) return;

  try {
    await client.rpc('upsert_merchant_wisdom', {
      p_pattern: pattern,
      p_category: cat,
      p_source: source,
    });
  } catch (err) {
    console.warn(
      '[user-intelligence] wisdom vote failed (non-blocking):',
      (err as Error)?.message ?? err,
    );
  }
}

/**
 * Propagate a (merchant_pattern → category) override to OTHER users
 * who have transactions matching the merchant pattern and have NOT
 * manually set a user_category. The wisdom row's `vote_count` and
 * `confidence` act as the trust gate — only patterns above the
 * configured thresholds propagate.
 *
 * Reads master's schema: `suggested_category`, `confidence`, `vote_count`.
 *
 * Pure cross-user learning — anonymous, no PII traverses accounts.
 *
 * Fire-and-forget. Caps propagation at 500 rows per call.
 */
export async function propagateMerchantWisdom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  merchantPattern: string,
  newCategory: string,
  excludeUserId: string,
  options?: { minVotes?: number; minConfidence?: number; maxRows?: number },
): Promise<{ propagated: number }> {
  const minVotes = options?.minVotes ?? 3;
  const minConfidence = options?.minConfidence ?? 0.7;
  const maxRows = Math.min(options?.maxRows ?? 500, 1000);

  if (!merchantPattern || !newCategory) return { propagated: 0 };

  const pattern = merchantPattern.toLowerCase().trim();
  const cat = newCategory.toLowerCase().trim();
  if (!pattern || !cat) return { propagated: 0 };

  try {
    // Confidence + vote_count gate. Only propagate when:
    //   - the wisdom row exists for this pattern,
    //   - its suggested_category matches what we'd propagate (the
    //     trigger may have promoted a different category if the
    //     cross-user vote went the other way), and
    //   - it's past both the vote and confidence thresholds.
    const { data: wisdom } = await client
      .from('merchant_category_wisdom')
      .select('suggested_category, vote_count, confidence')
      .eq('merchant_pattern', pattern)
      .maybeSingle();

    if (!wisdom) return { propagated: 0 };
    if ((wisdom.vote_count ?? 0) < minVotes) return { propagated: 0 };
    if (Number(wisdom.confidence ?? 0) < minConfidence) return { propagated: 0 };
    if ((wisdom.suggested_category ?? '').toLowerCase() !== cat) {
      return { propagated: 0 };
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const ilikePattern = `%${pattern}%`;

    // OTHER users' uncategorised transactions. `user_category IS NULL`
    // guarantees we never overwrite a manual correction.
    const { data: candidates } = await client
      .from('bank_transactions')
      .select('id, user_id')
      .neq('user_id', excludeUserId)
      .gte('timestamp', sixMonthsAgo.toISOString())
      .or(`merchant_name.ilike.${ilikePattern},description.ilike.${ilikePattern}`)
      .is('user_category', null)
      .limit(maxRows);

    if (!candidates || candidates.length === 0) {
      return { propagated: 0 };
    }

    let propagated = 0;
    for (let i = 0; i < candidates.length; i += 100) {
      const batch = candidates.slice(i, i + 100);
      const { count } = await client
        .from('bank_transactions')
        .update({ user_category: cat })
        .in('id', batch.map((c: { id: string }) => c.id));
      if (count) propagated += count;
    }

    return { propagated };
  } catch (err) {
    console.warn(
      '[user-intelligence] propagate failed (non-blocking):',
      (err as Error)?.message ?? err,
    );
    return { propagated: 0 };
  }
}
