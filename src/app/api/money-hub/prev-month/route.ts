import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { loadLearnedRules } from '@/lib/learning-engine';
import {
  buildMoneyHubOverrideMaps,
  findMatchingCategoryOverride,
  normalizeSpendingCategoryKey,
  resolveMoneyHubTransaction,
} from '@/lib/money-hub-classification';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function summariseTransactions(
  txns: Array<{
    id?: string | null;
    amount: string | number;
    category?: string | null;
    description?: string | null;
    merchant_name?: string | null;
    user_category?: string | null;
    income_type?: string | null;
    timestamp?: string | null;
  }>,
  overrides: ReturnType<typeof buildMoneyHubOverrideMaps>,
) {
  let totalIncome = 0;
  let totalSpent = 0;
  const categoryTotals: Record<string, number> = {};

  for (const txn of txns) {
    const overrideCategory = findMatchingCategoryOverride(
      txn,
      overrides.transactionOverrides,
      overrides.merchantOverrides,
    );
    const resolved = resolveMoneyHubTransaction(txn, overrideCategory);

    if (resolved.kind === 'income') {
      totalIncome += resolved.amount;
      continue;
    }

    if (resolved.kind === 'spending' && resolved.spendingCategory) {
      const amount = Math.abs(resolved.amount);
      const category = normalizeSpendingCategoryKey(resolved.spendingCategory);
      totalSpent += amount;
      categoryTotals[category] = (categoryTotals[category] || 0) + amount;
    }
  }

  return {
    totalIncome: parseFloat(totalIncome.toFixed(2)),
    totalSpent: parseFloat(totalSpent.toFixed(2)),
    categories: Object.entries(categoryTotals)
      .map(([category, total]) => ({ category, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total),
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();
    const now = new Date();

    // Previous month boundaries
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const prevMonthPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
    const prevMonthEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0, 23, 59, 59);

    // Two months ago
    const twoMonthsDate = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const twoMonthsPrefix = `${twoMonthsDate.getFullYear()}-${String(twoMonthsDate.getMonth() + 1).padStart(2, '0')}`;

    // Fetch all recent transactions in one query with limit
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
    await loadLearnedRules();

    const [{ data: allTxns }, { data: overrideRows }] = await Promise.all([
      admin
        .from('bank_transactions')
        .select('id, amount, user_category, description, category, merchant_name, income_type, timestamp')
        .eq('user_id', user.id)
        .gte('timestamp', sixMonthsAgo)
        .limit(10000),
      admin
        .from('money_hub_category_overrides')
        .select('merchant_pattern, transaction_id, user_category')
        .eq('user_id', user.id),
    ]);

    const all = allTxns || [];
    const overrides = buildMoneyHubOverrideMaps(overrideRows || []);

    // Filter by month using startsWith (same approach as main API)
    const prevTxns = all.filter(t => {
      if (t.timestamp?.startsWith(prevMonthPrefix)) return true;
      const ts = new Date(t.timestamp).getTime();
      return ts >= prevMonthStart.getTime() && ts <= prevMonthEnd.getTime();
    });

    const twoMonthsAgoTxns = all.filter(t => t.timestamp?.startsWith(twoMonthsPrefix));

    const prevSummary = summariseTransactions(prevTxns, overrides);
    const twoMonthsSummary = summariseTransactions(twoMonthsAgoTxns, overrides);
    const savingsRate = prevSummary.totalIncome > 0 ? ((prevSummary.totalIncome - prevSummary.totalSpent) / prevSummary.totalIncome) * 100 : 0;
    const txnCount = prevTxns.length;

    // Two months ago comparison
    const spendChange = twoMonthsSummary.totalSpent > 0
      ? ((prevSummary.totalSpent - twoMonthsSummary.totalSpent) / twoMonthsSummary.totalSpent) * 100
      : null;

    const monthName = prevDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    return NextResponse.json({
      monthName,
      totalIncome: prevSummary.totalIncome,
      totalSpent: prevSummary.totalSpent,
      savingsRate: parseFloat(savingsRate.toFixed(1)),
      txnCount,
      categories: prevSummary.categories,
      spendChange: spendChange !== null ? parseFloat(spendChange.toFixed(1)) : null,
    });
  } catch (err: any) {
    console.error('Previous month error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
