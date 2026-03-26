import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { categoriseTransaction, normaliseMerchantName } from '@/lib/merchant-normalise';

export const runtime = 'nodejs';

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  mortgage: { label: 'Mortgage', color: '#8b5cf6', icon: '🏠' },
  loans: { label: 'Loans & Finance', color: '#ef4444', icon: '🏦' },
  credit: { label: 'Credit Cards', color: '#f43f5e', icon: '💳' },
  council_tax: { label: 'Council Tax', color: '#6366f1', icon: '🏛️' },
  energy: { label: 'Energy', color: '#f59e0b', icon: '⚡' },
  water: { label: 'Water', color: '#06b6d4', icon: '💧' },
  broadband: { label: 'Broadband', color: '#3b82f6', icon: '📡' },
  mobile: { label: 'Mobile', color: '#8b5cf6', icon: '📱' },
  streaming: { label: 'Streaming', color: '#ec4899', icon: '📺' },
  fitness: { label: 'Fitness', color: '#10b981', icon: '💪' },
  groceries: { label: 'Groceries', color: '#22c55e', icon: '🛒' },
  eating_out: { label: 'Eating Out', color: '#f97316', icon: '🍽️' },
  fuel: { label: 'Fuel', color: '#64748b', icon: '⛽' },
  shopping: { label: 'Shopping', color: '#a855f7', icon: '🛍️' },
  insurance: { label: 'Insurance', color: '#14b8a6', icon: '🛡️' },
  transport: { label: 'Transport', color: '#0ea5e9', icon: '🚗' },
  gambling: { label: 'Gambling', color: '#dc2626', icon: '🎰' },
  childcare: { label: 'Childcare', color: '#f472b6', icon: '👶' },
  software: { label: 'Software', color: '#7c3aed', icon: '💻' },
  tax: { label: 'Tax (HMRC)', color: '#dc2626', icon: '🏛️' },
  professional: { label: 'Professional Services', color: '#7c3aed', icon: '👔' },
  bills: { label: 'Bills', color: '#64748b', icon: '📄' },
  transfers: { label: 'Transfers', color: '#475569', icon: '↔️' },
  cash: { label: 'Cash', color: '#78716c', icon: '💵' },
  fees: { label: 'Fees', color: '#991b1b', icon: '⚠️' },
  income: { label: 'Income', color: '#16a34a', icon: '💰' },
  other: { label: 'Other', color: '#475569', icon: '📋' },
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch last 6 months of transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: transactions } = await supabase
      .from('bank_transactions')
      .select('amount, description, category, timestamp')
      .eq('user_id', user.id)
      .gte('timestamp', sixMonthsAgo.toISOString())
      .order('timestamp', { ascending: false });

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ hasData: false });
    }

    // Categorise all transactions
    const categorised = transactions.map(tx => ({
      ...tx,
      spending_category: categoriseTransaction(tx.description || '', tx.category || ''),
      amount: parseFloat(String(tx.amount)),
    }));

    // Filter out internal transfers and credit card payments (not real spending)
    const isTransfer = (tx: typeof categorised[0]) => {
      const cat = tx.category?.toUpperCase() || '';
      const desc = (tx.description || '').toLowerCase();

      // All TRANSFER category transactions are internal movements
      if (cat === 'TRANSFER') return true;

      // Credit card payments (paying off balance, not actual purchases)
      if (desc.includes('barclaycard') && !desc.includes('fee')) return true;
      if (desc.includes('mbna') && desc.includes('tpp')) return true;
      if (desc.includes('halifax credit')) return true;
      if (desc.includes('hsbc bank visa')) return true;
      if (desc.includes('virgin money') && desc.includes('tpp')) return true;
      if (desc.includes('santander') && desc.includes('tpp')) return true;
      if (desc.includes('securepay.bos')) return true;

      // Bank-to-bank transfers
      if (desc.includes('revolut') && !desc.includes('deliveroo') && !desc.includes('uber')) return true;
      if (desc.includes('monzo') || desc.includes('starling')) return true;
      if (desc.includes('savings') || desc.includes('isa ')) return true;
      if (desc.includes('via mobile') && desc.includes('pymt')) return true;
      if (desc.includes('via mobile xfer')) return true;
      if (desc.includes('personal transfer')) return true;
      if (desc.includes('to a/c ')) return true;

      return false;
    };

    // Split debits and credits, excluding internal transfers
    const debits = categorised.filter(tx => tx.amount < 0 && !isTransfer(tx));
    const credits = categorised.filter(tx => tx.amount > 0);

    // Category totals (debits only, absolute values)
    const categoryTotals: Record<string, number> = {};
    for (const tx of debits) {
      const cat = tx.spending_category;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(tx.amount);
    }

    // Monthly totals (last 6 months)
    const monthlySpend: Record<string, number> = {};
    const monthlyIncome: Record<string, number> = {};
    for (const tx of categorised) {
      const month = tx.timestamp.substring(0, 7); // YYYY-MM
      if (tx.amount < 0) {
        monthlySpend[month] = (monthlySpend[month] || 0) + Math.abs(tx.amount);
      } else {
        monthlyIncome[month] = (monthlyIncome[month] || 0) + tx.amount;
      }
    }

    // Current month vs previous month comparison
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const previousMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthSpend = monthlySpend[currentMonth] || 0;
    const previousMonthSpend = monthlySpend[previousMonth] || 0;
    const monthChange = previousMonthSpend > 0
      ? Math.round(((currentMonthSpend - previousMonthSpend) / previousMonthSpend) * 100)
      : 0;

    // Total income and spend
    const totalSpend = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const totalIncome = credits.reduce((sum, tx) => sum + tx.amount, 0);

    // Build category breakdown with labels
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([cat, total]) => ({
        category: cat,
        ...(CATEGORY_LABELS[cat] || CATEGORY_LABELS.other),
        total: parseFloat(total.toFixed(2)),
        monthly_avg: parseFloat((total / Math.max(Object.keys(monthlySpend).length, 1)).toFixed(2)),
        percentage: parseFloat(((total / totalSpend) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.total - a.total);

    // Top 10 biggest single transactions
    const biggestTransactions = debits
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 10)
      .map(tx => ({
        description: tx.description,
        amount: Math.abs(tx.amount),
        category: tx.spending_category,
        date: tx.timestamp.substring(0, 10),
      }));

    const monthCount = Math.max(Object.keys(monthlySpend).length, 1);

    // Group transactions by category for drill-down
    // Use normalised merchant names for clean display
    const categoryTransactions: Record<string, Array<{ description: string; total: number; count: number; monthly_avg: number }>> = {};
    for (const tx of debits) {
      const cat = tx.spending_category;
      if (!categoryTransactions[cat]) categoryTransactions[cat] = [];

      // Use normalised merchant name for grouping
      const key = normaliseMerchantName(tx.description || 'Unknown');

      const existing = categoryTransactions[cat].find(t => t.description === key);
      if (existing) {
        existing.total += Math.abs(tx.amount);
        existing.count += 1;
      } else {
        categoryTransactions[cat].push({ description: key, total: Math.abs(tx.amount), count: 1, monthly_avg: 0 });
      }
    }

    // Calculate monthly averages and sort
    for (const cat of Object.keys(categoryTransactions)) {
      categoryTransactions[cat] = categoryTransactions[cat]
        .map(t => ({ ...t, monthly_avg: parseFloat((t.total / monthCount).toFixed(2)), total: parseFloat(t.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15); // Top 15 per category
    }

    return NextResponse.json({
      hasData: true,
      summary: {
        total_transactions: transactions.length,
        total_spend: parseFloat(totalSpend.toFixed(2)),
        total_income: parseFloat(totalIncome.toFixed(2)),
        current_month_spend: parseFloat(currentMonthSpend.toFixed(2)),
        previous_month_spend: parseFloat(previousMonthSpend.toFixed(2)),
        month_change_percent: monthChange,
        months_analysed: monthCount,
        monthly_avg_spend: parseFloat((totalSpend / monthCount).toFixed(2)),
        monthly_avg_income: parseFloat((totalIncome / monthCount).toFixed(2)),
      },
      category_breakdown: categoryBreakdown,
      category_transactions: categoryTransactions,
      monthly_spend: Object.entries(monthlySpend)
        .map(([month, total]) => ({ month, spend: parseFloat(total.toFixed(2)), income: parseFloat((monthlyIncome[month] || 0).toFixed(2)) }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      biggest_transactions: biggestTransactions,
      category_labels: CATEGORY_LABELS,
    });
  } catch (err: any) {
    console.error('Spending API error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
