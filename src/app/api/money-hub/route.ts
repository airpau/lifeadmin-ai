import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();

    const { data: profile } = await admin.from('profiles').select('subscription_tier').eq('id', user.id).single();
    const tier = profile?.subscription_tier || 'free';
    const isPaid = tier === 'essential' || tier === 'pro';
    const isPro = tier === 'pro';

    // Support viewing a specific month (e.g. ?month=2026-02)
    const url = new URL(request.url);
    const selectedMonth = url.searchParams.get('month');

    const now = new Date();
    let viewDate = now;
    if (selectedMonth) {
      const [y, m] = selectedMonth.split('-').map(Number);
      if (y && m) viewDate = new Date(y, m - 1, 15); // mid-month to avoid timezone issues
    }
    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).toISOString();
    const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const sixMonthsAgo = new Date(viewDate.getFullYear(), viewDate.getMonth() - 6, 1).toISOString();

    // Parallel data fetching
    const [
      transactions, bankConns, subscriptions, budgets,
      assets, liabilities, goals, alerts, tasks,
    ] = await Promise.all([
      admin.from('bank_transactions').select('id, amount, description, category, timestamp, merchant_name, user_category, income_type')
        .eq('user_id', user.id).gte('timestamp', sixMonthsAgo).order('timestamp', { ascending: false }).limit(10000),
      admin.from('bank_connections').select('id, bank_name, status, last_synced_at, account_ids, account_display_names').eq('user_id', user.id),
      admin.from('subscriptions').select('*').eq('user_id', user.id).is('dismissed_at', null),
      admin.from('money_hub_budgets').select('*').eq('user_id', user.id),
      admin.from('money_hub_assets').select('*').eq('user_id', user.id),
      admin.from('money_hub_liabilities').select('*').eq('user_id', user.id),
      admin.from('money_hub_savings_goals').select('*').eq('user_id', user.id),
      admin.from('money_hub_alerts').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(20),
      admin.from('tasks').select('id, title, type, status, provider_name, provider_type, disputed_amount, description, created_at')
        .eq('user_id', user.id).eq('type', 'opportunity').eq('status', 'pending_review').limit(10),
    ]);

    const txns = transactions.data || [];
    // Use YYYY-MM prefix matching (proven working in monthlyTrends) as primary filter,
    // with Date fallback for edge cases (different timestamp formats)
    const viewMonthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
    const startDate = new Date(startOfMonth).getTime();
    const endDate = new Date(endOfMonth).getTime();
    const thisMonthTxns = txns.filter(t => {
      // Primary: string prefix match (fast, works for ISO timestamps)
      if (t.timestamp && t.timestamp.startsWith(viewMonthPrefix)) return true;
      // Fallback: Date object comparison (handles timezone variations)
      const ts = new Date(t.timestamp).getTime();
      return ts >= startDate && ts <= endDate;
    });

    // ── Income & Spending via DB RPCs (accurate transfer exclusion) ──
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth() + 1;

    // Parallel RPC calls for current month totals + breakdowns
    const [incomeTotalRes, spendingTotalRes, spendingBreakdownRes, incomeBreakdownRes] = await Promise.all([
      admin.rpc('get_monthly_income_total', { p_user_id: user.id, p_year: viewYear, p_month: viewMonth }),
      admin.rpc('get_monthly_spending_total', { p_user_id: user.id, p_year: viewYear, p_month: viewMonth }),
      admin.rpc('get_monthly_spending', { p_user_id: user.id, p_year: viewYear, p_month: viewMonth }),
      admin.rpc('get_monthly_income', { p_user_id: user.id, p_year: viewYear, p_month: viewMonth }),
    ]);

    const monthlyIncome = parseFloat(incomeTotalRes.data) || 0;
    const monthlyOutgoings = parseFloat(spendingTotalRes.data) || 0;

    // Category breakdown from DB (already excludes transfers)
    const spendingRows = (spendingBreakdownRes.data || []) as Array<{ category: string; category_total: string; transaction_count: number }>;
    const categoryBreakdown = spendingRows
      .map(r => ({ category: r.category, total: parseFloat(r.category_total) || 0 }))
      .sort((a, b) => b.total - a.total);
    // Lookup map for budget calculations
    const categoryTotals: Record<string, number> = {};
    for (const r of spendingRows) {
      categoryTotals[r.category] = parseFloat(r.category_total) || 0;
    }

    // Top merchants (still computed client-side from transactions)
    const { normaliseMerchantName } = await import('@/lib/merchant-normalise');
    const isTransfer = (t: any) => {
      const cat = (t.category || '').toUpperCase();
      const desc = (t.description || '').toLowerCase();
      if (cat === 'TRANSFER') return true;
      if (t.income_type === 'transfer' || t.user_category === 'transfers') return true;
      if (desc.includes('personal transfer') || desc.includes('to a/c ') || desc.includes('from a/c') ||
          desc.includes('via mobile xfer') || desc.includes('internal') || desc.includes('between accounts')) return true;
      return false;
    };
    const merchantTotals: Record<string, number> = {};
    for (const t of thisMonthTxns.filter(t => parseFloat(t.amount) < 0 && !isTransfer(t))) {
      const merchant = normaliseMerchantName(t.merchant_name || t.description || '');
      merchantTotals[merchant] = (merchantTotals[merchant] || 0) + Math.abs(parseFloat(t.amount));
    }
    const topMerchants = Object.entries(merchantTotals)
      .map(([name, total]) => ({ merchant: name, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Income breakdown from DB
    const incomeByType: Record<string, number> = {};
    for (const row of (incomeBreakdownRes.data || []) as Array<{ source: string; source_total: string }>) {
      incomeByType[row.source] = parseFloat(row.source_total) || 0;
    }

    // Monthly trends via DB RPCs (accurate transfer exclusion for all months)
    const trendMonths: Array<{ year: number; month: number; monthStr: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      trendMonths.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        monthStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      });
    }
    const trendResults = await Promise.all(
      trendMonths.map(m => Promise.all([
        admin.rpc('get_monthly_income_total', { p_user_id: user.id, p_year: m.year, p_month: m.month }),
        admin.rpc('get_monthly_spending_total', { p_user_id: user.id, p_year: m.year, p_month: m.month }),
      ]))
    );
    const monthlyTrends = trendMonths.map((m, i) => ({
      month: m.monthStr,
      income: parseFloat(trendResults[i][0].data) || 0,
      outgoings: parseFloat(trendResults[i][1].data) || 0,
    }));

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
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const isCurrentMonth = viewDate.getMonth() === now.getMonth() && viewDate.getFullYear() === now.getFullYear();
    const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
    const monthProgress = isCurrentMonth ? Math.round((dayOfMonth / daysInMonth) * 100) : 100;

    const viewMonthStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;

    return NextResponse.json({
      tier,
      score,
      selectedMonth: viewMonthStr,
      overview: {
        monthlyIncome: parseFloat(monthlyIncome.toFixed(2)),
        monthlyOutgoings: parseFloat(monthlyOutgoings.toFixed(2)),
        netPosition: parseFloat((monthlyIncome - monthlyOutgoings).toFixed(2)),
        monthProgress,
        dayOfMonth,
        daysInMonth,
        incomeBreakdown: incomeByType,
      },
      // Flatten bank connections into individual accounts
      accounts: (bankConns.data || []).flatMap((conn: any) => {
        const accountIds = conn.account_ids || [];
        const displayNames = conn.account_display_names || [];
        if (accountIds.length <= 1) {
          // Single account connection — return as-is
          return [{ id: conn.id, bank_name: conn.bank_name || 'Bank', status: conn.status, last_synced_at: conn.last_synced_at }];
        }
        // Multi-account connection — expand into individual entries
        return accountIds.map((accId: string, i: number) => ({
          id: `${conn.id}_${accId}`,
          bank_name: displayNames[i] || conn.bank_name || 'Bank',
          status: conn.status,
          last_synced_at: conn.last_synced_at,
        }));
      }),
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
      budgets: isPaid ? (budgets.data || []).map((b: any) => {
        const budgetCat = (b.category || '').toLowerCase();
        const spent = categoryTotals[budgetCat] || 0;
        const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
        return {
          ...b,
          spent: parseFloat(spent.toFixed(2)),
          percentage: parseFloat(pct.toFixed(1)),
          remaining: parseFloat((b.monthly_limit - spent).toFixed(2)),
          status: pct > 100 ? 'over_budget' : pct > 80 ? 'warning' : 'on_track',
        };
      }) : [],
      goals: isPaid ? (goals.data || []).slice(0, isPro ? 100 : 3) : [],
      alerts: (alerts.data || []).slice(0, isPaid ? 20 : 3),
      opportunities: (tasks.data || []).slice(0, isPaid ? 20 : 3).map((t: any) => {
        // Parse description JSON if present (from email scanner)
        let parsed: any = {};
        try { parsed = typeof t.description === 'string' && t.description.startsWith('{') ? JSON.parse(t.description) : {}; } catch {}
        return {
          ...t,
          amount: parsed.amount || t.disputed_amount || 0,
          confidence: parsed.confidence || null,
          suggested_action: parsed.suggestedAction || parsed.suggested_action || null,
          opp_type: parsed.type || null,
          opp_category: parsed.category || null,
          description_text: parsed.description || t.description || '',
        };
      }),
    });
  } catch (err: any) {
    console.error('Money Hub error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
