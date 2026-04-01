import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();

    // Fetch recurring transactions from last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: recurringTxns } = await admin
      .from('bank_transactions')
      .select('merchant_name, amount, user_category, description')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', sixtyDaysAgo.toISOString())
      .order('merchant_name')
      .order('timestamp', { ascending: false });

    // Deduplicate by merchant - keep most recent
    const merchantMap = new Map<string, { merchant_name: string; expected_amount: number; user_category: string }>();
    for (const txn of recurringTxns || []) {
      const merchant = (txn.merchant_name || txn.description || '').substring(0, 40).trim();
      if (!merchant) continue;
      if (!merchantMap.has(merchant)) {
        merchantMap.set(merchant, {
          merchant_name: merchant,
          expected_amount: Math.abs(parseFloat(String(txn.amount))),
          user_category: txn.user_category || 'other',
        });
      }
    }

    // Fetch active subscriptions
    const { data: subscriptions } = await admin
      .from('subscriptions')
      .select('name, amount, billing_cycle, next_billing_date, category')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('amount', { ascending: false });

    // Combine and deduplicate
    const allBills: Array<{
      name: string;
      expected_amount: number;
      category: string;
      source: 'recurring' | 'subscription';
    }> = [];

    // Add subscription-based predictions first
    for (const sub of subscriptions || []) {
      const amount = parseFloat(String(sub.amount)) || 0;
      if (amount <= 0) continue;
      allBills.push({
        name: sub.name,
        expected_amount: sub.billing_cycle === 'yearly' ? amount / 12 : sub.billing_cycle === 'quarterly' ? amount / 3 : amount,
        category: sub.category || 'other',
        source: 'subscription',
      });
    }

    // Add recurring transaction predictions that aren't already covered by subscriptions
    const subNames = new Set(allBills.map(b => b.name.toLowerCase()));
    for (const [, bill] of merchantMap) {
      const cleanName = bill.merchant_name.replace(/FP \d.*/, '').replace(/\d{6,}.*/, '').trim();
      if (subNames.has(cleanName.toLowerCase())) continue;
      // Only include bills > £5 to filter noise
      if (bill.expected_amount < 5) continue;
      allBills.push({
        name: cleanName,
        expected_amount: bill.expected_amount,
        category: bill.user_category,
        source: 'recurring',
      });
    }

    // Sort by amount descending
    allBills.sort((a, b) => b.expected_amount - a.expected_amount);

    // Get current month transactions to mark which bills have already been paid
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: currentMonthTxns } = await admin
      .from('bank_transactions')
      .select('merchant_name, description, amount')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth);

    const paidMerchants = new Set(
      (currentMonthTxns || []).map(t =>
        (t.merchant_name || t.description || '').substring(0, 40).trim().toLowerCase()
      )
    );

    const billsWithStatus = allBills.map(bill => ({
      ...bill,
      paid: paidMerchants.has(bill.name.toLowerCase()),
    }));

    const totalExpected = allBills.reduce((s, b) => s + b.expected_amount, 0);

    return NextResponse.json({
      bills: billsWithStatus,
      totalExpected: parseFloat(totalExpected.toFixed(2)),
    });
  } catch (err: any) {
    console.error('Expected bills error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
