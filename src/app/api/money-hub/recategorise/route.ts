import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { learnFromCorrection } from '@/lib/learning-engine';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { transactionId, merchantPattern, newCategory, newIncomeType, applyToAll } = body;

  // Must have either a category change or income type change
  if (!newCategory && !newIncomeType) {
    return NextResponse.json({ error: 'newCategory or newIncomeType required' }, { status: 400 });
  }

  const admin = getAdmin();

  // ─── Income type recategorisation ──────────────────────────────────────────
  if (newIncomeType) {
    if (transactionId) {
      await admin.from('bank_transactions')
        .update({ income_type: newIncomeType })
        .eq('id', transactionId)
        .eq('user_id', user.id);
      return NextResponse.json({ updated: 1, transactionId, incomeType: newIncomeType });
    }

    if (merchantPattern) {
      const pattern = merchantPattern.toLowerCase().trim();
      const { data: matching } = await admin.from('bank_transactions')
        .select('id, description, merchant_name, amount')
        .eq('user_id', user.id);

      let updated = 0;
      for (const txn of matching || []) {
        if (parseFloat(txn.amount) <= 0) continue; // Only update income transactions
        const merchantName = (txn.merchant_name || '').toLowerCase();
        const desc = (txn.description || '').toLowerCase();
        if (merchantName.includes(pattern) || desc.includes(pattern)) {
          await admin.from('bank_transactions')
            .update({ income_type: newIncomeType })
            .eq('id', txn.id);
          updated++;
        }
      }
      // Feed income type correction into learning engine
      await learnFromCorrection({
        rawName: merchantPattern,
        incomeType: newIncomeType,
        userId: user.id,
      });

      return NextResponse.json({ updated, merchant: merchantPattern, incomeType: newIncomeType });
    }
    return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
  }

  // ─── Spending category recategorisation ────────────────────────────────────

  // Strip date prefixes to get core merchant name for smarter matching
  function getCorePattern(raw: string): string {
    return raw
      .replace(/^\d{4}\s+\d{2}[a-z]{3}\d{2}\s+/i, '') // strip "9384 06MAR26 " prefix
      .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '') // strip city/country suffix
      .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '') // strip "FP 01/02/26 ..." suffix
      .trim();
  }

  if (applyToAll && merchantPattern) {
    const pattern = merchantPattern.toLowerCase().trim();
    const corePattern = getCorePattern(pattern);

    // Save override for future runtime categorisation
    await admin.from('money_hub_category_overrides').upsert({
      user_id: user.id,
      merchant_pattern: corePattern || pattern,
      user_category: newCategory,
    }, { onConflict: 'user_id,merchant_pattern' }).select();

    // Update all existing transactions from this merchant
    const { data: matching } = await admin.from('bank_transactions')
      .select('id, description, merchant_name')
      .eq('user_id', user.id);

    let updated = 0;
    for (const txn of matching || []) {
      const merchantName = (txn.merchant_name || '').toLowerCase();
      const desc = (txn.description || '').toLowerCase();
      const txnCore = getCorePattern(desc);

      if (
        merchantName === pattern ||
        merchantName.includes(pattern) ||
        desc.includes(pattern) ||
        // Core pattern matching (strips dates)
        (corePattern.length > 3 && (txnCore.includes(corePattern) || txnCore.startsWith(corePattern)))
      ) {
        await admin.from('bank_transactions')
          .update({ user_category: newCategory })
          .eq('id', txn.id);
        updated++;
      }
    }

    // Feed correction into the self-learning engine
    await learnFromCorrection({
      rawName: merchantPattern,
      category: newCategory,
      userId: user.id,
    });

    return NextResponse.json({ updated, merchant: merchantPattern, category: newCategory });
  }

  if (transactionId) {
    // Update single transaction
    const { error } = await admin.from('bank_transactions')
      .update({ user_category: newCategory })
      .eq('id', transactionId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
    }

    // Also save as override for this specific transaction
    await admin.from('money_hub_category_overrides').insert({
      user_id: user.id,
      merchant_pattern: 'txn_specific',
      user_category: newCategory,
      transaction_id: transactionId,
    });

    return NextResponse.json({ updated: 1, transactionId, category: newCategory });
  }

  return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
}
