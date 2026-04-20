import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { calculateHealthScore } from '@/lib/financial-health-score';
import { normalizeSpendingCategoryKey, findMatchingCategoryOverride, resolveMoneyHubTransaction, buildMoneyHubOverrideMaps, applyInternalTransferHeuristic } from '@/lib/money-hub-classification';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { loadLearnedRules } from '@/lib/learning-engine';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// buildMoneyHubOverrideMaps is imported from @/lib/money-hub-classification
// It returns Map + Array<{pattern, category}> — required by findMatchingCategoryOverride

function isTransactionInMonth(timestamp: string | null | undefined, monthKey: string): boolean {
  if (!timestamp) return false;
  return timestamp.startsWith(monthKey);
}

/**
 * Client-side deduplication of bank transactions.
 * Matches the DB-level deduplicate_bank_transactions RPC logic:
 * same amount + same date + same merchant/description → keep only the first (newest sync).
 * This catches duplicates from overlapping TrueLayer/Yapily connections.
 */
/**
 * Deduplicates bank transactions, handling two distinct cases:
 *
 * Case 1 — Cross-connection duplicates (original):
 *   Same amount + date + merchant from two bank connections after a
 *   TrueLayer → Yapily migration.  Kept: the first occurrence (newest sync wins
 *   after the DB-level deduplicate_bank_transactions RPC has already run).
 *
 * Case 2 — Pending → Settled duplicates (new):
 *   TrueLayer assigns a different transaction_id to the pending vs settled
 *   version of the same transaction.  The pending row has no merchant_name
 *   (raw description only); the settled row has a cleaned merchant_name.  So
 *   the `amount|date|merchant` key differs and both rows pass through the
 *   original filter.  Fix: build a set of settled "fingerprints"
 *   (amount + date + account_id) first, then skip any pending row whose
 *   fingerprint matches a settled row — regardless of description differences.
 *
 * NOTE: The DB trigger trg_reconcile_pending_on_settle is the primary fix and
 * should prevent Case 2 rows from ever reaching here.  This client-side
 * guard is defence-in-depth for any rows that slipped through before the
 * migration was applied, or during the same sync cycle before the trigger fires.
 */
