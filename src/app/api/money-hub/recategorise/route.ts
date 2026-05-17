import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { learnFromCorrection } from '@/lib/learning-engine';
import { resolveAndStoreMapping } from '@/lib/subcategory-engine';
import {
  bumpUserIntelligence,
  voteMerchantCategoryWisdom,
  propagateMerchantWisdom,
} from '@/lib/user-intelligence';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * POST /api/money-hub/recategorise
 *
 * Recategorise transactions by merchant pattern or single transaction ID.
 * Saves override to money_hub_category_overrides, updates bank_transactions
 * directly, and teaches the learning engine for future auto-categorisation.
 *
 * Body options:
 * - { merchantPattern, newCategory, applyToAll?: true }
 * - { transactionId, newCategory }
 * - { merchantPattern, newIncomeType }
 *
 * Optional on any spending-category form:
 * - userSubcategory: TEXT — Tier-2 personal label (e.g. "Groceries → Organic").
 *   Stored on bank_transactions.user_subcategory. Reporting RPCs aggregate on
 *   the canonical Tier-1 (`user_category`) and ignore this field — so subcats
 *   are pure display sugar and never fragment cross-user statistics.
 *
 * Optional on the income form:
 * - newIncomeSubcategory: TEXT — custom income label (e.g. "Director Salary",
 *   "Client Payment"). When set, income_type is held to a CHECK-compliant
 *   placeholder ('other') and the actual label lives on user_subcategory.
 *   user_category is set to 'income' so the user_category_custom registry's
 *   usage_count join in get_user_subcategories stays meaningful.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { transactionId, merchantPattern, newCategory, newIncomeType, applyToAll, userSubcategory, newIncomeSubcategory } = body;
    const subcat = typeof userSubcategory === 'string' && userSubcategory.trim().length > 0
      ? userSubcategory.trim().slice(0, 50)
      : null;
    const incomeSubcat = typeof newIncomeSubcategory === 'string' && newIncomeSubcategory.trim().length > 0
      ? newIncomeSubcategory.trim().slice(0, 50)
      : null;

    // Resolve the category label through the subcategory engine so custom
    // labels (e.g. "Sainsbury's") get inferred to a canonical parent and
    // the mapping is stored for future lookups.
    const admin = getAdmin();
    let resolvedCategory = newCategory;
    let resolvedSubcategory = subcat;
    let resolvedParent = newCategory;
    if (newCategory) {
      const resolution = await resolveAndStoreMapping(admin, user.id, newCategory);
      resolvedParent = resolution.parentCategory;
      resolvedCategory = resolution.parentCategory; // user_category always = canonical parent
      // If the user typed a custom label, it becomes the subcategory
      if (!resolution.isCanonical && resolution.subcategoryLabel) {
        resolvedSubcategory = resolvedSubcategory ?? resolution.subcategoryLabel;
      }
    }

    if (!newCategory && !newIncomeType) {
      return NextResponse.json({ error: 'newCategory or newIncomeType required' }, { status: 400 });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // ─── Income type recategorisation ──────────────────────────────────────
    if (newIncomeType) {
      // When the user reclassifies to a real income type, clear any conflicting
      // user_category spending override (e.g. if they'd previously marked it 'loans').
      //
      // If a custom income subcategory was supplied (e.g. "Client Payment"),
      // user_subcategory carries the actual label and user_category is set to
      // 'income' so the user_category_custom registry's usage-count join in
      // get_user_subcategories can find these rows.
      const incomePatch: Record<string, any> = incomeSubcat
        ? { income_type: newIncomeType, user_category: 'income', user_subcategory: incomeSubcat }
        : { income_type: newIncomeType, user_category: null };

      if (transactionId) {
        await admin.from('bank_transactions')
          .update(incomePatch)
          .eq('id', transactionId)
          .eq('user_id', user.id);

        // Also clear any per-transaction override row (best-effort)
        try {
          await admin.from('money_hub_category_overrides')
            .delete()
            .eq('user_id', user.id)
            .eq('transaction_id', transactionId);
        } catch { /* silent */ }

        return NextResponse.json({
          success: true,
          updated: 1,
          transactionId,
          incomeType: newIncomeType,
          ...(incomeSubcat ? { incomeSubcategory: incomeSubcat } : {}),
        });
      }

      if (merchantPattern) {
        const pattern = `%${merchantPattern.toLowerCase().trim()}%`;
        const { data: matching } = await admin.from('bank_transactions')
          .select('id')
          .eq('user_id', user.id)
          .gt('amount', 0)
          .gte('timestamp', sixMonthsAgo.toISOString())
          .or(`merchant_name.ilike.${pattern},description.ilike.${pattern}`)
          .limit(500);

        let updated = 0;
        if (matching && matching.length > 0) {
          const ids = matching.map(t => t.id);
          for (let i = 0; i < ids.length; i += 50) {
            const batch = ids.slice(i, i + 50);
            const { count } = await admin.from('bank_transactions')
              .update(incomePatch)
              .in('id', batch);
            if (count) updated += count;
          }
        }

        // Remove any stale merchant-level override that would force back to a spending category (best-effort)
        const corePattern = merchantPattern.toLowerCase().trim();
        try {
          await admin.from('money_hub_category_overrides')
            .delete()
            .eq('user_id', user.id)
            .eq('merchant_pattern', corePattern);
        } catch { /* silent */ }

        await learnFromCorrection({
          rawName: merchantPattern,
          incomeType: newIncomeType,
          userId: user.id,
        }).catch(() => {});

        // Bump intelligence on income-type changes too — these signal
        // a business/personal mix (e.g. flipping a credit to
        // 'client_payment' is a strong business signal).
        void bumpUserIntelligence(admin, user.id, newIncomeType);

        return NextResponse.json({
          success: true,
          updated,
          merchant: merchantPattern,
          incomeType: newIncomeType,
          ...(incomeSubcat ? { incomeSubcategory: incomeSubcat } : {}),
        });
      }
      return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
    }

    // ─── Spending category recategorisation ────────────────────────────────

    // Strip date/ref prefixes to get core merchant pattern
    function getCorePattern(raw: string): string {
      return raw
        .replace(/^\d{4}\s+\d{2}[a-z]{3}\d{2}\s+/i, '')
        .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '')
        .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '')
        .toLowerCase()
        .trim();
    }

    if (merchantPattern) {
      const pattern = merchantPattern.toLowerCase().trim();
      const corePattern = getCorePattern(merchantPattern);
      const overridePattern = corePattern || pattern;

      // 1. Save override for future runtime categorisation
      const { error: upsertErr } = await admin.from('money_hub_category_overrides').upsert({
        user_id: user.id,
        merchant_pattern: overridePattern,
        user_category: resolvedCategory,
      }, { onConflict: 'user_id,merchant_pattern' });

      if (upsertErr) {
        // Fallback: try insert if upsert constraint doesn't exist
        try {
          await admin.from('money_hub_category_overrides').insert({
            user_id: user.id,
            merchant_pattern: overridePattern,
            user_category: resolvedCategory,
          });
        } catch { /* silent */ }
      }

      let updated = 0;

      // 2. Update matching transactions (last 6 months only, using ILIKE for reliability)
      if (applyToAll !== false) {
        const ilikePattern = `%${overridePattern}%`;
        const { data: matching } = await admin.from('bank_transactions')
          .select('id, amount')
          .eq('user_id', user.id)
          .gte('timestamp', sixMonthsAgo.toISOString())
          .or(`merchant_name.ilike.${ilikePattern},description.ilike.${ilikePattern}`)
          .limit(500);

        if (matching && matching.length > 0) {
          // Split into positive-amount (income side) and negative-amount (spending side).
          // For positive amounts re-tagged as a NON-income category, also stamp
          // income_type='credit_loan' so Money Hub excludes them from monthly
          // income (isExcludedIncomeType). But if the user is reclassifying TO
          // 'income', clear income_type so the classifier can re-detect
          // income_type naturally from the transaction's own signals.
          const positiveIds = matching.filter(t => Number(t.amount) > 0).map(t => t.id);
          const negativeIds = matching.filter(t => Number(t.amount) <= 0).map(t => t.id);

          const isIncomeRecat = resolvedCategory === 'income';
          const positivePatch: Record<string, unknown> = isIncomeRecat
            ? { user_category: resolvedCategory, parent_category: resolvedParent, income_type: null }
            : { user_category: resolvedCategory, parent_category: resolvedParent, income_type: 'credit_loan' };
          const negativePatch: Record<string, unknown> = { user_category: resolvedCategory, parent_category: resolvedParent };
          if (resolvedSubcategory !== null) {
            positivePatch.user_subcategory = resolvedSubcategory;
            negativePatch.user_subcategory = resolvedSubcategory;
          }

          for (let i = 0; i < positiveIds.length; i += 50) {
            const batch = positiveIds.slice(i, i + 50);
            const { count } = await admin.from('bank_transactions')
              .update(positivePatch)
              .in('id', batch);
            if (count) updated += count;
          }
          for (let i = 0; i < negativeIds.length; i += 50) {
            const batch = negativeIds.slice(i, i + 50);
            const { count } = await admin.from('bank_transactions')
              .update(negativePatch)
              .in('id', batch);
            if (count) updated += count;
          }
        }
      }

      // 3. Teach the learning engine + update merchant wisdom
      await Promise.all([
        learnFromCorrection({
          rawName: merchantPattern,
          category: resolvedCategory,
          userId: user.id,
        }).catch((e) => console.error('Learn error (non-fatal):', e.message)),
        (async () => {
          const { error: wisdomErr } = await admin.rpc('upsert_merchant_wisdom', {
            p_pattern: merchantPattern.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').substring(0, 60),
            p_category: resolvedCategory,
            p_source: 'user',
          });
          if (wisdomErr) console.error('Wisdom upsert error (non-fatal):', wisdomErr.message);
        })(),
      ]);

      // 3a. Self-learning: bump user_intelligence_profile so the AI
      // learns this user's account_mode + correction velocity, and vote
      // the merchant/category pair into merchant_category_wisdom so
      // other users can benefit anonymously. Both fire-and-forget.
      void bumpUserIntelligence(admin, user.id, newCategory);
      void voteMerchantCategoryWisdom(admin, overridePattern, newCategory);
      // Once the wisdom vote tips past the trust threshold (≥3 distinct
      // user votes for the same merchant/category pair), propagate the
      // category to OTHER users who haven't manually set it. Capped at
      // 200 rows per call to keep the response fast.
      void propagateMerchantWisdom(admin, overridePattern, newCategory, user.id, {
        minVotes: 3,
        maxRows: 200,
      });

      // 4. Reverse-sync to subscriptions: if the user recategorised a
      // merchant in Money Hub, the matching subscription row was
      // stuck on its old category — the subscriptions PATCH path
      // goes subs→Money Hub, but this endpoint was one-way. That
      // meant "Test Valley" could be council_tax in bank_transactions
      // but still 'other' on the Subscriptions page. Keeps the two
      // stores aligned regardless of which screen the user corrects
      // from.
      try {
        const { error: subSyncErr } = await admin.from('subscriptions')
          .update({ category: newCategory })
          .eq('user_id', user.id)
          .is('dismissed_at', null)
          .or(`provider_name.ilike.%${overridePattern}%,bank_description.ilike.%${overridePattern}%`);
        if (subSyncErr) console.error('Sub reverse-sync failed (non-fatal):', subSyncErr.message);
      } catch (e) {
        console.error('Sub reverse-sync threw:', e);
      }

      return NextResponse.json({
        success: true,
        updated,
        merchant: merchantPattern,
        category: resolvedCategory,
        message: `Recategorised ${updated} transaction${updated !== 1 ? 's' : ''} to "${resolvedCategory}"`,
      });
    }

    // Single transaction override
    if (transactionId) {
      // Need metadata for learning engine and to decide whether to exclude from income
      const { data: txnData } = await admin.from('bank_transactions')
        .select('amount, description, merchant_name')
        .eq('id', transactionId)
        .single();

      const txnPatch: Record<string, any> = {
        user_category: resolvedCategory,
        parent_category: resolvedParent,
      };
      if (resolvedSubcategory !== null) txnPatch.user_subcategory = resolvedSubcategory;
      // For positive-amount transactions:
      // - re-tagged as a non-income category → stamp 'credit_loan' so Money Hub
      //   excludes it from monthly income
      // - re-tagged TO 'income' → clear any stale income_type so the classifier
      //   can re-detect it (was previously left untouched, which occasionally
      //   left a credit_loan flag in place that still suppressed income)
      if (txnData && Number(txnData.amount) > 0) {
        txnPatch.income_type = resolvedCategory === 'income' ? null : 'credit_loan';
      }

      await admin.from('bank_transactions')
        .update(txnPatch)
        .eq('id', transactionId)
        .eq('user_id', user.id);

      try {
        await admin.from('money_hub_category_overrides').insert({
          user_id: user.id,
          transaction_id: transactionId,
          user_category: resolvedCategory,
        });
      } catch { /* silent */ }
      
      if (txnData) {
        await learnFromCorrection({
          rawName: txnData.description || txnData.merchant_name || 'Unknown',
          displayName: txnData.merchant_name || undefined,
          category: newCategory,
          amount: txnData.amount,
          userId: user.id,
        }).catch((e) => console.error('Learn error:', e.message));

        // Self-learning: bump intelligence + vote for cross-user wisdom.
        // Merchant pattern from the transaction's merchant_name (falling
        // back to description) so we vote on a real merchant string.
        const wisdomPattern = (txnData.merchant_name || txnData.description || '')
          .toLowerCase().trim();
        void bumpUserIntelligence(admin, user.id, newCategory);
        if (wisdomPattern) {
          void voteMerchantCategoryWisdom(admin, wisdomPattern, newCategory);
        }
      }

      return NextResponse.json({ success: true, updated: 1, transactionId, category: newCategory });
    }

    return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
  } catch (err: any) {
    console.error('Recategorise error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
