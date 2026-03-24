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

    const { data: profile } = await admin.from('profiles').select('subscription_tier').eq('id', user.id).single();
    const tier = profile?.subscription_tier || 'free';
    const isPaid = tier === 'essential' || tier === 'pro';
    const isPro = tier === 'pro';

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString();

    // Parallel data fetching
    const [
      transactions, bankConns, subscriptions, budgets,
      assets, liabilities, goals, alerts, tasks,
    ] = await Promise.all([
      admin.from('bank_transactions').select('amount, description, category, timestamp, merchant_name')
        .eq('user_id', user.id).gte('timestamp', sixMonthsAgo).order('timestamp', { ascending: false }),
      admin.from('bank_connections').select('id, bank_name, status, last_synced_at').eq('user_id', user.id),
      admin.from('subscriptions').select('*').eq('user_id', user.id).is('dismissed_at', null),
      admin.from('money_hub_budgets').select('*').eq('user_id', user.id),
      admin.from('money_hub_assets').select('*').eq('user_id', user.id),
      admin.from('money_hub_liabilities').select('*').eq('user_id', user.id),
      admin.from('money_hub_savings_goals').select('*').eq('user_id', user.id),
      admin.from('money_hub_alerts').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(20),
      admin.from('tasks').select('id, title, type, status, provider_name, created_at')
        .eq('user_id', user.id).eq('type', 'opportunity').eq('status', 'pending_review').limit(10),
    ]);

    const txns = transactions.data || [];
    const thisMonthTxns = txns.filter(t => t.timestamp >= startOfMonth);

    // Income vs outgoings
    const monthlyIncome = thisMonthTxns.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
    const monthlyOutgoings = thisMonthTxns.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

    // Category breakdown
    const CATEGORY_MAP: Record<string, string> = {
      PURCHASE: 'shopping', DEBIT: 'shopping', DIRECT_DEBIT: 'bills',
      STANDING_ORDER: 'bills', TRANSFER: 'transfers', ATM: 'cash',
      CREDIT: 'income', FEE: 'fees',
    };
    const DESC_CATS: Array<{ keywords: string[]; category: string }> = [
      { keywords: ['mortgage', 'lendinvest', 'skipton b.s'], category: 'mortgage' },
      { keywords: ['natwest loan', 'santander loans', 'novuna', 'ca auto finance', 'tesco bank'], category: 'loans' },
      { keywords: ['council', 'winchester city'], category: 'council_tax' },
      { keywords: ['british gas', 'eon', 'octopus', 'ovo', 'edf', 'scottish power'], category: 'energy' },
      { keywords: ['thames water', 'severn trent'], category: 'water' },
      { keywords: ['sky broadband', 'virgin media', 'bt broadband', 'communityfibre', 'vodafone broad'], category: 'broadband' },
      { keywords: ['vodafone', 'ee ', 'three', 'o2 ', 'giffgaff'], category: 'mobile' },
      { keywords: ['netflix', 'spotify', 'disney', 'amazon prime', 'apple', 'youtube'], category: 'streaming' },
      { keywords: ['gym', 'puregym', 'david lloyd', 'whoop', 'peloton'], category: 'fitness' },
      { keywords: ['tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'morrisons', 'waitrose', 'ocado'], category: 'groceries' },
      { keywords: ['deliveroo', 'just eat', 'uber eats', 'mcdonald', 'starbucks', 'costa', 'pret'], category: 'eating_out' },
      { keywords: ['petrol', 'shell ', 'bp ', 'esso', 'fuel'], category: 'fuel' },
      { keywords: ['insurance', 'admiral', 'aviva', 'direct line'], category: 'insurance' },
      { keywords: ['dvla', 'trainline', 'tfl', 'uber', 'bolt', 'parking'], category: 'transport' },
      { keywords: ['hmrc'], category: 'tax' },
      { keywords: ['amazon', 'ebay', 'asos', 'argos', 'currys'], category: 'shopping' },
    ];

    function categorise(desc: string, bankCat: string): string {
      const d = desc.toLowerCase();
      for (const { keywords, category } of DESC_CATS) {
        if (keywords.some(kw => d.includes(kw))) return category;
      }
      return CATEGORY_MAP[bankCat] || 'other';
    }

    // Filter out transfers for spending analysis
    const isTransfer = (t: any) => {
      const cat = (t.category || '').toUpperCase();
      const desc = (t.description || '').toLowerCase();
      if (cat === 'TRANSFER') return true;
      if (desc.includes('personal transfer') || desc.includes('to a/c ') || desc.includes('via mobile xfer')) return true;
      if (desc.includes('barclaycard') || desc.includes('mbna') || desc.includes('halifax credit') || desc.includes('hsbc bank visa')) return true;
      return false;
    };

    const spendingTxns = thisMonthTxns.filter(t => parseFloat(t.amount) < 0 && !isTransfer(t));

    const categoryTotals: Record<string, number> = {};
    const merchantTotals: Record<string, number> = {};
    for (const t of spendingTxns) {
      const cat = categorise(t.description || '', t.category || '');
      const amt = Math.abs(parseFloat(t.amount));
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      const merchant = t.merchant_name || (t.description || '').substring(0, 30);
      merchantTotals[merchant] = (merchantTotals[merchant] || 0) + amt;
    }

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([cat, total]) => ({ category: cat, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    const topMerchants = Object.entries(merchantTotals)
      .map(([name, total]) => ({ merchant: name, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Monthly trends (last 6 months)
    const monthlyTrends: Array<{ month: string; income: number; outgoings: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthTxns = txns.filter(t => t.timestamp.startsWith(monthStr));
      const inc = monthTxns.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
      const out = monthTxns.filter(t => parseFloat(t.amount) < 0 && !isTransfer(t)).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
      monthlyTrends.push({ month: monthStr, income: parseFloat(inc.toFixed(2)), outgoings: parseFloat(out.toFixed(2)) });
    }

    // Net worth
    const bankBalances = 0; // TrueLayer balance would come from a separate API call
    const totalAssets = (assets.data || []).reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0) + bankBalances;
    const totalLiabilities = (liabilities.data || []).reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);
    const netWorth = totalAssets - totalLiabilities;

    // Subscription totals
    const activeSubs = (subscriptions.data || []).filter(s => s.status === 'active');
    const monthlySubCost = activeSubs.reduce((s, sub) => {
      const amt = parseFloat(String(sub.amount)) || 0;
      if (sub.billing_cycle === 'yearly') return s + amt / 12;
      if (sub.billing_cycle === 'quarterly') return s + amt / 3;
      return s + amt;
    }, 0);

    // Contracts expiring soon
    const expiringContracts = activeSubs.filter(s => {
      if (!s.contract_end_date) return false;
      const end = new Date(s.contract_end_date);
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft <= 90;
    }).map(s => ({
      provider: s.provider_name,
      endDate: s.contract_end_date,
      daysLeft: Math.ceil((new Date(s.contract_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      monthlyCost: parseFloat(String(s.amount)),
    }));

    // Money Hub Score (0-100)
    let score = 50;
    if (monthlyIncome > monthlyOutgoings) score += 15;
    if ((budgets.data || []).length > 0) score += 10;
    if ((alerts.data || []).filter(a => a.status === 'active').length === 0) score += 10;
    if (expiringContracts.length === 0) score += 5;
    if (monthlySubCost < monthlyIncome * 0.1) score += 5;
    if ((goals.data || []).length > 0) score += 5;
    score = Math.min(100, Math.max(0, score));

    // Days through month
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const monthProgress = Math.round((dayOfMonth / daysInMonth) * 100);

    return NextResponse.json({
      tier,
      score,
      overview: {
        monthlyIncome: parseFloat(monthlyIncome.toFixed(2)),
        monthlyOutgoings: parseFloat(monthlyOutgoings.toFixed(2)),
        netPosition: parseFloat((monthlyIncome - monthlyOutgoings).toFixed(2)),
        monthProgress,
        dayOfMonth,
        daysInMonth,
      },
      accounts: bankConns.data || [],
      spending: {
        categories: isPaid ? categoryBreakdown : categoryBreakdown.slice(0, 5),
        topMerchants: isPro ? topMerchants : [],
        monthlyTrends: isPaid ? monthlyTrends : [],
        totalSpent: parseFloat(monthlyOutgoings.toFixed(2)),
      },
      subscriptions: {
        list: activeSubs,
        monthlyTotal: parseFloat(monthlySubCost.toFixed(2)),
        annualTotal: parseFloat((monthlySubCost * 12).toFixed(2)),
        count: activeSubs.length,
      },
      contracts: {
        expiring: expiringContracts,
        totalCommitted: activeSubs.reduce((s, sub) => {
          if (!sub.contract_end_date) return s;
          const months = Math.max(0, Math.ceil((new Date(sub.contract_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)));
          return s + (parseFloat(String(sub.amount)) || 0) * months;
        }, 0),
      },
      netWorth: {
        total: parseFloat(netWorth.toFixed(2)),
        assets: parseFloat(totalAssets.toFixed(2)),
        liabilities: parseFloat(totalLiabilities.toFixed(2)),
        assetsList: isPro ? (assets.data || []) : [],
        liabilitiesList: isPro ? (liabilities.data || []) : [],
      },
      budgets: isPaid ? (budgets.data || []) : [],
      goals: isPaid ? (goals.data || []).slice(0, isPro ? 100 : 3) : [],
      alerts: (alerts.data || []).slice(0, isPaid ? 20 : 3),
      opportunities: (tasks.data || []).slice(0, isPaid ? 20 : 3),
    });
  } catch (err: any) {
    console.error('Money Hub error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
