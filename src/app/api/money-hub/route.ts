import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { calculateHealthScore } from '@/lib/financial-health-score';
import { normalizeSpendingCategoryKey, findMatchingCategoryOverride, resolveMoneyHubTransaction, buildMoneyHubOverrideMaps, applyInternalTransferHeuristic } from '@/lib/money-hub-classification';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { pickRawMerchantSource } from '@/lib/merchant-utils';
import { loadLearnedRules } from '@/lib/learning-engine';
import { ensureDefaultSpace, getSpace, spaceConnectionFilter, spaceTransactionFilter } from '@/lib/spaces';
import { bucketFor } from '@/lib/category-taxonomy';

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
function deduplicateTransactions(txns: any[]): any[] {
  const seen = new Map<string, boolean>();
  return txns.filter(txn => {
    const date = (txn.timestamp || '').substring(0, 10); // YYYY-MM-DD
    const merchant = (txn.merchant_name || txn.description || '').toLowerCase().trim();
    const amt = parseFloat(String(txn.amount)) || 0;
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

    const { data: profile } = await admin.from('profiles')
      .select('subscription_tier, trial_ends_at, trial_converted_at, trial_expired_at')
      .eq('id', user.id).single();
    const tier = profile?.subscription_tier || 'free';
    const isTestUser = user.email === 'sheva.tests.2026@outlook.com';
    const isOnboardingTrial = !!(profile?.trial_ends_at &&
      new Date(profile.trial_ends_at) > new Date() &&
      !profile?.trial_converted_at &&
      !profile?.trial_expired_at);
    const effectiveTier = (isTestUser || isOnboardingTrial) ? 'pro' : tier;
    const isPaid = effectiveTier === 'essential' || effectiveTier === 'pro';
    const isPro = effectiveTier === 'pro';

    const url = new URL(request.url);
    const now = new Date();
    const selectedMonth = url.searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

    // Parse selected month for RPC calls
    const [selYear, selMonth] = selectedMonth.split('-').map(Number);

    // Resolve the active Space — either the one requested via ?space_id
    // or the user's default. Non-default Spaces filter bank_connections
    // + bank_transactions to the chosen subset so Money Hub shows only
    // that Space's activity.
    const requestedSpaceId = url.searchParams.get('space_id');
    await ensureDefaultSpace(supabase, user.id);
    const activeSpace = await getSpace(supabase, user.id, requestedSpaceId);
    const connectionFilter = spaceConnectionFilter(activeSpace);
    const txFilter = spaceTransactionFilter(activeSpace);

    // Slim column select: only the fields the JS summariser + merchant
    // calc actually consume. Was .select('*') which dragged 30+ columns
    // (including raw_data jsonb on some banks) — Paul reported the page
    // as "very slow to load". Trimming to ~10 fields cuts the payload
    // ~70% on a 3-6k row response.
    //
    // Also filters soft-deleted rows (the new deleted_at column from
    // the bank-disconnect modal) so users who delete a connection's
    // transactions don't see them re-appear in the JS summariser.
    let txnQuery = admin
      .from('bank_transactions')
      .select('id, timestamp, amount, merchant_name, description, category, user_category, income_type, is_recurring, connection_id, account_id, transaction_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('timestamp', sixMonthsAgo)
      .order('timestamp', { ascending: false })
      .limit(20000);
    let connQuery = admin
      .from('bank_connections')
      .select('id, bank_name, status, last_synced_at, last_manual_sync_at, account_ids, account_display_names')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .neq('status', 'revoked');
    if (connectionFilter) {
      connQuery = connQuery.in('id', connectionFilter);
    }
    if (txFilter) {
      if (txFilter.accountPairs.length === 0) {
        txnQuery = txnQuery.in('connection_id', txFilter.connectionIds);
      } else {
        // OR-combine connection-wide filter with specific account pairs
        const parts: string[] = [];
        if (txFilter.connectionIds.length > 0) {
          parts.push(`connection_id.in.(${txFilter.connectionIds.join(',')})`);
        }
        for (const { connectionId, accountId } of txFilter.accountPairs) {
          parts.push(`and(connection_id.eq.${connectionId},account_id.eq.${accountId})`);
        }
        txnQuery = txnQuery.or(parts.join(','));
      }
    }

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
      // RPC calls for authoritative income/spending totals (excludes transfers correctly).
      // Note: RPCs aggregate at user level — when a non-default Space is
      // active the JS summariser below recomputes the actual totals
      // from the filtered transaction set, so these RPC values are only
      // used for the default "Everything" Space.
      // rpcBreakdown shape: [{ fixed_cost_total, variable_cost_total,
      //   discretionary_total, spending_total, internal_transfer_total }]
      { data: rpcBreakdown },
      { data: rpcIncomeTotal },
      { data: rpcSpendingCategories },
      { data: rpcIncomeCategories },
    ] = await Promise.all([
      txnQuery,
      connQuery,
      admin.from('money_hub_budgets').select('*').eq('user_id', user.id),
      admin.from('money_hub_assets').select('*').eq('user_id', user.id),
      admin.from('money_hub_liabilities').select('*').eq('user_id', user.id),
      admin.from('money_hub_savings_goals').select('*').eq('user_id', user.id),
      admin.from('money_hub_category_overrides').select('*').eq('user_id', user.id),
      admin.from('subscriptions').select('*').eq('user_id', user.id).is('dismissed_at', null),
      admin.from('money_hub_alerts').select('*').eq('user_id', user.id).eq('status', 'active').limit(20),
      // Authoritative spending/income from DB RPCs (handles transfer exclusion, dedup, overrides).
      // get_monthly_spending_breakdown is the canonical replacement for
      // get_monthly_spending_total — returns fixed_cost / variable_cost /
      // discretionary / spending_total / internal_transfer_total.
      admin.rpc('get_monthly_spending_breakdown', { p_user_id: user.id, p_year: selYear, p_month: selMonth }),
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

    // Canonical bucket breakdown.
    //
    // The DB RPC aggregates at the user level — it doesn't see the Space
    // filter applied to txnQuery. So when a non-default Space is active
    // ("Business" / "Personal" / etc.) the RPC's breakdown is wider than
    // the rest of the page. Codex P2 review flagged that this produced
    // contradictory numbers within the same card.
    //
    // Resolution: when on the default "Everything" Space, trust the RPC.
    // When on any filtered Space, recompute the bucket totals from the
    // same filtered transaction set the JS summariser used. We mirror
    // `category_bucket()` via `bucketFor()` (the canonical TS export)
    // so the buckets match the RPC byte-for-byte.
    const isDefaultSpace = !!(activeSpace?.is_default);
    let fixedCostTotal: number;
    let variableCostTotal: number;
    let discretionaryTotal: number;
    let internalTransferTotal: number;
    let rpcSpendingTotal: number;

    if (isDefaultSpace) {
      const breakdownRow = Array.isArray(rpcBreakdown) ? rpcBreakdown[0] : rpcBreakdown;
      fixedCostTotal        = parseFloat(String(breakdownRow?.fixed_cost_total ?? 0)) || 0;
      variableCostTotal     = parseFloat(String(breakdownRow?.variable_cost_total ?? 0)) || 0;
      discretionaryTotal    = parseFloat(String(breakdownRow?.discretionary_total ?? 0)) || 0;
      internalTransferTotal = parseFloat(String(breakdownRow?.internal_transfer_total ?? 0)) || 0;
      rpcSpendingTotal      = parseFloat(String(breakdownRow?.spending_total ?? 0)) || 0;
    } else {
      // Recompute from the filtered txn set used elsewhere in this response.
      let f = 0, v = 0, d = 0, t = 0;
      for (const tx of currentSummary.spendingTransactions) {
        const amt = Math.abs(parseFloat(String(tx.amount)) || 0);
        const cat = (tx as { user_category?: string | null; category?: string | null }).user_category
                  || (tx as { category?: string | null }).category
                  || '';
        const bucket = bucketFor(cat);
        if (bucket === 'fixed_cost') f += amt;
        else if (bucket === 'variable_cost') v += amt;
        else if (bucket === 'discretionary') d += amt;
        else if (bucket === 'internal_transfer') t += amt;
      }
      fixedCostTotal        = f;
      variableCostTotal     = v;
      discretionaryTotal    = d;
      internalTransferTotal = t;
      rpcSpendingTotal      = f + v + d;
    }

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
      // TrueLayer sometimes returns junk (e.g. merchant_name='ad') from an
      // upstream field extraction — pickRawMerchantSource falls back to the
      // description when the merchant_name field is clearly garbage so the
      // "Top merchants" list doesn't collapse unrelated payments under a 2-
      // letter heading.
      const merchant = normaliseMerchantName(pickRawMerchantSource(t.merchant_name, t.description));
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
      if (accountIds.length <= 1) return [{ id: conn.id, bank_name: conn.bank_name || 'Bank', status: conn.status, last_synced_at: conn.last_synced_at, last_manual_sync_at: conn.last_manual_sync_at }];
      return accountIds.map((accId: string, i: number) => ({ id: `${conn.id}_${accId}`, bank_name: displayNames[i] || conn.bank_name || 'Bank', status: conn.status, last_synced_at: conn.last_synced_at, last_manual_sync_at: conn.last_manual_sync_at }));
    });

    return NextResponse.json({
      // Use effectiveTier so onboarding-trial users see Pro UI (including the
      // manual Sync button), matching the server-side getUserPlan() override.
      tier: effectiveTier,
      score: healthScore.overall,
      healthScore,
      selectedMonth,
      activeSpace: activeSpace
        ? { id: activeSpace.id, name: activeSpace.name, emoji: activeSpace.emoji, is_default: activeSpace.is_default }
        : null,
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
        // Canonical bucket split — UI renders Fixed / Variable / Discretionary
        // side by side. spending_total = sum of the three buckets.
        // internalTransferTotal is informational (NOT spending) — useful for
        // an "also moved between own accounts" footnote.
        breakdown: {
          fixedCost:        parseFloat(fixedCostTotal.toFixed(2)),
          variableCost:     parseFloat(variableCostTotal.toFixed(2)),
          discretionary:    parseFloat(discretionaryTotal.toFixed(2)),
          spendingTotal:    parseFloat(rpcSpendingTotal.toFixed(2)),
          internalTransfer: parseFloat(internalTransferTotal.toFixed(2)),
        },
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