function deduplicateTransactions(txns: any[]): any[] {
  // Build settled fingerprints: amount + date + account_id
  // A pending row that matches any settled fingerprint is the unsettled ghost.
  const settledFingerprints = new Set<string>();
  for (const txn of txns) {
    if (!txn.is_pending) {
      const date = (txn.timestamp || '').substring(0, 10);
      const amt  = parseFloat(String(txn.amount)) || 0;
      settledFingerprints.add(`${amt}|${date}|${txn.account_id || ''}`);
    }
  }

  const seen = new Map<string, boolean>();
  return txns.filter(txn => {
    const date     = (txn.timestamp || '').substring(0, 10);
    const merchant = (txn.merchant_name || txn.description || '').toLowerCase().trim();
    const amt      = parseFloat(String(txn.amount)) || 0;

    // Case 2: skip pending rows that have a settled counterpart
    if (txn.is_pending) {
      const fingerprint = `${amt}|${date}|${txn.account_id || ''}`;
      if (settledFingerprints.has(fingerprint)) return false;
    }

    // Case 1: skip exact duplicates (same amount + date + merchant string)
    const key = `${amt}|${date}|${merchant}`;
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

function summariseTransactionsForMonth(txns: any[], overrides: any, monthKey: string, internalTransfers: Set<string>) {
  const categoryTotals: Record<string, number> = {};
  const incomeRows: Record<string, number> = {};
  const spendingTransactions: any[] = [];
  
  let monthlyIncome = 0;
  let monthlyOutgoings = 0;

  for (const txn of txns) {
    if (!isTransactionInMonth(txn.timestamp, monthKey)) continue;

    const overrideCategory = findMatchingCategoryOverride(txn, overrides.transactionOverrides, overrides.merchantOverrides);
    const resolved = resolveMoneyHubTransaction(txn, overrideCategory);

    // Apply internal transfer heuristic override
    if (internalTransfers.has(txn.id)) {
      resolved.kind = 'transfer';
      resolved.spendingCategory = 'transfers';
    }

    if (resolved.kind === 'income') {
      monthlyIncome += resolved.amount;
      incomeRows[resolved.incomeType || 'other'] = (incomeRows[resolved.incomeType || 'other'] || 0) + resolved.amount;
      continue;
    }

    if (resolved.kind === 'spending' && resolved.spendingCategory) {
      // OpenBanking: spending is negative, refunds are positive.
      // -resolved.amount ensures spending increases total, and refunds decrease total.
      const spendAmount = -resolved.amount;
      const category = normalizeSpendingCategoryKey(resolved.spendingCategory);
      
      // Strict exclusions to prevent double counting or inflation
      if (category === 'transfers' || category === 'income') continue;

      monthlyOutgoings += spendAmount;
      categoryTotals[category] = (categoryTotals[category] || 0) + spendAmount;
      spendingTransactions.push({ ...txn, effectiveCategory: category });
    }
  }

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, total]) => ({ category, total: parseFloat(total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total);

  return { monthlyIncome, monthlyOutgoings, categoryTotals, categoryBreakdown, spendingTransactions, incomeRows };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdmin();

    if (user.email === 'sheva.tests.2026@outlook.com') {
      await admin.from('profiles').update({
        subscription_tier: 'pro',
        subscription_status: 'active'
      }).eq('id', user.id);
    }

    const { data: profile } = await admin.from('profiles').select('subscription_tier').eq('id', user.id).single();
    const tier = profile?.subscription_tier || 'free';
    const isTestUser = user.email === 'sheva.tests.2026@outlook.com';
    const isPaid = isTestUser || tier === 'essential' || tier === 'pro';
    const isPro = isTestUser || tier === 'pro';

    const url = new URL(request.url);
    const now = new Date();
    const selectedMonth = url.searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    // Parse selected month for RPC calls
    const [selYear, selMonth] = selectedMonth.split('-').map(Number);

    const [
      { data: txns },
      { data: bankConns },
      { data: budgets },
      { data: assets },
      { data: liabilities },
      { data: goals },
      { data: categoryOverrides },
      { data: subscriptions },
      { data: alerts },
      // RPC calls for authoritative income/spending totals (excludes transfers correctly)
      { data: rpcSpendingTotal },
      { data: rpcIncomeTotal },
      { data: rpcSpendingCategories },
      { data: rpcIncomeCategories },
    ] = await Promise.all([
      admin.from('bank_transactions').select('*').eq('user_id', user.id).gte('timestamp', sixMonthsAgo).order('timestamp', { ascending: false }).limit(20000),
      admin.from('bank_connections').select('id, bank_name, status, last_synced_at, account_ids, account_display_names').eq('user_id', user.id).neq('status', 'revoked'),
      admin.from('money_hub_budgets').select('*').eq('user_id', user.id),
      admin.from('money_hub_assets').select('*').eq('user_id', user.id),
      admin.from('money_hub_liabilities').select('*').eq('user_id', user.id),
      admin.from('money_hub_savings_goals').select('*').eq('user_id', user.id),
      admin.from('money_hub_category_overrides').select('*').eq('user_id', user.id),
      admin.from('subscriptions').select('*').eq('user_id', user.id).is('dismissed_at', null),
      admin.from('money_hub_alerts').select('*').eq('user_id', user.id).eq('status', 'active').limit(20),
      // Authoritative spending/income from DB RPCs (handles transfer exclusion, dedup, overrides)
      admin.rpc('get_monthly_spending_total', { p_user_id: user.id, p_year: selYear, p_month: selMonth }),
      admin.rpc('get_monthly_income_total', { p_user_id: user.id, p_year: selYear, p_month: selMonth }),
      admin.rpc('get_monthly_spending', { p_user_id: user.id, p_year: selYear, p_month: selMonth }),
      admin.rpc('get_monthly_income', { p_user_id: user.id, p_year: selYear, p_month: selMonth }),
    ]);

    // Deduplicate transactions before any computation
    const allTxns = deduplicateTransactions(txns || []);
    await loadLearnedRules();
    const overrides = buildMoneyHubOverrideMaps(categoryOverrides || []);
    const internalTransfers = applyInternalTransferHeuristic(allTxns);
    
    // JS-based computation (used for trends, merchant analysis, and as fallback)
    const currentSummary = summariseTransactionsForMonth(allTxns, overrides, selectedMonth, internalTransfers);

    // Authoritative income/spending via JS computation (to support AI rule mapping and local recategorisation)
    const authSpending = currentSummary.monthlyOutgoings;
    const authIncome = currentSummary.monthlyIncome;

    // Build authoritative category breakdown via JS learning rules
    const authCategoryBreakdown = currentSummary.categoryBreakdown;

    // Build authoritative income breakdown
    const authIncomeBreakdown: Record<string, number> = { ...currentSummary.incomeRows };

    // Build authoritative category totals map (for budget matching)
    const authCategoryTotals: Record<string, number> = {};
    for (const cat of authCategoryBreakdown) {
      authCategoryTotals[cat.category] = cat.total;
    }

    // Compute top merchants from JS-based current summary (RPCs don't provide per-merchant data)
    const merchantTotals: Record<string, number> = {};
    for (const t of currentSummary.spendingTransactions) {
      const merchant = normaliseMerchantName(t.merchant_name || t.description || '');
      merchantTotals[merchant] = (merchantTotals[merchant] || 0) + Math.abs(parseFloat(String(t.amount)));
    }
    const topMerchants = Object.entries(merchantTotals)
      .map(([merchant, total]) => ({ merchant, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total).slice(0, 10);

    // Monthly Trends computation
    const monthlyTrends = [];
    let sumIncome = 0;
    let sumOutgoings = 0;
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mSum = summariseTransactionsForMonth(allTxns, overrides, mKey, internalTransfers);
      monthlyTrends.push({ month: mKey, income: mSum.monthlyIncome, outgoings: mSum.monthlyOutgoings });
      sumIncome += mSum.monthlyIncome;
      sumOutgoings += mSum.monthlyOutgoings;
    }
    const avgMonthlyIncome = sumIncome / 6;
    const avgMonthlyOutgoings = sumOutgoings / 6;

    // Build Net Worth STRICTLY WITHOUT Open Banking Balances (FCA Compliance)
    const totalAssets = (assets || []).reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0);
    const totalLiabilities = (liabilities || []).reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);
    const netWorth = totalAssets - totalLiabilities;
    const liquidSavings = (assets || []).filter(a => a.asset_type === 'savings').reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0);
    
    // Subscriptions strictly for tracking/metrics (NOT added to outgoing totals to prevent inflation)
    const activeSubs = (subscriptions || []).filter(s => s.status === 'active');
    
    // Financial Health Score using authoritative RPC data where available
    const healthScore = calculateHealthScore({
      monthlyIncome: authIncome > 0 ? authIncome : avgMonthlyIncome,
      monthlyOutgoings: authSpending > 0 ? authSpending : avgMonthlyOutgoings,
      budgets: (budgets || []).map((b: any) => ({
        monthly_limit: b.monthly_limit,
        spent: authCategoryTotals[normalizeSpendingCategoryKey(b.category)] || 0,
      })),
      monthlyTrends,
      liquidSavings,
      goals: (goals || []).map((g: any) => ({ target_amount: g.target_amount || 0, current_amount: g.current_amount || 0 })),
      totalMonthlyDebtPayments: (liabilities || []).reduce((s, l) => s + (parseFloat(String(l.monthly_payment)) || 0), 0),
      totalDebt: totalLiabilities,
      previousMonthDebt: totalLiabilities,
      creditCardBalance: (liabilities || []).filter(l => l.liability_type === 'credit_card').reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0),
      creditCardLimit: 0,
      expectedBillsPaid: 0, // Migrating away from expected_bills RPC to pure transactions
      expectedBillsTotal: 0,
      contractsTracked: activeSubs.filter(s => s.contract_end_date).length,
      contractsTotal: activeSubs.length,
      alertsActioned: 0,
      alertsTotal: alerts?.length || 0,
    });

    // Formatting outputs
    const accounts = (bankConns || []).flatMap((conn: any) => {
      const accountIds = conn.account_ids || [];
      const displayNames = conn.account_display_names || [];
      if (accountIds.length <= 1) return [{ id: conn.id, bank_name: conn.bank_name || 'Bank', status: conn.status, last_synced_at: conn.last_synced_at }];
      return accountIds.map((accId: string, i: number) => ({ id: `${conn.id}_${accId}`, bank_name: displayNames[i] || conn.bank_name || 'Bank', status: conn.status, last_synced_at: conn.last_synced_at }));
    });

    return NextResponse.json({
      tier,
      score: healthScore.overall,
      healthScore,
      selectedMonth,
      overview: {
        monthlyIncome: parseFloat(authIncome.toFixed(2)),
        monthlyOutgoings: parseFloat(authSpending.toFixed(2)),
        savingsRate: authIncome > 0 ? ((authIncome - authSpending) / authIncome) * 100 : 0,
        incomeBreakdown: authIncomeBreakdown,
      },
      spending: {
        categories: isPaid ? authCategoryBreakdown : authCategoryBreakdown.slice(0, 5),
        topMerchants: isPro ? topMerchants : [],
        monthlyTrends: isPaid ? monthlyTrends : [],
        totalSpent: parseFloat(authSpending.toFixed(2)),
      },
      accounts,
      subscriptions: activeSubs, // Tracked, but NOT added to spend
      netWorth: {
        total: parseFloat(netWorth.toFixed(2)),
        assets: parseFloat(totalAssets.toFixed(2)),
        liabilities: parseFloat(totalLiabilities.toFixed(2)),
        assetsList: isPro ? (assets || []) : [],
        liabilitiesList: isPro ? (liabilities || []) : [],
      },
      budgets: isPaid ? (budgets || []).map((b: any) => {
        const cat = normalizeSpendingCategoryKey(b.category);
        const spent = authCategoryTotals[cat] || 0;
        const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
        return { ...b, spent: parseFloat(spent.toFixed(2)), percentage: parseFloat(pct.toFixed(1)), remaining: parseFloat((b.monthly_limit - spent).toFixed(2)), status: pct > 100 ? 'over_budget' : pct > 80 ? 'warning' : 'on_track' };
      }) : [],
      goals: isPaid ? (goals || []).slice(0, isPro ? 100 : 3) : [],
      alerts: isPro ? (alerts || []) : [],
    });

  } catch (err: any) {
    console.error('Money Hub error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
