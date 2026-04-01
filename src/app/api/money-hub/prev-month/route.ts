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
    const now = new Date();

    // Previous month boundaries
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

    // Two months ago boundaries (for comparison)
    const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
    const twoMonthsAgoEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59).toISOString();

    // Fetch previous month transactions
    const { data: prevTxns } = await admin
      .from('bank_transactions')
      .select('amount, user_category, description, category, merchant_name, income_type')
      .eq('user_id', user.id)
      .gte('timestamp', prevMonthStart)
      .lte('timestamp', prevMonthEnd);

    // Fetch two months ago transactions
    const { data: twoMonthsAgoTxns } = await admin
      .from('bank_transactions')
      .select('amount, user_category')
      .eq('user_id', user.id)
      .gte('timestamp', twoMonthsAgoStart)
      .lte('timestamp', twoMonthsAgoEnd);

    const txns = prevTxns || [];

    // Filter out transfers
    const isXfer = (t: any) => {
      const desc = (t.description || '').toLowerCase();
      const cat = (t.category || '').toUpperCase();
      if (cat === 'TRANSFER') return true;
      if (desc.includes('personal transfer') || desc.includes('from a/c') || desc.includes('via mobile xfer')) return true;
      if (t.income_type === 'transfer') return true;
      return false;
    };

    // Calculate totals
    const totalIncome = txns
      .filter(t => parseFloat(String(t.amount)) > 0 && !isXfer(t))
      .reduce((s, t) => s + parseFloat(String(t.amount)), 0);

    const isTransferSpend = (t: any) => {
      const cat = (t.category || '').toUpperCase();
      const desc = (t.description || '').toLowerCase();
      if (cat === 'TRANSFER') return true;
      if (desc.includes('personal transfer') || desc.includes('to a/c ') || desc.includes('via mobile xfer')) return true;
      return false;
    };

    const totalSpent = txns
      .filter(t => parseFloat(String(t.amount)) < 0 && !isTransferSpend(t))
      .reduce((s, t) => s + Math.abs(parseFloat(String(t.amount))), 0);

    const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpent) / totalIncome) * 100 : 0;
    const txnCount = txns.length;

    // Category breakdown for spending
    const categoryTotals: Record<string, number> = {};
    for (const t of txns.filter(t => parseFloat(String(t.amount)) < 0 && !isTransferSpend(t))) {
      const cat = t.user_category || 'other';
      const amt = Math.abs(parseFloat(String(t.amount)));
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    }

    const categories = Object.entries(categoryTotals)
      .map(([category, total]) => ({ category, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    // Two months ago comparison
    const twoMonthsAgo = twoMonthsAgoTxns || [];
    const prevPrevSpent = twoMonthsAgo
      .filter(t => parseFloat(String(t.amount)) < 0)
      .reduce((s, t) => s + Math.abs(parseFloat(String(t.amount))), 0);

    const spendChange = prevPrevSpent > 0
      ? ((totalSpent - prevPrevSpent) / prevPrevSpent) * 100
      : null;

    // Previous month name
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const monthName = prevDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    return NextResponse.json({
      monthName,
      totalIncome: parseFloat(totalIncome.toFixed(2)),
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      savingsRate: parseFloat(savingsRate.toFixed(1)),
      txnCount,
      categories,
      spendChange: spendChange !== null ? parseFloat(spendChange.toFixed(1)) : null,
    });
  } catch (err: any) {
    console.error('Previous month error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
