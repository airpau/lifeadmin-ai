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
      assets, liabilities, goals, alerts, tasks, overrides,
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
      admin.from('money_hub_category_overrides').select('merchant_pattern, transaction_id').eq('user_id', user.id),
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

    // Income vs outgoings — detect transfers between own accounts
    const isXferTxn = (t: any) => {
      const desc = (t.description || '').toLowerCase();
      const cat = (t.category || '').toUpperCase();
      // Bank-level transfer category
      if (cat === 'TRANSFER') return true;
      // Description-based transfer detection
      if (desc.includes('personal transfer') || desc.includes('from a/c') || desc.includes('via mobile xfer') ||
          desc.includes('internal') || desc.includes('between accounts') || desc.includes('via online - pymt')) return true;
      // Income type tagged as transfer
      if (t.income_type === 'transfer') return true;
      return false;
    };
    const monthlyIncome = thisMonthTxns.filter(t => parseFloat(t.amount) > 0 && !isXferTxn(t)).reduce((s, t) => s + parseFloat(t.amount), 0);
    const monthlyOutgoings = thisMonthTxns.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

    // Category breakdown - use learning-aware categorisation
    const { normaliseMerchantName } = await import('@/lib/merchant-normalise');
    const { loadLearnedRules, categoriseWithLearningSync: categorise } = await import('@/lib/learning-engine');
    await loadLearnedRules();

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

    // Generic auto-assigned categories that can be overridden by runtime categorisation.
    // These are fallback values the old sync assigned when no keyword matched — they are
    // NOT user corrections, so we allow the runtime categoriser to produce something more
    // specific (e.g. mortgage transactions sitting in 'bills', groceries in 'shopping').
    // Exception: if the user explicitly recategorised the transaction, respect their choice.
    const SOFT_CATEGORIES = new Set(['bills', 'shopping', 'other']);

    const overrideRows = overrides.data || [];
    const txnOverrideIds = new Set(overrideRows.filter(o => o.transaction_id).map(o => o.transaction_id as string));
    const merchantOverridePatterns = overrideRows
      .filter(o => !o.transaction_id && o.merchant_pattern !== 'txn_specific')
      .map(o => (o.merchant_pattern as string).toLowerCase());

    function isUserOverride(t: { id?: string; merchant_name?: string; description?: string }): boolean {
      if (t.id && txnOverrideIds.has(t.id)) return true;
      const merchantLower = (t.merchant_name || '').toLowerCase();
      const descLower = (t.description || '').toLowerCase();
      return merchantOverridePatterns.some(p => p.length > 2 && (merchantLower.includes(p) || descLower.includes(p)));
    }

    const categoryTotals: Record<string, number> = {};
    const merchantTotals: Record<string, number> = {};
    for (const t of spendingTxns) {
      // Prefer user_category unless it's a generic auto-assigned fallback that hasn't been
      // explicitly set by the user (checked via money_hub_category_overrides).
      const rawCat = t.user_category || '';
      const cat = (rawCat && (!SOFT_CATEGORIES.has(rawCat) || isUserOverride(t)))
        ? rawCat
        : (categorise(t.description || '', t.category || '') || rawCat || 'other');
      const amt = Math.abs(parseFloat(t.amount));
      categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      const merchant = normaliseMerchantName(t.merchant_name || t.description || '');
      merchantTotals[merchant] = (merchantTotals[merchant] || 0) + amt;
    }

    // Merge similar "other" category keys into one
    const otherKeys = Object.keys(categoryTotals).filter(k => ['other', 'Other', 'unknown', 'uncategorised', ''].includes(k));
    if (otherKeys.length > 1) {
      let merged = 0;
      for (const k of otherKeys) { merged += categoryTotals[k]; delete categoryTotals[k]; }
      categoryTotals['other'] = merged;
    }

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([cat, total]) => ({ category: cat, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    const topMerchants = Object.entries(merchantTotals)
      .map(([name, total]) => ({ merchant: name, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Income breakdown by type
    const incomeByType: Record<string, number> = {};
    for (const t of thisMonthTxns.filter(t => parseFloat(t.amount) > 0 && !isXferTxn(t))) {
      const type = t.income_type || 'other';
      incomeByType[type] = (incomeByType[type] || 0) + parseFloat(t.amount);
    }

    // Merge 'other', 'unknown', 'uncategorised', and empty income types into a single 'Other' entry
    const mergeAsOther = ['other', 'unknown', 'uncategorised', ''];
    let otherTotal = 0;
    for (const key of Object.keys(incomeByType)) {
      if (mergeAsOther.includes(key.toLowerCase())) {
        otherTotal += incomeByType[key];
        delete incomeByType[key];
      }
    }
    if (otherTotal > 0) {
      incomeByType['other'] = (incomeByType['other'] || 0) + otherTotal;
    }

    // Monthly trends (last 6 months)
    const monthlyTrends: Array<{ month: string; income: number; outgoings: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthTxns = txns.filter(t => t.timestamp.startsWith(monthStr));
      const isXfer = (t: any) => {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toUpperCase();
        if (cat === 'TRANSFER') return true;
        if (desc.includes('personal transfer') || desc.includes('from a/c') || desc.includes('via mobile xfer') ||
            desc.includes('internal') || desc.includes('between accounts') || desc.includes('via online - pymt')) return true;
        if (t.income_type === 'transfer') return true;
        return false;
      };
      const inc = monthTxns.filter(t => parseFloat(t.amount) > 0 && !isXfer(t)).reduce((s, t) => s + parseFloat(t.amount), 0);
      // Match headline monthlyOutgoings: ALL debits (consistent with overview)
      const out = monthTxns.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
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
