import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { learnFromCorrection } from '@/lib/learning-engine';

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
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { transactionId, merchantPattern, newCategory, newIncomeType, applyToAll } = body;

    if (!newCategory && !newIncomeType) {
      return NextResponse.json({ error: 'newCategory or newIncomeType required' }, { status: 400 });
    }

    const admin = getAdmin();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // ─── Income type recategorisation ──────────────────────────────────────
    if (newIncomeType) {
      // When the user reclassifies to a real income type, clear any conflicting
      // user_category spending override (e.g. if they'd previously marked it 'loans').
      const incomePatch: Record<string, any> = { income_type: newIncomeType, user_category: null };

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

        return NextResponse.json({ success: true, updated: 1, transactionId, incomeType: newIncomeType });
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

        return NextResponse.json({ success: true, updated, merchant: merchantPattern, incomeType: newIncomeType });
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
        user_category: newCategory,
      }, { onConflict: 'user_id,merchant_pattern' });

      if (upsertErr) {
        // Fallback: try insert if upsert constraint doesn't exist
        try {
          await admin.from('money_hub_category_overrides').insert({
            user_id: user.id,
            merchant_pattern: overridePattern,
            user_category: newCategory,
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
          // For positive amounts, also exclude from income totals by setting
          // income_type = 'credit_loan' (which isExcludedIncomeType treats as non-income).
          const positiveIds = matching.filter(t => Number(t.amount) > 0).map(t => t.id);
          const negativeIds = matching.filter(t => Number(t.amount) <= 0).map(t => t.id);

          for (let i = 0; i < positiveIds.length; i += 50) {
            const batch = positiveIds.slice(i, i + 50);
            const { count } = await admin.from('bank_transactions')
              .update({ user_category: newCategory, income_type: 'credit_loan' })
              .in('id', batch);
            if (count) updated += count;
          }
          for (let i = 0; i < negativeIds.length; i += 50) {
            const batch = negativeIds.slice(i, i + 50);
            const { count } = await admin.from('bank_transactions')
              .update({ user_category: newCategory })
              .in('id', batch);
            if (count) updated += count;
          }
        }
      }

      // 3. Teach the learning engine
      await learnFromCorrection({
        rawName: merchantPattern,
        category: newCategory,
        userId: user.id,
      }).catch((e) => console.error('Learn error (non-fatal):', e.message));

      return NextResponse.json({
        success: true,
        updated,
        merchant: merchantPattern,
        category: newCategory,
        message: `Recategorised ${updated} transaction${updated !== 1 ? 's' : ''} to "${newCategory}"`,
      });
    }

    // Single transaction override
    if (transactionId) {
      // Need metadata for learning engine and to decide whether to exclude from income
      const { data: txnData } = await admin.from('bank_transactions')
        .select('amount, description, merchant_name')
        .eq('id', transactionId)
        .single();

      const txnPatch: Record<string, any> = { user_category: newCategory };
      // For positive-amount transactions, also exclude from income by flagging credit_loan
      if (txnData && Number(txnData.amount) > 0 && newCategory !== 'income') {
        txnPatch.income_type = 'credit_loan';
      }

      await admin.from('bank_transactions')
        .update(txnPatch)
        .eq('id', transactionId)
        .eq('user_id', user.id);

      try {
        await admin.from('money_hub_category_overrides').insert({
          user_id: user.id,
          transaction_id: transactionId,
          user_category: newCategory,
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
      }

      return NextResponse.json({ success: true, updated: 1, transactionId, category: newCategory });
    }

    return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
  } catch (err: any) {
    console.error('Recategorise error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
