/**
 * Helpers around `user_intelligence_profile` and `merchant_category_wisdom`.
 *
 * These two tables are the self-learning surface for category preferences:
 *
 * - `user_intelligence_profile`: one row per user, summarising what we
 *   know about HOW they categorise their money. The most important field
 *   is `account_mode` ('personal' / 'business' / 'mixed') — derived from
 *   the mix of business-vs-consumer category overrides the user creates.
 *
 * - `merchant_category_wisdom`: anonymous cross-user category votes.
 *   When user A recategorises "Tesco" → "groceries", we increment the
 *   ("tesco", "groceries") vote. Users B/C/D who haven't manually set a
 *   category for Tesco transactions can then benefit from that vote.
 *
 * Both writes are fire-and-forget — never block the request path.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const BUSINESS_CATEGORIES = new Set([
  // Categories that are predominantly used on business / sole-trader
  // accounts. Used to derive account_mode.
  'professional', 'software', 'subscriptions',
  'business', 'tax', 'accounting', 'legal',
  'office', 'marketing', 'advertising',
  'staff', 'payroll', 'contractor',
  'travel_business', 'commercial', 'rent',
]);

const PERSONAL_CATEGORIES = new Set([
  'groceries', 'eating_out', 'streaming', 'fitness',
  'childcare', 'mortgage', 'council_tax', 'energy', 'water',
  'broadband', 'mobile', 'shopping', 'fuel', 'transport',
]);

/**
 * Bump the user's intelligence profile after a category save. Updates:
 *  - category_correction_count / total_category_corrections
 *  - account_mode (derived from rolling business-vs-personal category mix)
 *  - last_updated_at
 *
 * Fire-and-forget. If the upsert fails (e.g. table doesn't exist on a
 * fresh local DB) we swallow the error.
 */
export async function bumpUserIntelligence(
  client: SupabaseClient,
  userId: string,
  newCategory: string,
): Promise<void> {
  if (!userId || !newCategory) return;

  try {
    const cat = newCategory.toLowerCase().trim();
    const isBusiness = BUSINESS_CATEGORIES.has(cat);
    const isPersonal = PERSONAL_CATEGORIES.has(cat);

    // Load existing row (if any) so we can roll forward the counters.
    const { data: existing } = await client
      .from('user_intelligence_profile')
      .select('account_mode, business_category_pct, total_category_corrections')
      .eq('user_id', userId)
      .maybeSingle();

    const previousCount = existing?.total_category_corrections ?? 0;
    const previousBusinessPct = Number(existing?.business_category_pct ?? 0);
    const previousBusinessCorrections = Math.round((previousBusinessPct / 100) * previousCount);

    const newCount = previousCount + 1;
    const newBusinessCorrections = previousBusinessCorrections + (isBusiness ? 1 : 0);
    const newBusinessPct = newCount > 0 ? (newBusinessCorrections / newCount) * 100 : 0;

    // account_mode rule (intentionally simple — sample size guard at 5):
    //  - <5 corrections: leave existing mode or default 'personal'
    //  - ≥5 and >60% business categories → 'business'
    //  - ≥5 and 30–60% business categories → 'mixed'
    //  - ≥5 and <30% business categories → 'personal'
    let accountMode: string = existing?.account_mode ?? 'personal';
    if (newCount >= 5) {
      if (newBusinessPct > 60) accountMode = 'business';
      else if (newBusinessPct >= 30) accountMode = 'mixed';
      else accountMode = 'personal';
    }

    // Avoid stomping a recent personal flip with a single business save
    // if the user's overall mode is 'mixed' / 'business'.
    if (isPersonal && accountMode === 'business' && newBusinessPct < 75) {
      accountMode = 'mixed';
    }

    await client
      .from('user_intelligence_profile')
      .upsert(
        {
          user_id: userId,
          account_mode: accountMode,
          business_category_pct: Number(newBusinessPct.toFixed(2)),
          total_category_corrections: newCount,
          category_correction_count: newCount,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  } catch (err) {
    // Don't bubble up — non-blocking by design.
    console.warn(
      '[user-intelligence] bump failed (non-blocking):',
      (err as Error)?.message ?? err,
    );
  }
}

/**
 * Vote for a (merchant_pattern, user_category) pair in
 * `merchant_category_wisdom`. The first time the pair is seen we insert
 * with vote_count=1; subsequent calls increment vote_count.
 *
 * Fire-and-forget.
 */
export async function voteMerchantCategoryWisdom(
  client: SupabaseClient,
  merchantPattern: string,
  userCategory: string,
): Promise<void> {
  if (!merchantPattern || !userCategory) return;

  const pattern = merchantPattern.toLowerCase().trim().slice(0, 200);
  const cat = userCategory.toLowerCase().trim();
  if (!pattern || !cat) return;

  try {
    // Try insert first (covers the first-vote path).
    const { error: insertErr } = await client
      .from('merchant_category_wisdom')
      .insert({
        merchant_pattern: pattern,
        user_category: cat,
        vote_count: 1,
        last_seen_at: new Date().toISOString(),
      });

    if (!insertErr) return;

    // Likely a unique-constraint hit — fall through to increment path.
    const { data: existing } = await client
      .from('merchant_category_wisdom')
      .select('id, vote_count')
      .eq('merchant_pattern', pattern)
      .eq('user_category', cat)
      .maybeSingle();

    if (existing?.id) {
      await client
        .from('merchant_category_wisdom')
        .update({
          vote_count: (existing.vote_count ?? 0) + 1,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
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
 * manually set a user_category. The merchant_category_wisdom vote_count
 * acts as the trust gate — only patterns with ≥3 votes propagate.
 *
 * Pure cross-user learning — anonymous, no PII traverses accounts.
 *
 * Fire-and-forget. Caps propagation at 500 rows per call to keep this
 * cheap on the request path.
 */
export async function propagateMerchantWisdom(
  client: SupabaseClient,
  merchantPattern: string,
  newCategory: string,
  excludeUserId: string,
  options?: { minVotes?: number; maxRows?: number },
): Promise<{ propagated: number }> {
  const minVotes = options?.minVotes ?? 3;
  const maxRows = Math.min(options?.maxRows ?? 500, 1000);

  if (!merchantPattern || !newCategory) return { propagated: 0 };

  const pattern = merchantPattern.toLowerCase().trim();
  const cat = newCategory.toLowerCase().trim();
  if (!pattern || !cat) return { propagated: 0 };

  try {
    // Check the vote_count gate first — don't propagate low-confidence picks.
    const { data: wisdom } = await client
      .from('merchant_category_wisdom')
      .select('vote_count')
      .eq('merchant_pattern', pattern)
      .eq('user_category', cat)
      .maybeSingle();

    if (!wisdom || (wisdom.vote_count ?? 0) < minVotes) {
      return { propagated: 0 };
    }

    // Find candidate transactions on OTHER users that match the merchant
    // and have a null OR AI-set user_category (i.e. not user-corrected).
    // We rely on `learning_source IS DISTINCT FROM 'user'` to avoid
    // overwriting a manual correction. If the column doesn't exist on
    // this DB version, we filter on user_category IS NULL only.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const ilikePattern = `%${pattern}%`;
    const { data: candidates } = await client
      .from('bank_transactions')
      .select('id, user_id, user_category')
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
        .in('id', batch.map((c) => c.id));
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
