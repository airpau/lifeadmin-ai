import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

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

    // Save merchant override for future transactions
    await admin.from('money_hub_category_overrides').upsert({
      user_id: user.id,
      merchant_pattern: pattern,
      user_category: newCategory,
    }, { onConflict: 'user_id,merchant_pattern' }).select();

    // Update all existing transactions from this merchant
    // Match by merchant_name OR description containing the pattern
    const { data: matching } = await admin.from('bank_transactions')
      .select('id, description, merchant_name')
      .eq('user_id', user.id);

    let updated = 0;
    for (const txn of matching || []) {
      const merchantName = (txn.merchant_name || '').toLowerCase();
      const desc = (txn.description || '').toLowerCase();
      // Match if the merchant name or description matches the pattern
      // Also match if the truncated form (first 30 chars) matches - this is how the UI groups merchants
      const descTruncated = desc.substring(0, 30).trim();

      if (
        merchantName === pattern ||
        merchantName.includes(pattern) ||
        desc.includes(pattern) ||
        descTruncated === pattern
      ) {
        await admin.from('bank_transactions')
          .update({ user_category: newCategory })
          .eq('id', txn.id);
        updated++;
      }
    }

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
      return NextResponse.json({ updated, merchant: merchantPattern, incomeType: body.newIncomeType });
    }
  }

  return NextResponse.json({ error: 'transactionId or merchantPattern required' }, { status: 400 });
}
