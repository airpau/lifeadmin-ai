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
  const { transactionId, merchantPattern, newCategory, applyToAll } = body;

  if (!newCategory) return NextResponse.json({ error: 'newCategory required' }, { status: 400 });

  const admin = getAdmin();

  if (applyToAll && merchantPattern) {
    const pattern = merchantPattern.toLowerCase().trim();

    // Strip date prefixes to get core merchant name for smarter matching
    // Bank descriptions often look like "9384 06MAR26 REVOLUT**3017* LONDON GB"
    // We want to match on "revolut**3017*" not the full string with dates
    const corePattern = pattern
      .replace(/^\d{4}\s+\d{2}[a-z]{3}\d{2}\s+/i, '') // strip "9384 06MAR26 " prefix
      .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '') // strip city/country suffix
      .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '') // strip "FP 01/02/26 ..." suffix
      .trim();

    // Save both the exact pattern and the core pattern as overrides
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
      const descTruncated = desc.substring(0, 30).trim();

      // Also strip date prefix from this transaction's description for comparison
      const txnCore = desc
        .replace(/^\d{4}\s+\d{2}[a-z]{3}\d{2}\s+/i, '')
        .replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '')
        .replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '')
        .trim();

      if (
        merchantName === pattern ||
        merchantName.includes(pattern) ||
        desc.includes(pattern) ||
        descTruncated === pattern ||
        // Core pattern matching (strips dates so "revolut**3017*" matches across months)
        (corePattern.length > 3 && (txnCore.includes(corePattern) || txnCore.startsWith(corePattern)))
      ) {
        await admin.from('bank_transactions')
          .update({ user_category: newCategory })
          .eq('id', txn.id);
        updated++;
      }
    }

    // Feed correction into the self-learning engine so it applies across all users
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

  // Income recategorisation
  if (body.newIncomeType && (transactionId || merchantPattern)) {
    if (transactionId) {
      await admin.from('bank_transactions')
        .update({ income_type: body.newIncomeType })
        .eq('id', transactionId)
        .eq('user_id', user.id);
      return NextResponse.json({ updated: 1, transactionId, incomeType: body.newIncomeType });
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
            .update({ income_type: body.newIncomeType })
            .eq('id', txn.id);
          updated++;
        }
      }
      // Feed income type correction into learning engine
      await learnFromCorrection({
        rawName: merchantPattern,
        incomeType: body.newIncomeType,
        userId: user.id,
      });

      return NextResponse.json({ updated, merchant: merchantPattern, incomeType: body.newIncomeType });
    }
  }

  return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
}
