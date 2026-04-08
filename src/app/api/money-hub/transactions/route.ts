import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { loadLearnedRules } from '@/lib/learning-engine';
import { matchesIncomeTypeFilter, normalizeIncomeTypeKey } from '@/lib/income-normalise';
import {
  applyInternalTransferHeuristic,
  buildMoneyHubOverrideMaps,
  findMatchingCategoryOverride,
  getMoneyHubMonthBounds,
  normalizeSpendingCategoryKey,
  resolveMoneyHubTransaction,
} from '@/lib/money-hub-classification';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  try {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const incomeType = searchParams.get('income_type');
  const selectedMonth = searchParams.get('month'); // e.g. "2026-02"

  const admin = getAdmin();
  const { start, end } = getMoneyHubMonthBounds(selectedMonth);

  const query = admin.from('bank_transactions')
    .select('id, amount, description, category, timestamp, merchant_name, user_category, income_type, account_id')
    .eq('user_id', user.id)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: false })
    .limit(5000);

  const [{ data: txns }, { data: overrideRows }] = await Promise.all([
    query,
    admin.from('money_hub_category_overrides')
      .select('merchant_pattern, transaction_id, user_category')
      .eq('user_id', user.id),
  ]);

  await loadLearnedRules();
  const overrides = buildMoneyHubOverrideMaps(overrideRows || []);
  const internalTransfers = applyInternalTransferHeuristic(txns || []);
  
  const resolvedTransactions = (txns || []).map((txn) => {
    const overrideCategory = findMatchingCategoryOverride(
      txn,
      overrides.transactionOverrides,
      overrides.merchantOverrides,
    );
    const resolved = resolveMoneyHubTransaction(txn, overrideCategory);

    if (internalTransfers.has(txn.id)) {
      resolved.kind = 'transfer';
      resolved.spendingCategory = 'transfers';
    }

    return {
      ...txn,
      amount: parseFloat(String(txn.amount)) || 0,
      resolved,
    };
  });

  // Income drill-down mode
  if (incomeType) {
    const filtered = resolvedTransactions.filter((txn) => (
      txn.resolved.kind === 'income' &&
      matchesIncomeTypeFilter(txn.resolved.incomeType, incomeType)
    ));

    const sourceTotals: Record<string, { total: number; count: number }> = {};
    for (const t of filtered) {
      const source = t.merchant_name || (t.description || '').replace(/FP \d.*/, '').replace(/\d{6,}.*/, '').trim().substring(0, 40) || 'Unknown';
      if (!sourceTotals[source]) sourceTotals[source] = { total: 0, count: 0 };
      sourceTotals[source].total += t.amount;
      sourceTotals[source].count++;
    }

    const sources = Object.entries(sourceTotals)
      .map(([name, data]) => ({ merchant: name, total: parseFloat(data.total.toFixed(2)), count: data.count }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      transactions: filtered.slice(0, 100).map(t => ({
        id: t.id,
        description: t.description,
        merchant_name: t.merchant_name,
        amount: t.amount,
        category: normalizeIncomeTypeKey(t.resolved.incomeType),
        timestamp: t.timestamp,
      })),
      merchants: sources,
      totalTransactions: filtered.length,
      totalSpent: parseFloat(filtered.reduce((s, t) => s + t.amount, 0).toFixed(2)),
    });
  }

  const targetCategory = normalizeSpendingCategoryKey(category);
  const filtered = resolvedTransactions.filter((txn) => {
    if (txn.resolved.kind !== 'spending' || !txn.resolved.spendingCategory) return false;
    if (!targetCategory) return true;
    return normalizeSpendingCategoryKey(txn.resolved.spendingCategory) === targetCategory;
  });

  const merchantTotals: Record<string, { total: number; count: number }> = {};
  for (const t of filtered) {
    if (t.amount >= 0) continue;
    const merchant = normaliseMerchantName(t.merchant_name || t.description || '');
    if (!merchantTotals[merchant]) merchantTotals[merchant] = { total: 0, count: 0 };
    merchantTotals[merchant].total += Math.abs(t.amount);
    merchantTotals[merchant].count++;
  }

  const merchants = Object.entries(merchantTotals)
    .map(([name, data]) => ({ merchant: name, total: parseFloat(data.total.toFixed(2)), count: data.count }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    transactions: filtered.slice(0, 100).map(t => ({
      id: t.id,
      description: t.description,
      merchant_name: t.merchant_name,
      amount: t.amount,
      category: normalizeSpendingCategoryKey(t.resolved.spendingCategory),
      timestamp: t.timestamp,
    })),
    merchants,
    totalTransactions: filtered.length,
    totalSpent: parseFloat(filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2)),
  });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch transactions' }, { status: 500 });
  }
}
