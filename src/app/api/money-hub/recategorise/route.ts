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
    // Save merchant override so all future transactions from this merchant use the new category
    await admin.from('money_hub_category_overrides').upsert({
      user_id: user.id,
      merchant_pattern: merchantPattern.toLowerCase().trim(),
      user_category: newCategory,
    }, { onConflict: 'user_id,merchant_pattern' }).select();

    // Update all existing transactions from this merchant
    const { data: matching } = await admin.from('bank_transactions')
      .select('id, description, merchant_name')
      .eq('user_id', user.id);

    const pattern = merchantPattern.toLowerCase().trim();
    let updated = 0;
    for (const txn of matching || []) {
      const merchant = (txn.merchant_name || txn.description || '').toLowerCase();
      if (merchant.includes(pattern)) {
        await admin.from('bank_transactions').update({ user_category: newCategory }).eq('id', txn.id);
        updated++;
      }
    }

    return NextResponse.json({ updated, merchant: merchantPattern, category: newCategory });
  }

  if (transactionId) {
    // Update single transaction
    await admin.from('bank_transactions').update({ user_category: newCategory })
      .eq('id', transactionId).eq('user_id', user.id);

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
