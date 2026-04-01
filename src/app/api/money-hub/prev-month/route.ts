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
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const prevMonthPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
    const prevMonthEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0, 23, 59, 59);

    // Two months ago
    const twoMonthsDate = new Date(now.getFullYear(), now.getMonth() - 2, 15);
    const twoMonthsPrefix = `${twoMonthsDate.getFullYear()}-${String(twoMonthsDate.getMonth() + 1).padStart(2, '0')}`;

    // Fetch all recent transactions in one query with limit
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();
    const { data: allTxns } = await admin
      .from('bank_transactions')
      .select('amount, user_category, description, category, merchant_name, income_type, timestamp')
      .eq('user_id', user.id)
      .gte('timestamp', sixMonthsAgo)
      .limit(10000);

    const all = allTxns || [];

    // Filter by month using startsWith (same approach as main API)
    const prevTxns = all.filter(t => {
      if (t.timestamp?.startsWith(prevMonthPrefix)) return true;
      const ts = new Date(t.timestamp).getTime();
      return ts >= prevMonthStart.getTime() && ts <= prevMonthEnd.getTime();
    });

    const twoMonthsAgoTxns = all.filter(t => t.timestamp?.startsWith(twoMonthsPrefix));

    // Transfer detection — consistent with main API
    const isXfer = (t: any) => {
      const desc = (t.description || '').toLowerCase();
      const cat = (t.category || '').toUpperCase();
      if (cat === 'TRANSFER') return true;
      if (desc.includes('personal transfer') || desc.includes('from a/c') ||
          desc.includes('via mobile xfer') || desc.includes('internal') ||
          desc.includes('between accounts') || desc.includes('via online - pymt')) return true;
      if (t.income_type === 'transfer') return true;
      return false;
    };

    const isTransferSpend = (t: any) => {
      const cat = (t.category || '').toUpperCase();
      const desc = (t.description || '').toLowerCase();
      if (cat === 'TRANSFER') return true;
      if (desc.includes('personal transfer') || desc.includes('to a/c ') ||
          desc.includes('via mobile xfer') || desc.includes('via online - pymt')) return true;
      if (desc.includes('barclaycard') || desc.includes('mbna') ||
          desc.includes('halifax credit') || desc.includes('hsbc bank visa')) return true;
      return false;
    };

    // Calculate totals
    const totalIncome = prevTxns
      .filter(t => parseFloat(String(t.amount)) > 0 && !isXfer(t))
      .reduce((s, t) => s + parseFloat(String(t.amount)), 0);

    const totalSpent = prevTxns
      .filter(t => parseFloat(String(t.amount)) < 0 && !isTransferSpend(t))
      .reduce((s, t) => s + Math.abs(parseFloat(String(t.amount))), 0);

    const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpent) / totalIncome) * 100 : 0;
    const txnCount = prevTxns.length;

    // Category breakdown — use learning-aware categorisation (same as main API)
    const { loadLearnedRules, categoriseWithLearningSync: categorise } = await import('@/lib/learning-engine');
    await loadLearnedRules();

    const categoryTotals: Record<string, number> = {};
    for (const t of prevTxns.filter(t => parseFloat(String(t.amount)) < 0 && !isTransferSpend(t))) {
      // Use user override first, then runtime categoriser
      const merchantName = t.merchant_name || t.description || '';
      const cat = t.user_category || categorise(merchantName, t.description) || 'other';
      const amt = Math.abs(parseFloat(String(t.amount)));
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    }

    const categories = Object.entries(categoryTotals)
      .map(([category, total]) => ({ category, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    // Two months ago comparison
    const prevPrevSpent = twoMonthsAgoTxns
      .filter(t => parseFloat(String(t.amount)) < 0 && !isTransferSpend(t))
      .reduce((s, t) => s + Math.abs(parseFloat(String(t.amount))), 0);

    const spendChange = prevPrevSpent > 0
      ? ((totalSpent - prevPrevSpent) / prevPrevSpent) * 100
      : null;

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
