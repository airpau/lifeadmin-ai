import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { loadLearnedRules, categoriseWithLearningSync as categorise } from '@/lib/learning-engine';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function isTransfer(desc: string, bankCat: string): boolean {
  const cat = bankCat.toUpperCase();
  const d = desc.toLowerCase();
  if (cat === 'TRANSFER') return true;
  if (d.includes('personal transfer') || d.includes('to a/c ') || d.includes('via mobile xfer')) return true;
  if (d.includes('barclaycard') || d.includes('mbna') || d.includes('halifax credit') || d.includes('hsbc bank visa')) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const incomeType = searchParams.get('income_type');
  const months = parseInt(searchParams.get('months') || '1');
  const selectedMonth = searchParams.get('month'); // e.g. "2026-02"

  const admin = getAdmin();

  // Calculate date range — respect selected month if provided
  let since: Date;
  let until: Date | null = null;
  if (selectedMonth) {
    const [y, m] = selectedMonth.split('-').map(Number);
    since = new Date(y, m - 1, 1);
    until = new Date(y, m, 0, 23, 59, 59); // last day of month
  } else {
    since = new Date();
    since.setMonth(since.getMonth() - months);
  }

  let query = admin.from('bank_transactions')
    .select('id, amount, description, category, timestamp, merchant_name, user_category, income_type')
    .eq('user_id', user.id)
    .gte('timestamp', since.toISOString())
    .order('timestamp', { ascending: false })
    .limit(500);

  if (until) {
    query = query.lte('timestamp', until.toISOString());
  }

  const [{ data: txns }, { data: overrideRows }] = await Promise.all([
    query,
    admin.from('money_hub_category_overrides')
      .select('merchant_pattern, transaction_id')
      .eq('user_id', user.id),
  ]);

  // Load learned rules for learning-aware categorisation
  await loadLearnedRules();

  // Generic auto-assigned categories that can be overridden by runtime categorisation.
  // Allows mortgage transactions stored as 'bills' and groceries stored as 'shopping'
  // to be correctly re-categorised for drill-down without requiring a full re-sync.
  // Exception: if the user explicitly recategorised the transaction, respect their choice.
  const SOFT_CATEGORIES = new Set(['bills', 'shopping', 'other']);

  const txnOverrideIds = new Set(
    (overrideRows || []).filter(o => o.transaction_id).map(o => o.transaction_id as string)
  );
  const merchantOverridePatterns = (overrideRows || [])
    .filter(o => !o.transaction_id && o.merchant_pattern !== 'txn_specific')
    .map(o => (o.merchant_pattern as string).toLowerCase());

  function isUserOverride(t: { id: string; merchant_name?: string; description?: string }): boolean {
    if (txnOverrideIds.has(t.id)) return true;
    const merchantLower = (t.merchant_name || '').toLowerCase();
    const descLower = (t.description || '').toLowerCase();
    return merchantOverridePatterns.some(p => p.length > 2 && (merchantLower.includes(p) || descLower.includes(p)));
  }

  let filtered = (txns || []).map(t => ({
    ...t,
    spending_category: (() => {
      const rawCat = t.user_category || '';
      if (rawCat && (!SOFT_CATEGORIES.has(rawCat) || isUserOverride(t))) return rawCat;
      return categorise(t.description || '', t.category || '', parseFloat(t.amount)) || rawCat || 'other';
    })(),
    amount: parseFloat(t.amount),
  }));

  // Income drill-down mode
  if (incomeType) {
    // Case-insensitive match, treat null/empty/unknown/uncategorised as "other"
    const mergeAsOther = ['other', 'unknown', 'uncategorised', ''];
    filtered = filtered.filter(t => {
      if (t.amount <= 0) return false;
      const type = (t.income_type || 'other').toLowerCase();
      const target = (incomeType || 'other').toLowerCase();
      if (target === 'other') return mergeAsOther.includes(type);
      return type === target;
    });

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
        merchant: t.merchant_name,
        amount: t.amount,
        category: t.income_type || 'other',
        date: t.timestamp?.substring(0, 10),
      })),
      merchants: sources,
      totalTransactions: filtered.length,
      totalSpent: parseFloat(filtered.reduce((s, t) => s + t.amount, 0).toFixed(2)),
    });
  }

  // Spending drill-down — filter out transfers (matching main route logic)
  filtered = filtered.filter(t => !isTransfer(t.description || '', t.category || ''));

  if (category) {
    filtered = filtered.filter(t => t.spending_category === category);
  }

  // Only include debits — credits (refunds, payouts) must never appear in spending
  filtered = filtered.filter(t => t.amount < 0);

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
      merchant: t.merchant_name,
      amount: t.amount,
      category: t.spending_category,
      date: t.timestamp?.substring(0, 10),
    })),
    merchants,
    totalTransactions: filtered.length,
    totalSpent: parseFloat(filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2)),
  });
}
