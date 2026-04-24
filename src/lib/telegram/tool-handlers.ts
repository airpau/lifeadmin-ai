import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeSpendingCategoryKey, buildMoneyHubOverrideMaps, findMatchingCategoryOverride, resolveMoneyHubTransaction } from '@/lib/money-hub-classification';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { loadLearnedRules } from '@/lib/learning-engine';

const CATEGORY_LABELS: Record<string, string> = {
  mortgage: 'Mortgage', loans: 'Loans & Finance', credit: 'Credit Cards',
  council_tax: 'Council Tax', energy: 'Energy', water: 'Water',
  broadband: 'Broadband', mobile: 'Mobile', streaming: 'Streaming',
  fitness: 'Fitness', groceries: 'Groceries', eating_out: 'Eating Out',
  fuel: 'Fuel', shopping: 'Shopping', insurance: 'Insurance',
  transport: 'Transport', gambling: 'Gambling', childcare: 'Childcare',
  software: 'Software', tax: 'Tax (HMRC)', professional: 'Professional Services',
  bills: 'Bills', transfers: 'Transfers', cash: 'Cash', fees: 'Fees',
  income: 'Income', other: 'Other', motoring: 'Motoring', property_management: 'Property',
  credit_monitoring: 'Credit Monitoring', charity: 'Charity', travel: 'Travel',
};

/** Classify transactions using the same engine as the Money Hub dashboard */
async function classifyTransactions(supabase: ReturnType<typeof getAdmin>, userId: string, startDate: string, endDate: string) {
  const [{ data: txns }, { data: overrideRows }] = await Promise.all([
    supabase.from('bank_transactions')
      .select('id, amount, description, category, timestamp, merchant_name, user_category, income_type')
      .eq('user_id', userId)
      .gte('timestamp', startDate)
      .lt('timestamp', endDate)
      .order('timestamp', { ascending: false })
      .limit(5000),
    supabase.from('money_hub_category_overrides')
      .select('merchant_pattern, transaction_id, user_category')
      .eq('user_id', userId),
  ]);
  await loadLearnedRules();
  const overrides = buildMoneyHubOverrideMaps(overrideRows || []);
  return (txns || []).map(txn => {
    const overrideCategory = findMatchingCategoryOverride(txn, overrides.transactionOverrides, overrides.merchantOverrides);
    const resolved = resolveMoneyHubTransaction(txn, overrideCategory);
    return {
      ...txn,
      resolved,
      effectiveCategory: resolved.spendingCategory || 'other',
      displayName: normaliseMerchantName(txn.merchant_name || txn.description || ''),
    };
  });
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface PendingAction {
  type: 'dispute_letter';
  provider: string;
  issue_description: string;
  desired_outcome: string;
  issue_type: string;
  letter_text: string;
}

export interface ToolResult {
  text: string;
  pendingAction?: PendingAction;
}

function fmt(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  return `£${Math.abs(n).toFixed(2)}`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function blockBar(spent: number, limit: number, width = 10): string {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${Math.round(pct * 100)}%`;
}

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const supabase = getAdmin();

  switch (toolName) {
    case 'get_spending_summary':
      return getSpendingSummary(supabase, userId, toolInput.month as string | undefined);
    case 'list_transactions':
      return listTransactions(supabase, userId, {
        month: toolInput.month as string | undefined,
        category: toolInput.category as string | undefined,
        merchant: toolInput.merchant as string | undefined,
        limit: toolInput.limit as number | undefined,
      });
    case 'get_subscriptions':
      return getSubscriptions(supabase, userId, toolInput.filter as string | undefined, toolInput.category as string | undefined, toolInput.provider as string | undefined);
    case 'get_disputes':
      return getDisputes(supabase, userId, toolInput.status as string | undefined);
    case 'get_contracts':
      return getContracts(supabase, userId, toolInput.provider as string | undefined, toolInput.category as string | undefined);
    case 'get_budget_status':
      return getBudgetStatus(supabase, userId);
    case 'get_financial_overview':
      return getFinancialOverview(supabase, userId);
    case 'get_upcoming_renewals':
      return getUpcomingRenewals(supabase, userId);
    case 'get_price_alerts':
      return getPriceAlerts(supabase, userId);
    case 'get_deals':
      return getDeals(supabase, userId, toolInput.category as string | undefined);
    case 'get_upcoming_payments':
      return getUpcomingPayments(supabase, userId, toolInput.days as number | undefined);
    case 'get_savings_goals':
      return getSavingsGoals(supabase, userId);
    case 'get_savings_challenges':
      return getSavingsChallenges(supabase, userId);
    case 'get_bank_connections':
      return getBankConnections(supabase, userId);
    case 'remove_bank_connection':
      return removeBankConnection(supabase, userId, toolInput.identifier as string);
    case 'get_verified_savings':
      return getVerifiedSavings(supabase, userId);
    case 'get_monthly_trends':
      return getMonthlyTrends(supabase, userId, toolInput.months as number | undefined);
    case 'get_income_breakdown':
      return getIncomeBreakdown(supabase, userId, toolInput.month as string | undefined);
    case 'get_dispute_detail':
      return getDisputeDetail(supabase, userId, toolInput.provider as string);
    case 'draft_dispute_letter':
      return draftDisputeLetter(supabase, userId, {
        provider: toolInput.provider as string,
        issue_description: toolInput.issue_description as string,
        desired_outcome: toolInput.desired_outcome as string,
        issue_type: (toolInput.issue_type as string | undefined) ?? 'complaint',
        supplier_latest_message: toolInput.supplier_latest_message as string | undefined,
        user_reply_brief: toolInput.user_reply_brief as string | undefined,
        reply_tone: (toolInput.reply_tone as ReplyTone | undefined) ?? 'auto',
      });
    case 'search_legal_rights':
      return searchLegalRights(
        supabase,
        toolInput.category as string | undefined,
        toolInput.query as string,
      );
    case 'recategorise_transactions':
      return recategoriseTransactions(supabase, userId, toolInput.merchant_name as string, toolInput.new_category as string);
    case 'set_budget':
      return setBudget(supabase, userId, toolInput.category as string, toolInput.monthly_limit as number);
    case 'recategorise_subscription':
      return recategoriseSubscription(supabase, userId, toolInput.provider_name as string, toolInput.new_category as string);
    case 'add_subscription':
      return addSubscription(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        amount: toolInput.amount as number,
        billing_cycle: (toolInput.billing_cycle as string | undefined) ?? 'monthly',
        category: (toolInput.category as string | undefined) ?? 'other',
      });
    case 'cancel_subscription':
      return cancelSubscription(supabase, userId, toolInput.provider_name as string);
    case 'delete_budget':
      return deleteBudget(supabase, userId, toolInput.category as string);
    case 'update_alert_preferences':
      return updateAlertPreferences(supabase, userId, toolInput as Record<string, unknown>);
    case 'get_alert_preferences':
      return getAlertPreferences(supabase, userId);
    case 'create_savings_goal':
      return createSavingsGoal(supabase, userId, {
        goal_name: toolInput.goal_name as string,
        target_amount: toolInput.target_amount as number,
        target_date: toolInput.target_date as string | undefined,
        emoji: toolInput.emoji as string | undefined,
      });
    case 'update_savings_goal':
      return updateSavingsGoal(supabase, userId, {
        goal_name: toolInput.goal_name as string,
        amount_saved: toolInput.amount_saved as number | undefined,
        add_amount: toolInput.add_amount as number | undefined,
      });
    case 'create_task':
      return createTask(supabase, userId, {
        title: toolInput.title as string,
        description: toolInput.description as string,
        priority: (toolInput.priority as string | undefined) ?? 'medium',
      });
    case 'update_dispute_status':
      return updateDisputeStatus(supabase, userId, {
        provider: toolInput.provider as string,
        new_status: toolInput.new_status as string,
        notes: toolInput.notes as string | undefined,
        money_recovered: toolInput.money_recovered as number | undefined,
        provider_response: toolInput.provider_response as string | undefined,
        draft_reply: toolInput.draft_reply as string | undefined,
      });
    case 'add_contract':
      return addContract(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        category: toolInput.category as string,
        monthly_cost: toolInput.monthly_cost as number,
        contract_end_date: toolInput.contract_end_date as string | undefined,
        contract_start_date: toolInput.contract_start_date as string | undefined,
        auto_renews: (toolInput.auto_renews as boolean | undefined) ?? true,
        interest_rate: toolInput.interest_rate as number | undefined,
        remaining_balance: toolInput.remaining_balance as number | undefined,
      });
    case 'recategorise_transaction':
      return recategoriseTransaction(
        supabase,
        userId,
        toolInput.transaction_id as string,
        toolInput.new_category as string,
      );
    case 'get_weekly_outlook':
      return getWeeklyOutlook(supabase, userId);
    case 'get_monthly_recap':
      return getMonthlyRecap(supabase, userId, toolInput.month as string | undefined);
    case 'get_unused_subscriptions':
      return getUnusedSubscriptions(supabase, userId);
    case 'get_dispute_status':
      return getDisputeStatus(supabase, userId);
    case 'get_savings_total':
      return getSavingsTotal(supabase, userId);
    case 'update_subscription':
      return updateSubscription(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        billing_cycle: toolInput.billing_cycle as string | undefined,
        amount: toolInput.amount as number | undefined,
        next_billing_date: toolInput.next_billing_date as string | undefined,
      });
    case 'dismiss_action_item':
      return dismissActionItem(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        item_type: (toolInput.item_type as string | undefined) ?? 'any',
      });
    case 'mark_bill_paid':
      return markBillPaid(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        amount: toolInput.amount as number | undefined,
        paid_date: toolInput.paid_date as string | undefined,
      });
    case 'get_loyalty_status':
      return getLoyaltyStatus(supabase, userId);
    case 'get_referral_link':
      return getReferralLink(supabase, userId);
    case 'get_net_worth':
      return getNetWorth(supabase, userId);
    case 'get_expected_bills':
      return getExpectedBills(supabase, userId);
    case 'get_overcharge_assessments':
      return getOverchargeAssessments(supabase, userId);
    case 'get_profile':
      return getProfile(supabase, userId);
    case 'get_tasks':
      return getTasks(supabase, userId, toolInput.status as string | undefined, toolInput.limit as number | undefined);
    case 'get_scanner_results':
      return getScannerResults(supabase, userId, toolInput.status as string | undefined);
    case 'generate_cancellation_email':
      return generateCancellationEmail(supabase, userId, {
        provider_name: toolInput.provider_name as string,
        category: toolInput.category as string,
        amount: toolInput.amount as number | undefined,
        account_email: toolInput.account_email as string | undefined,
      });
    case 'create_support_ticket':
      return createSupportTicket(supabase, userId, {
        subject: toolInput.subject as string,
        description: toolInput.description as string,
        category: (toolInput.category as string | undefined) ?? 'general',
        priority: (toolInput.priority as string | undefined) ?? 'medium',
      });
    default:
      return { text: `Unknown tool: ${toolName}` };
  }
}

// ============================================================
// READ HANDLERS
// ============================================================

async function getSpendingSummary(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  month?: string,
): Promise<ToolResult> {
  const now = new Date();
  let year = now.getFullYear();
  let mon = now.getMonth() + 1;
  if (typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      year = parts[0];
      mon = parts[1];
    }
  }
  const targetMonth = `${year}-${String(mon).padStart(2, '0')}`;

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  const prevDate = new Date(year, mon - 2, 1).toISOString();

  // Use classification engine for both months
  const [classified, prevClassified, connections] = await Promise.all([
    classifyTransactions(supabase, userId, startDate, endDate),
    classifyTransactions(supabase, userId, prevDate, startDate),
    supabase.from('bank_connections').select('bank_name, status, last_synced_at').eq('user_id', userId),
  ]);

  const connData = connections.data ?? [];
  const EXPIRED_STATUSES = ['expired', 'expired_legacy', 'revoked'];
  const allExpired = connData.length > 0 && connData.every(c => EXPIRED_STATUSES.includes(c.status));
  const noneConnected = connData.length === 0;

  const spending = classified.filter(t => t.resolved.kind === 'spending' && t.effectiveCategory !== 'transfers');
  const income = classified.filter(t => t.resolved.kind === 'income');

  if (spending.length === 0 && income.length === 0) {
    if (noneConnected) {
      return { text: `No bank transactions found for ${targetMonth}. Connect a bank account at paybacker.co.uk/dashboard/money-hub to start tracking spending.` };
    }
    if (allExpired) {
      const lastSync = connData.reduce((latest: string | null, c) => {
        if (!c.last_synced_at) return latest;
        return !latest || c.last_synced_at > latest ? c.last_synced_at : latest;
      }, null);
      return { text: `No stored transactions found for ${targetMonth}. Your bank connection has expired${lastSync ? ` (last synced ${fmtDate(lastSync)})` : ''} — reconnect at paybacker.co.uk/dashboard/money-hub to sync the latest data.` };
    }
    return { text: `No transactions found for ${targetMonth}. Your bank account is connected and transactions will appear once synced.` };
  }

  // Group by CLASSIFIED category (not raw bank category)
  const totals: Record<string, number> = {};
  spending.forEach((t) => {
    const cat = t.effectiveCategory;
    totals[cat] = (totals[cat] ?? 0) + (-Number(t.amount));
  });

  const prevSpending = prevClassified.filter(t => t.resolved.kind === 'spending' && t.effectiveCategory !== 'transfers');
  const prevTotals: Record<string, number> = {};
  prevSpending.forEach((t) => {
    const cat = t.effectiveCategory;
    prevTotals[cat] = (prevTotals[cat] ?? 0) + (-Number(t.amount));
  });

  const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);

  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  let text = `*Spending Summary — ${monthLabel}*\n`;
  text += `Total Spending: *${fmt(grandTotal)}*\n`;
  if (totalIncome > 0) text += `Income: *${fmt(totalIncome)}*\n`;
  text += `\n`;

  for (const [cat, amount] of sorted) {
    const label = CATEGORY_LABELS[cat] || cat;
    const prev = prevTotals[cat] ?? 0;
    const diff = amount - prev;
    const arrow = diff > 1 ? ` ▲${fmt(diff)}` : diff < -1 ? ` ▼${fmt(Math.abs(diff))}` : '';
    text += `• ${label}: *${fmt(amount)}*${arrow}\n`;
  }

  if (allExpired) {
    text += `\n_Note: Bank connection expired — reconnect at paybacker.co.uk/dashboard/money-hub_`;
  }

  return { text };
}

async function listTransactions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { month?: string; category?: string; merchant?: string; limit?: number },
): Promise<ToolResult> {
  const now = new Date();
  let year = now.getFullYear();
  let mon = now.getMonth() + 1;
  if (typeof params.month === 'string' && params.month.includes('-')) {
    const parts = params.month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      year = parts[0];
      mon = parts[1];
    }
  }
  const targetMonth = `${year}-${String(mon).padStart(2, '0')}`;

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  const maxResults = params.limit ?? 25;

  // Use classification engine to get proper categories
  const classified = await classifyTransactions(supabase, userId, startDate, endDate);

  const connResult = await supabase.from('bank_connections').select('status, last_synced_at').eq('user_id', userId);
  const connData = connResult.data ?? [];
  const EXPIRED_STATUSES = ['expired', 'expired_legacy', 'revoked'];
  const allExpired = connData.length > 0 && connData.every(c => EXPIRED_STATUSES.includes(c.status));
  const noneConnected = connData.length === 0;

  // Apply filters using CLASSIFIED category (not raw bank category)
  let filtered = classified;
  const targetCategory = params.category ? normalizeSpendingCategoryKey(params.category) : null;
  if (targetCategory === 'income') {
    filtered = filtered.filter(t => t.resolved.kind === 'income');
  } else if (targetCategory === 'spending') {
    filtered = filtered.filter(t => t.resolved.kind === 'spending');
  } else if (targetCategory) {
    filtered = filtered.filter(t => {
      const cat = normalizeSpendingCategoryKey(t.effectiveCategory);
      return cat === targetCategory;
    });
  }
  if (params.merchant) {
    const kw = params.merchant.toLowerCase();
    filtered = filtered.filter(t =>
      (t.merchant_name || '').toLowerCase().includes(kw) ||
      (t.description || '').toLowerCase().includes(kw) ||
      t.displayName.toLowerCase().includes(kw)
    );
  }

  if (filtered.length === 0) {
    const filterDesc = `${targetCategory ? ` in ${CATEGORY_LABELS[targetCategory] || targetCategory}` : ''}${params.merchant ? ` matching "${params.merchant}"` : ''}`;
    if (noneConnected) {
      return { text: `No transactions found for ${targetMonth}${filterDesc}. Connect a bank account at paybacker.co.uk/dashboard/money-hub` };
    }
    if (allExpired) {
      return { text: `No transactions found for ${targetMonth}${filterDesc}. Bank connection expired — reconnect at paybacker.co.uk/dashboard/money-hub to sync newer data.` };
    }
    // Show which categories DO have data to help user
    const availableCats = [...new Set(classified.filter(t => t.resolved.kind === 'spending').map(t => CATEGORY_LABELS[t.effectiveCategory] || t.effectiveCategory))];
    return { text: `No transactions found for ${targetMonth}${filterDesc}. Categories with data: ${availableCats.slice(0, 10).join(', ')}` };
  }

  const display = filtered.slice(0, maxResults);
  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let text = `*Transactions — ${monthLabel}*`;
  if (targetCategory) text += ` (${CATEGORY_LABELS[targetCategory] || targetCategory})`;
  if (params.merchant) text += ` matching "${params.merchant}"`;
  text += `\n\n`;

  let total = 0;
  for (const t of display) {
    const amt = Number(t.amount);
    total += amt;
    const date = new Date(t.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    const isDebit = amt < 0;
    let catLabel = '';
    if (t.resolved.kind === 'income') {
      const incType = t.resolved.incomeType || 'other';
      catLabel = CATEGORY_LABELS[incType] || incType.charAt(0).toUpperCase() + incType.slice(1);
    } else {
      catLabel = CATEGORY_LABELS[t.effectiveCategory] || t.effectiveCategory;
    }

    text += `\`${t.id}\` · ${date} · ${t.displayName} · ${isDebit ? '-' : '+'}${fmt(Math.abs(amt))} · ${catLabel}\n`;
  }

  text += `\n*Total: ${total < 0 ? '-' : ''}${fmt(Math.abs(total))}* (${filtered.length} transaction${filtered.length !== 1 ? 's' : ''})\n`;
  text += `_To recategorise, say something like "recategorise [merchant] as [category]"_`;

  if (allExpired) {
    text += `\n_Note: Bank connection expired — data may not be current. Reconnect at paybacker.co.uk/dashboard/money-hub_`;
  }

  return { text };
}

async function getSubscriptions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  filter?: string,
  category?: string,
  provider?: string,
): Promise<ToolResult> {
  const effectiveFilter = filter ?? 'active';

  let query = supabase
    .from('subscriptions')
    .select(
      'provider_name, amount, billing_cycle, next_billing_date, status, contract_end_date, provider_type, category',
    )
    .eq('user_id', userId)
    .is('dismissed_at', null)
    .order('amount', { ascending: false });

  if (effectiveFilter !== 'all') {
    if (effectiveFilter === 'active') {
      query = query.eq('status', 'active');
    } else if (effectiveFilter === 'cancelled') {
      query = query.in('status', ['cancelled', 'pending_cancellation']);
    }
  }

  if (category) {
    query = query.ilike('category', category);
  }
  if (provider) {
    query = query.ilike('provider_name', `%${provider}%`);
  }

  const { data, error } = await query.limit(50);
  if (error || !data || data.length === 0) {
    const desc = category ? ` in category "${category}"` : provider ? ` matching "${provider}"` : '';
    return { text: `No subscriptions found${desc}.` };
  }

  // Match the website logic: separate finance payments (loans, mortgages, credit cards) from subscriptions
  const FINANCE_KEYWORDS = ['mortgage', 'loan', 'finance', 'lendinvest', 'skipton', 'santander loan', 'natwest loan', 'novuna', 'ca auto', 'auto finance', 'funding circle', 'zopa', 'barclaycard', 'mbna', 'halifax credit', 'hsbc bank visa', 'virgin money', 'capital one', 'american express', 'amex', 'securepay', 'credit card'];

  const isFinance = (name: string) => {
    const lower = name.toLowerCase();
    return FINANCE_KEYWORDS.some(kw => lower.includes(kw));
  };

  // Deduplicate by normalised provider name + amount band (mirrors website logic).
  // Two separate subscriptions at the same provider but different amounts
  // (e.g. two council-tax DDs for different properties) are kept distinct.
  const seen = new Set<string>();
  const deduped = data.filter(s => {
    const normName = s.provider_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const band = Math.round(Math.log(Math.max(Math.abs(parseFloat(String(s.amount)) || 0), 0.01)) / Math.log(1.1));
    const key = `${normName}|${band}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const subs = deduped.filter(s => !isFinance(s.provider_name) && s.billing_cycle !== 'one-time');
  const finance = deduped.filter(s => isFinance(s.provider_name));

  const toMonthly = (s: { amount: string | number; billing_cycle: string | null }) => {
    const amt = Number(s.amount);
    if (s.billing_cycle === 'yearly') return amt / 12;
    if (s.billing_cycle === 'quarterly') return amt / 3;
    return amt;
  };

  const subsMonthly = subs.filter(s => s.status === 'active').reduce((sum, s) => sum + toMonthly(s), 0);
  const financeMonthly = finance.filter(s => s.status === 'active').reduce((sum, s) => sum + toMonthly(s), 0);

  // If user asked for a specific category (e.g. "mortgage"), show all matching without splitting
  if (category) {
    const totalMonthly = deduped.filter(s => s.status === 'active').reduce((sum, s) => sum + toMonthly(s), 0);
    let text = `*${category} (${deduped.length})*\n`;
    text += `Monthly total: *${fmt(totalMonthly)}* | Annual: *${fmt(totalMonthly * 12)}*\n\n`;
    for (const s of deduped) {
      const cycle = s.billing_cycle ?? 'monthly';
      const end = s.contract_end_date ? ` (Ends ${fmtDate(s.contract_end_date)})` : '';
      text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}${end}`;
      if (s.status !== 'active') text += ` [${s.status}]`;
      text += '\n';
    }
    return { text };
  }

  let text = `*Subscriptions (${subs.length})*\n`;
  text += `Monthly: *${fmt(subsMonthly)}* | Annual: *${fmt(subsMonthly * 12)}*\n\n`;

  for (const s of subs.slice(0, 25)) {
    const renewal = s.next_billing_date ? `Renews ${fmtDate(s.next_billing_date)}` : '';
    const end = s.contract_end_date ? `Ends ${fmtDate(s.contract_end_date)}` : renewal;
    const cycle = s.billing_cycle ?? 'monthly';
    text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}`;
    if (s.category) text += ` [${s.category}]`;
    if (end) text += ` (${end})`;
    if (s.status !== 'active') text += ` [${s.status}]`;
    text += '\n';
  }

  if (finance.length > 0) {
    text += `\n*Finance & Loans (${finance.length})*\n`;
    text += `Monthly: *${fmt(financeMonthly)}* | Annual: *${fmt(financeMonthly * 12)}*\n\n`;
    for (const s of finance) {
      const cycle = s.billing_cycle ?? 'monthly';
      text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}`;
      if (s.category) text += ` [${s.category}]`;
      text += '\n';
    }
  }

  return { text };
}

async function getDisputes(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('disputes')
    .select('provider_name, issue_type, status, disputed_amount, money_recovered, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (status === 'open') {
    query = query.in('status', ['open', 'awaiting_response', 'escalated']);
  } else if (status === 'resolved') {
    query = query.in('status', ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return { text: 'No disputes found. Send a message like "Write a complaint letter to British Gas" to start one.' };
  }

  const statusEmoji: Record<string, string> = {
    open: '🔴',
    awaiting_response: '🟡',
    escalated: '🟠',
    resolved_won: '✅',
    resolved_partial: '🟢',
    resolved_lost: '❌',
    closed: '⚫',
  };

  let text = `*Disputes (${data.length})*\n\n`;
  for (const d of data) {
    const emoji = statusEmoji[d.status] ?? '⚪';
    const daysSince = Math.floor(
      (Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    text += `${emoji} *${d.provider_name}* — ${d.issue_type.replace(/_/g, ' ')}\n`;
    text += `   Status: ${d.status.replace(/_/g, ' ')} · ${daysSince}d ago`;
    if (d.money_recovered && Number(d.money_recovered) > 0) {
      text += ` · Recovered: ${fmt(d.money_recovered)}`;
    }
    text += '\n';
  }

  return { text };
}

async function getContracts(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider?: string,
  category?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('subscriptions')
    .select(
      'provider_name, contract_type, contract_end_date, contract_start_date, amount, billing_cycle, auto_renews, early_exit_fee, provider_type, category, interest_rate, remaining_balance',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('contract_end_date', { ascending: true, nullsFirst: false })
    .limit(20);

  if (provider) {
    query = query.ilike('provider_name', `%${provider}%`);
  }
  if (category) {
    query = query.ilike('category', category);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    const desc = category ? ` in category "${category}"` : provider ? ` matching "${provider}"` : '';
    return { text: `No contracts found${desc}. Add contracts at paybacker.co.uk/dashboard/subscriptions` };
  }

  const now = new Date();
  let text = `*Contracts (${data.length})*\n\n`;

  for (const c of data) {
    const cycle = c.billing_cycle ?? 'monthly';
    text += `*${c.provider_name}*`;
    if (c.category) text += ` [${c.category}]`;
    if (c.contract_type && c.contract_type !== 'subscription') {
      text += ` (${c.contract_type.replace(/_/g, ' ')})`;
    }
    text += `\n   ${fmt(c.amount)}/${cycle}`;
    if (c.contract_end_date) {
      const endDate = new Date(c.contract_end_date);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const urgency = daysLeft <= 7 ? '🔴' : daysLeft <= 30 ? '🟡' : '🟢';
      text = text.replace(`*${c.provider_name}*`, `${urgency} *${c.provider_name}*`);
      text += ` · Ends ${fmtDate(c.contract_end_date)} (${daysLeft} days)`;
    }
    if (c.auto_renews) text += ' · Auto-renews';
    if (c.early_exit_fee && Number(c.early_exit_fee) > 0) {
      text += ` · Exit fee: ${fmt(c.early_exit_fee)}`;
    }
    if (c.interest_rate && Number(c.interest_rate) > 0) {
      text += `\n   Interest: ${Number(c.interest_rate).toFixed(2)}%`;
    }
    if (c.remaining_balance && Number(c.remaining_balance) > 0) {
      text += ` · Remaining: ${fmt(c.remaining_balance)}`;
    }
    text += '\n';
  }

  return { text };
}

async function getBudgetStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  const [budgets, spendingRpc] = await Promise.all([
    supabase
      .from('money_hub_budgets')
      .select('category, monthly_limit')
      .eq('user_id', userId),
    supabase.rpc('get_monthly_spending', { p_user_id: userId, p_year: year, p_month: month }),
  ]);

  if (!budgets.data || budgets.data.length === 0) {
    return {
      text: 'No budgets set up yet. Create budgets at paybacker.co.uk/dashboard/money-hub',
    };
  }

  // Build spending map from RPC (uses user_category, excludes transfers/income)
  const spentByCategory: Record<string, number> = {};
  for (const row of spendingRpc.data ?? []) {
    spentByCategory[row.category] = Number(row.category_total);
  }

  const budgetCategories = budgets.data.map(b => b.category);

  // Check if any budget category has no matched spending but there IS 'other' spending
  const otherSpend = spentByCategory['other'] ?? 0;
  const unmatchedBudgets = budgetCategories.filter(cat => !(spentByCategory[cat] > 0));

  if (otherSpend > 0 && unmatchedBudgets.length > 0) {
    // Fetch this month's 'other' transactions for AI categorization
    const { data: otherTxns } = await supabase
      .from('bank_transactions')
      .select('id, merchant_name, description, amount, user_category')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', startDate)
      .lt('timestamp', endDate)
      .in('user_category', ['other'])
      .limit(200);

    if (otherTxns && otherTxns.length > 0) {
      // Group by merchant name to batch the AI call
      const merchantTotals: Record<string, number> = {};
      for (const t of otherTxns) {
        const merchant = t.merchant_name || t.description || 'Unknown';
        merchantTotals[merchant] = (merchantTotals[merchant] ?? 0) + Math.abs(Number(t.amount));
      }

      try {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
        });

        const merchantList = Object.entries(merchantTotals)
          .map(([m, amt]) => `${m}: £${amt.toFixed(2)}`)
          .join('\n');

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: `Classify these UK bank transactions into one of the user's budget categories.

Budget categories: ${budgetCategories.join(', ')}

Transactions (merchant: total spent this month):
${merchantList}

Return ONLY a JSON object mapping each merchant name exactly as given to the best matching category name from the list. Use "other" if none fit.
Example: {"Tesco": "groceries", "National Rail": "travel"}`,
          }],
        });

        const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const categoryMap = JSON.parse(jsonMatch[0]) as Record<string, string>;

          // Redistribute spending from 'other' into matched budget categories
          for (const t of otherTxns) {
            const merchant = t.merchant_name || t.description || 'Unknown';
            const assignedCat = categoryMap[merchant];
            if (assignedCat && assignedCat !== 'other' && budgetCategories.includes(assignedCat)) {
              const amt = Math.abs(Number(t.amount));
              spentByCategory['other'] = Math.max(0, (spentByCategory['other'] ?? 0) - amt);
              spentByCategory[assignedCat] = (spentByCategory[assignedCat] ?? 0) + amt;
            }
          }

          // Persist merchant→category mappings so future syncs use them
          for (const [merchant, cat] of Object.entries(categoryMap)) {
            if (cat !== 'other' && budgetCategories.includes(cat) && merchant !== 'Unknown') {
              const pattern = merchant.toLowerCase().slice(0, 50);
              // Delete any existing pattern to avoid duplicates then insert fresh
              await supabase
                .from('money_hub_category_overrides')
                .delete()
                .eq('user_id', userId)
                .eq('merchant_pattern', pattern);
              await supabase.from('money_hub_category_overrides').insert({
                user_id: userId,
                merchant_pattern: pattern,
                user_category: cat,
              });
            }
          }

          // Re-run auto_categorise so new overrides apply immediately
          await supabase.rpc('auto_categorise_transactions', { p_user_id: userId });
        }
      } catch {
        // AI categorization is best-effort — continue with whatever we have
      }
    }
  }

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let text = `*Budget Status — ${monthLabel}*\n\n`;

  for (const b of budgets.data) {
    const limit = Number(b.monthly_limit);
    const spentAmt = spentByCategory[b.category] ?? 0;
    const over = spentAmt > limit;
    const emoji = over ? '🔴' : spentAmt / limit > 0.8 ? '🟡' : '🟢';
    text += `${emoji} *${b.category}*\n`;
    text += `   ${blockBar(spentAmt, limit)} ${fmt(spentAmt)} / ${fmt(limit)}`;
    if (over) text += ` _(over by ${fmt(spentAmt - limit)})_`;
    text += '\n';
  }

  const remainingOther = spentByCategory['other'] ?? 0;
  if (remainingOther > 0) {
    text += `\n_${fmt(remainingOther)} in uncategorised spending not yet assigned to a budget._`;
  }

  return { text };
}

async function getUpcomingRenewals(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('subscriptions')
    .select('provider_name, amount, billing_cycle, next_billing_date, contract_end_date, auto_renews')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`next_billing_date.gte.${today},contract_end_date.gte.${today}`)
    .or(`next_billing_date.lte.${in30},contract_end_date.lte.${in30}`)
    .order('next_billing_date', { ascending: true })
    .limit(15);

  if (error || !data || data.length === 0) {
    return { text: 'No upcoming renewals in the next 30 days.' };
  }

  // Filter to only those within 30 days
  const upcoming = data.filter((s) => {
    const date = s.contract_end_date ?? s.next_billing_date;
    if (!date) return false;
    const d = new Date(date);
    return d >= now && d <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  if (upcoming.length === 0) {
    return { text: 'No upcoming renewals in the next 30 days.' };
  }

  let text = `*Upcoming Renewals (next 30 days)*\n\n`;
  for (const s of upcoming) {
    const date = s.contract_end_date ?? s.next_billing_date;
    const d = new Date(date!);
    const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const urgency = days <= 3 ? '🔴' : days <= 7 ? '🟡' : '📅';
    const cycle = s.billing_cycle ?? 'monthly';
    const action = s.contract_end_date ? (s.auto_renews ? 'Auto-renews' : 'Expires') : 'Charges';
    text += `${urgency} *${s.provider_name}* — ${fmt(s.amount)}/${cycle}\n`;
    text += `   ${action} in ${days} day${days !== 1 ? 's' : ''} (${fmtDate(date!)})\n`;
  }

  return { text };
}

async function getPriceAlerts(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('price_increase_alerts')
    .select('merchant_name, old_amount, new_amount, increase_pct, annual_impact, new_date, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('annual_impact', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return { text: 'No active price increase alerts. Good news — no unexpected bill rises detected.' };
  }

  const totalImpact = data.reduce((sum, a) => sum + Number(a.annual_impact), 0);

  let text = `*Price Increase Alerts (${data.length})*\n`;
  text += `Total extra cost: *+${fmt(totalImpact)}/year*\n\n`;

  for (const a of data) {
    const pct = Number(a.increase_pct);
    const emoji = pct >= 10 ? '🔴' : '🟡';
    text += `${emoji} *${a.merchant_name ?? 'Unknown'}*: ${fmt(a.old_amount)} → ${fmt(a.new_amount)}/mo (+${pct.toFixed(0)}%) = +${fmt(a.annual_impact)}/yr\n`;
  }

  return { text };
}

// ============================================================
// ACTION HANDLERS
// ============================================================

type ReplyTone = 'auto' | 'friendly' | 'balanced' | 'firm';

function toneGuidance(tone: ReplyTone, hasSupplierContext: boolean): string {
  switch (tone) {
    case 'friendly':
      return [
        "TONE: FRIENDLY / CO-OPERATIVE.",
        "- Warm, polite, brief. Assume good faith.",
        "- Directly answer / do what the supplier asked. Do NOT re-litigate the complaint.",
        "- No statutory references unless the user explicitly asked for them.",
        "- No 14-day ultimatum. No ombudsman reference.",
        "- 120–200 words is plenty.",
      ].join('\n');
    case 'firm':
      return [
        "TONE: FIRM.",
        "- Professional but unmistakably escalating.",
        "- Cite the relevant UK consumer law (Consumer Rights Act 2015 s.49/s.50, sector ombudsman rules, Ofcom automatic compensation, Ofgem guaranteed standards, EU/UK261, etc. — whichever is relevant).",
        "- State a clear 14-day deadline.",
        "- Reference the escalation path (relevant ombudsman / FOS / Small Claims / Section 75) that will follow if not resolved.",
        "- 250–350 words.",
      ].join('\n');
    case 'balanced':
      return [
        "TONE: BALANCED / PROFESSIONAL.",
        "- Neutral, businesslike, firm but not aggressive.",
        "- Mention consumer-law context lightly (one sentence, naturally woven in) — don't lecture.",
        "- Set a 14-day response expectation only if the supplier is dragging their feet.",
        "- 180–280 words.",
      ].join('\n');
    case 'auto':
    default:
      return hasSupplierContext
        ? [
            "TONE: AUTO — decide based on what the supplier just said.",
            "- If the supplier's latest message is a HOLDING REPLY (\"we've got your complaint, looking into it\") — acknowledge briefly, no action required.",
            "- If the supplier asked a scheduling / info / administrative QUESTION (engineer appointment, account number, proof) — answer it directly, keep it short and warm, do NOT re-state the whole complaint history. Only provide what they asked for.",
            "- If the supplier OFFERED a settlement/refund/credit — neutral, businesslike, accept / counter / reject clearly. Don't grovel, don't escalate.",
            "- If the supplier REJECTED the complaint or gave a FINAL RESPONSE / deadlock letter — firm, cite the relevant law and ombudsman / escalation path, 14-day deadline.",
            "- If the supplier's message is unclear or just marketing — keep the reply minimal.",
            "- Match the register of their message. If they were brief and friendly, you are brief and friendly. If they were dismissive, you are firm.",
            "- Never open with a paragraph re-stating the original complaint unless the supplier's message directly contradicts it.",
          ].join('\n')
        : [
            "TONE: AUTO — this appears to be a fresh complaint (no prior supplier message).",
            "- Formal, professional, firm.",
            "- Cite the relevant UK consumer law and sector regulator.",
            "- Set a 14-day deadline and mention the escalation path.",
            "- 250–350 words.",
          ].join('\n');
  }
}

async function draftDisputeLetter(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider: string;
    issue_description: string;
    desired_outcome: string;
    issue_type: string;
    supplier_latest_message?: string;
    user_reply_brief?: string;
    reply_tone?: ReplyTone;
  },
): Promise<ToolResult> {
  // Get user's name and address for the letter
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, address, postcode, email')
    .eq('id', userId)
    .single();

  const fullName =
    profile?.full_name ??
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
    'Customer';

  const tone: ReplyTone = params.reply_tone ?? 'auto';
  const supplierMsg = (params.supplier_latest_message || '').trim();
  const userBrief = (params.user_reply_brief || '').trim();
  const hasSupplierContext = supplierMsg.length > 0;
  const isReply = hasSupplierContext || userBrief.length > 0;
  const likeForLikeMode = userBrief.length > 0;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const likeForLikeBlock = [
    `LIKE-FOR-LIKE MODE (overrides tone length targets and any instruction to add substantive content).`,
    `The user has told you exactly what they want the reply to say. Your job is to render THOSE WORDS as a short, polite, professional business letter — nothing more.`,
    `- Treat the user's brief as the ENTIRE content of the reply. Do not add points, arguments, deadlines, law citations, escalation paths, or outcomes the user didn't mention.`,
    `- Do not re-narrate the complaint history. Do not restate the original issue. Do not "set the record straight".`,
    `- Do not invent availability, dates, preferences, figures, or facts not in the brief.`,
    `- Length is dictated by the brief — if they said one sentence, the body is one short paragraph. Ignore any word-count target from the tone rules.`,
    `- You may: (1) add a one-line courteous opener acknowledging their message, (2) polish grammar / phrasing into business English, (3) add a short courteous closing line (e.g. "Please confirm and I'll keep the slot free.").`,
    `- You may NOT: reframe the user's point, expand it, soften or harden its substance, or layer in extra asks the user didn't make.`,
    `- If the user asked to be firmer/softer via tone, adjust WORDING only — not substance.`,
  ].join('\n');

  const letterPrompt = [
    isReply
      ? `Write a UK consumer's REPLY to ${params.provider}.`
      : `Write a professional complaint letter from a UK consumer to ${params.provider}.`,
    ``,
    `Customer name: ${fullName}`,
    `Customer address: ${profile?.address ?? '[Address]'}, ${profile?.postcode ?? '[Postcode]'}`,
    `Today's date: ${today}`,
    `Underlying issue (background — do NOT re-narrate unless the tone rules say to): ${params.issue_description}`,
    `Desired outcome: ${params.desired_outcome}`,
    `Letter type: ${params.issue_type.replace(/_/g, ' ')}`,
    ``,
    hasSupplierContext
      ? `Supplier's latest message (the one we are replying to):\n"""\n${supplierMsg.slice(0, 4000)}\n"""`
      : `(No prior supplier message — this is a fresh letter.)`,
    ``,
    likeForLikeMode
      ? `WHAT THE USER WANTS THIS REPLY TO SAY (this IS the letter — render it, don't rewrite it):\n"""\n${userBrief}\n"""`
      : ``,
    ``,
    likeForLikeMode ? likeForLikeBlock : ``,
    ``,
    toneGuidance(tone, hasSupplierContext),
    ``,
    `Hard rules (apply regardless of tone):`,
    `- Start with "Dear ${params.provider} Customer Services," and end with "Yours sincerely,\\n${fullName}".`,
    `- UK English. Sounds like an intelligent human wrote it, not a template.`,
    `- Where the supplier asked for specific details (account number, address, DOB) and the user didn't provide them, use square-bracket placeholders (e.g. "[account number]") rather than inventing them.`,
    `- If the user_reply_brief specifies facts (e.g. "any day except Friday"), use those facts verbatim. Do not add availability, dates, or details the user didn't give.`,
    `- Keep the original reference number / ticket ID if it's in the supplier's message.`,
    `- Never include a subject line. The letter body only.`,
    `- Never use bullet points, headings, or CAPS.`,
    likeForLikeMode
      ? `- LIKE-FOR-LIKE MODE IS ACTIVE: if anything in the tone rules above tells you to add content, hit a word count, cite law, or set a deadline, IGNORE IT. The user's brief is the letter.`
      : ``,
  ].filter(Boolean).join('\n');

  const letterResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1400,
    messages: [{ role: 'user', content: letterPrompt }],
  });

  const letterText = letterResponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const pendingAction: PendingAction = {
    type: 'dispute_letter',
    provider: params.provider,
    issue_description: params.issue_description,
    desired_outcome: params.desired_outcome,
    issue_type: params.issue_type,
    letter_text: letterText,
  };

  // Return the full letter — the caller (user-bot.ts) splits it into
  // Telegram-sized chunks via splitMessage(). Don't truncate here.
  const header = isReply
    ? `*Draft reply to ${params.provider}* _(${tone} tone)_ — review below, then approve to save to the audit trail.`
    : `*Draft letter for ${params.provider}* _(${tone} tone)_ — review below, then approve to save.`;

  return {
    text: `${header}\n\n${letterText}`,
    pendingAction,
  };
}

async function searchLegalRights(
  supabase: ReturnType<typeof getAdmin>,
  category: string | undefined,
  query: string,
): Promise<ToolResult> {
  let dbQuery = supabase
    .from('legal_references')
    .select('law_name, section, summary, escalation_body, strength')
    .eq('verification_status', 'current')
    .order('strength', { ascending: false })
    .limit(5);

  if (category) {
    dbQuery = dbQuery.or(`category.ilike.*${category}*,subcategory.ilike.*${category}*`);
  }

  // Text search in summary
  if (query) {
    dbQuery = dbQuery.or(
      `summary.ilike.*${query}*,law_name.ilike.*${query}*,applies_to.cs.{${query}}`,
    );
  }

  const { data, error } = await dbQuery;

  if (error || !data || data.length === 0) {
    return {
      text: `No specific legislation found for "${query}". However, in the UK your key consumer rights come from the Consumer Rights Act 2015 (goods/services), Consumer Credit Act 1974 (credit/finance), and sector regulators like Ofgem (energy) and Ofcom (telecoms). Ask me to draft a complaint letter and I'll cite the most relevant laws automatically.`,
    };
  }

  const strengthLabel: Record<string, string> = {
    strong: '💪 Strong',
    moderate: '⚖️ Moderate',
    weak: '⚠️ Limited',
  };

  let text = `*Your Legal Rights — "${query}"*\n\n`;
  for (const ref of data) {
    text += `${strengthLabel[ref.strength] ?? '⚖️'} *${ref.law_name}*`;
    if (ref.section) text += ` (${ref.section})`;
    text += `\n${ref.summary}`;
    if (ref.escalation_body) text += `\nEscalate to: ${ref.escalation_body}`;
    text += '\n\n';
  }

  return { text: text.trim() };
}

// ============================================================
// WRITE HANDLERS
// ============================================================

async function recategoriseTransactions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  merchantName: string,
  newCategory: string,
): Promise<ToolResult> {
  // Update user_category, which is our internal system rule
  const { data, error } = await supabase
    .from('bank_transactions')
    .update({ user_category: newCategory })
    .eq('user_id', userId)
    .or(`merchant_name.ilike.%${merchantName}%,description.ilike.%${merchantName}%`)
    .select('id, amount, description, merchant_name');

  if (error) {
    return { text: `Failed to recategorise: ${error.message}` };
  }

  const count = data?.length ?? 0;
  if (count === 0) {
    return { text: `No transactions found matching "${merchantName}". Check the spelling or try a shorter name.` };
  }

  // Push to learning engine so it autonomously remembers for future syncs!
  try {
    const { learnFromCorrection } = await import('@/lib/learning-engine');
    // We only need to learn once per merchant batch
    const sample = data[0]; 
    await learnFromCorrection({
      rawName: sample.description || sample.merchant_name || merchantName,
      displayName: merchantName,
      category: newCategory,
      amount: sample.amount,
      userId: userId,
    });
  } catch (err: any) {
    console.error('[UserBot] Error pushing to learning engine:', err.message);
  }

  return { text: `Recategorised ${count} transaction${count !== 1 ? 's' : ''} matching "${merchantName}" to "${newCategory}". Future transactions from this merchant will also be categorised as "${newCategory}".` };
}

async function setBudget(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  category: string,
  monthlyLimit: number,
): Promise<ToolResult> {
  const { error } = await supabase.from('money_hub_budgets').upsert(
    {
      user_id: userId,
      category,
      monthly_limit: monthlyLimit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category' },
  );

  if (error) {
    return { text: `Failed to set budget: ${error.message}` };
  }

  return { text: `Budget set: ${category} — ${fmt(monthlyLimit)}/month. I'll alert you if you go over this limit.` };
}

async function deleteBudget(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  category: string,
): Promise<ToolResult> {
  const { error, count } = await supabase
    .from('money_hub_budgets')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .eq('category', category);

  if (error) {
    return { text: `Failed to delete budget: ${error.message}` };
  }

  if (!count || count === 0) {
    return { text: `No budget found for "${category}".` };
  }

  return { text: `Budget removed for "${category}".` };
}

async function recategoriseSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  providerName: string,
  newCategory: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ category: newCategory })
    .eq('user_id', userId)
    .ilike('provider_name', `%${providerName}%`)
    .eq('status', 'active')
    .select('provider_name');

  if (error) {
    return { text: `Failed to recategorise subscription: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { text: `No active subscription found matching "${providerName}".` };
  }

  const names = data.map(s => s.provider_name).join(', ');
  return { text: `Recategorised ${data.length} subscription${data.length !== 1 ? 's' : ''} (${names}) to "${newCategory}".` };
}

async function addSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider_name: string; amount: number; billing_cycle: string; category: string },
): Promise<ToolResult> {
  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    provider_name: params.provider_name,
    amount: params.amount,
    billing_cycle: params.billing_cycle,
    category: params.category,
    status: 'active',
  });

  if (error) {
    return { text: `Failed to add subscription: ${error.message}` };
  }

  const cycle = params.billing_cycle;
  const annual = params.amount * (cycle === 'monthly' ? 12 : cycle === 'quarterly' ? 4 : 1);
  return { text: `Subscription added: ${params.provider_name} — ${fmt(params.amount)}/${cycle} (${fmt(annual)}/year). Category: ${params.category}.` };
}

async function cancelSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  providerName: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .ilike('provider_name', `%${providerName}%`)
    .eq('status', 'active')
    .select('provider_name, amount, billing_cycle');

  if (error) {
    return { text: `Failed to cancel subscription: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return { text: `No active subscription found matching "${providerName}".` };
  }

  const sub = data[0];
  const cycle = sub.billing_cycle ?? 'monthly';
  const annual = Number(sub.amount) * (cycle === 'monthly' ? 12 : cycle === 'quarterly' ? 4 : 1);
  return { text: `Marked ${sub.provider_name} as cancelled (${fmt(sub.amount)}/${cycle}). That's ${fmt(annual)}/year saved. Note: this updates your tracking only — you still need to cancel directly with ${sub.provider_name}. Want me to draft a cancellation email?` };
}

// ============================================================
// OVERVIEW HANDLER
// ============================================================

async function getFinancialOverview(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [subs, disputes, banks, transactions, budgets, savings] = await Promise.all([
    supabase.from('subscriptions').select('amount, billing_cycle, category', { count: 'exact' })
      .eq('user_id', userId).eq('status', 'active').is('dismissed_at', null),
    supabase.from('disputes').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).not('status', 'in', '("resolved","dismissed")'),
    supabase.from('bank_connections').select('bank_name, status', { count: 'exact' })
      .eq('user_id', userId),
    supabase.from('bank_transactions').select('amount, category')
      .eq('user_id', userId).gte('timestamp', monthStart).lt('timestamp', monthEnd),
    supabase.from('money_hub_budgets').select('category, monthly_limit')
      .eq('user_id', userId),
    supabase.from('verified_savings').select('amount_saved, annual_saving')
      .eq('user_id', userId),
  ]);

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Calculate totals
  const subsList = subs.data ?? [];
  const monthlySubsTotal = subsList.reduce((sum, s) => {
    const amt = Number(s.amount);
    if (s.billing_cycle === 'monthly') return sum + amt;
    if (s.billing_cycle === 'quarterly') return sum + amt / 3;
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    return sum;
  }, 0);

  const txs = transactions.data ?? [];
  const totalSpending = txs.filter(t => Number(t.amount) < 0).reduce((sum, t) => sum + (-Number(t.amount)), 0);
  const totalIncome = txs.filter(t => Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0);

  const totalSaved = (savings.data ?? []).reduce((sum, s) => sum + Number(s.amount_saved ?? 0), 0);
  const annualSaved = (savings.data ?? []).reduce((sum, s) => sum + Number(s.annual_saving ?? 0), 0);

  // Category breakdown (top 5)
  const catTotals: Record<string, number> = {};
  txs.filter(t => Number(t.amount) < 0).forEach(t => {
    const cat = t.category || 'other';
    if (cat !== 'transfers') {
      catTotals[cat] = (catTotals[cat] ?? 0) + (-Number(t.amount));
    }
  });
  const topCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a).slice(0, 5);

  const activeBanks = (banks.data ?? []).filter(b => b.status === 'active');

  let text = `*Financial Overview — ${monthLabel}*\n\n`;

  text += `*This Month:*\n`;
  text += `• Income: *${fmt(totalIncome)}*\n`;
  text += `• Spending: *${fmt(totalSpending)}*\n`;
  text += `• Net: *${totalIncome - totalSpending >= 0 ? '+' : ''}${fmt(totalIncome - totalSpending)}*\n\n`;

  text += `*Recurring Payments:*\n`;
  text += `• ${subs.count ?? 0} active subscriptions\n`;
  text += `• Monthly total: *${fmt(monthlySubsTotal)}* (${fmt(monthlySubsTotal * 12)}/year)\n\n`;

  if (topCats.length > 0) {
    text += `*Top Spending Categories:*\n`;
    for (const [cat, total] of topCats) {
      text += `• ${cat}: ${fmt(total)}\n`;
    }
    text += '\n';
  }

  text += `*Budgets:* ${(budgets.data ?? []).length} set\n`;
  text += `*Open Disputes:* ${disputes.count ?? 0}\n`;
  text += `*Bank Connections:* ${activeBanks.length} active\n`;

  if (totalSaved > 0) {
    text += `\n*Verified Savings:*\n`;
    text += `• Total saved: *${fmt(totalSaved)}*\n`;
    if (annualSaved > 0) text += `• Annual saving: *${fmt(annualSaved)}*\n`;
  }

  return { text };
}

// ============================================================
// MONEY HUB DATA HANDLERS
// ============================================================

async function getSavingsGoals(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('money_hub_savings_goals')
    .select('goal_name, target_amount, current_amount, target_date, emoji')
    .eq('user_id', userId)
    .order('target_date', { ascending: true });

  if (error || !data || data.length === 0) {
    return { text: 'No savings goals set up. Create one at paybacker.co.uk/dashboard/money-hub' };
  }

  let text = `*Savings Goals (${data.length})*\n\n`;
  for (const g of data) {
    const target = Number(g.target_amount);
    const current = Number(g.current_amount);
    const pct = target > 0 ? Math.round((current / target) * 100) : 0;
    const emoji = g.emoji ?? '🎯';
    text += `${emoji} *${g.goal_name}*\n`;
    text += `   ${fmt(current)} / ${fmt(target)} (${pct}%)`;
    if (g.target_date) text += ` · Target: ${fmtDate(g.target_date)}`;
    text += '\n';
  }

  return { text };
}

async function getSavingsChallenges(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('user_challenges')
    .select('template_id, status, started_at, completed_at, progress')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return { text: 'No savings challenges found. Start one at paybacker.co.uk/dashboard/money-hub' };
  }

  const templateIds = [...new Set(data.map(d => d.template_id))];
  const { data: templates } = await supabase
    .from('challenge_templates')
    .select('id, name, description, target_days')
    .in('id', templateIds);

  const templateMap = new Map((templates ?? []).map(t => [t.id, t]));

  const statusEmoji: Record<string, string> = {
    active: '🔥', completed: '✅', failed: '❌', abandoned: '⚪',
  };

  let text = `*Savings Challenges (${data.length})*\n\n`;
  for (const c of data) {
    const tmpl = templateMap.get(c.template_id);
    const emoji = statusEmoji[c.status] ?? '⚪';
    text += `${emoji} *${tmpl?.name ?? 'Challenge'}* — ${c.status}\n`;
    if (tmpl?.description) text += `   ${tmpl.description}\n`;
    text += `   Started: ${fmtDate(c.started_at)}`;
    if (c.completed_at) text += ` · Completed: ${fmtDate(c.completed_at)}`;
    text += '\n';
  }

  return { text };
}

async function getBankConnections(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  // Hide revoked + expired_legacy (terminal states the user can't fix) and
  // anything soft-deleted via /api/bank/remove. Keeps the bot list in sync
  // with what Money Hub shows.
  const { data, error } = await supabase
    .from('bank_connections')
    .select('id, bank_name, status, last_synced_at, connected_at, account_display_names, consent_expires_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('status', 'in', '("revoked","expired_legacy")')
    .order('connected_at', { ascending: false });

  if (error || !data || data.length === 0) {
    return { text: 'No bank accounts connected. Connect one at paybacker.co.uk/dashboard/subscriptions' };
  }

  const statusEmoji: Record<string, string> = {
    active: '🟢', expired: '🔴', expiring_soon: '🟡', token_expired: '🔴',
  };

  let text = `*Bank Connections (${data.length})*\n\n`;
  for (const b of data) {
    const emoji = statusEmoji[b.status] ?? '⚪';
    text += `${emoji} *${b.bank_name ?? 'Unknown Bank'}* — ${b.status.replace(/_/g, ' ')}\n`;
    if (b.account_display_names?.length) {
      text += `   Accounts: ${b.account_display_names.join(', ')}\n`;
    }
    if (b.last_synced_at) text += `   Last sync: ${fmtDate(b.last_synced_at)}`;
    if (b.consent_expires_at) text += ` · Consent expires: ${fmtDate(b.consent_expires_at)}`;
    text += '\n';
  }

  return { text };
}

/**
 * Soft-delete a bank connection the user no longer wants to see —
 * typically a sandbox/test connection still showing as revoked.
 * Matches by name substring (case-insensitive) so the user can say
 * "remove the modelo connection" rather than quote a UUID.
 */
async function removeBankConnection(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  identifier: string,
): Promise<ToolResult> {
  const needle = identifier?.trim().toLowerCase();
  if (!needle) {
    return { text: "I need a bank name to remove — try e.g. 'remove the modelo connection'." };
  }

  const { data: matches } = await supabase
    .from('bank_connections')
    .select('id, bank_name, status, account_display_names')
    .eq('user_id', userId)
    .is('deleted_at', null);

  const candidates = (matches ?? []).filter((m) => {
    const name = (m.bank_name ?? '').toLowerCase();
    const accounts = (m.account_display_names ?? []).join(' ').toLowerCase();
    return name.includes(needle) || accounts.includes(needle);
  });

  if (candidates.length === 0) {
    return { text: `No connection matches "${identifier}". Try get_bank_connections to see what's connected.` };
  }
  if (candidates.length > 1) {
    const list = candidates.map((c) => `• ${c.bank_name} (${c.status})`).join('\n');
    return { text: `Multiple connections match "${identifier}":\n${list}\n\nTell me which one — e.g. include the bank name as it appears above.` };
  }

  const target = candidates[0];
  const { error } = await supabase
    .from('bank_connections')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', target.id)
    .eq('user_id', userId);

  if (error) {
    return { text: `Couldn't remove ${target.bank_name}: ${error.message}` };
  }

  return { text: `✅ Removed *${target.bank_name}* from your connections. It won't appear here or in Money Hub again.` };
}

async function getVerifiedSavings(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('verified_savings')
    .select('title, saving_type, amount_saved, annual_saving, confirmed_by, confirmed_at')
    .eq('user_id', userId)
    .order('confirmed_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return { text: 'No verified savings yet. When you resolve a dispute or cancel a subscription, savings are tracked here automatically.' };
  }

  const totalSaved = data.reduce((sum, s) => sum + Number(s.amount_saved ?? 0), 0);
  const totalAnnual = data.reduce((sum, s) => sum + Number(s.annual_saving ?? 0), 0);

  let text = `*Verified Savings (${data.length})*\n`;
  text += `Total: *${fmt(totalSaved)}* | Annual: *${fmt(totalAnnual)}*\n\n`;

  for (const s of data) {
    const type = s.saving_type.replace(/_/g, ' ');
    text += `✅ *${s.title}*\n`;
    text += `   ${fmt(s.amount_saved)} saved · ${type}`;
    if (s.confirmed_by) text += ` · Verified: ${s.confirmed_by}`;
    text += '\n';
  }

  return { text };
}

async function getMonthlyTrends(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  months?: number,
): Promise<ToolResult> {
  const lookback = months ?? 6;
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - lookback, 1).toISOString();

  const { data, error } = await supabase
    .from('bank_transactions')
    .select('amount, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', startDate)
    .order('timestamp', { ascending: true });

  if (error || !data || data.length === 0) {
    return { text: `No transaction data found for the last ${lookback} months.` };
  }

  const monthlyData: Record<string, { income: number; spending: number }> = {};
  data.forEach((txn: any) => {
    const m = txn.timestamp.slice(0, 7);
    const key = `${m}-01`;
    const amt = Number(txn.amount);
    if (!monthlyData[key]) monthlyData[key] = { income: 0, spending: 0 };
    if (amt > 0) monthlyData[key].income += amt;
    else monthlyData[key].spending += (-amt);
  });

  const sorted = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));

  let text = `*Monthly Trends (last ${lookback} months)*\n\n`;
  for (const [month, vals] of sorted) {
    const [y, m] = month.split('-').map(Number);
    const label = new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const net = vals.income - vals.spending;
    const netSign = net >= 0 ? '+' : '';
    text += `*${label}*\n`;
    text += `  In: ${fmt(vals.income)} | Out: ${fmt(vals.spending)} | Net: ${netSign}${fmt(net)}\n`;
  }

  return { text };
}

async function getIncomeBreakdown(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  month?: string,
): Promise<ToolResult> {
  const now = new Date();
  let year = now.getFullYear();
  let mon = now.getMonth() + 1;
  if (typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      year = parts[0];
      mon = parts[1];
    }
  }
  const targetMonth = `${year}-${String(mon).padStart(2, '0')}`;

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();

  const classified = await classifyTransactions(supabase, userId, startDate, endDate);
  const incomeTxns = classified.filter(t => t.resolved.kind === 'income');

  if (incomeTxns.length === 0) {
    return { text: `No income found for ${targetMonth}.` };
  }

  const total = incomeTxns.reduce((sum, t) => sum + Number(t.amount), 0);

  const sources: Record<string, number> = {};
  for (const t of incomeTxns) {
    let source = t.displayName !== 'Unknown' ? t.displayName : null;
    if (!source) {
      const incType = t.resolved.incomeType || 'other';
      source = CATEGORY_LABELS[incType] || incType.charAt(0).toUpperCase() + incType.slice(1);
    }
    sources[source] = (sources[source] ?? 0) + Number(t.amount);
  }
  const sorted = Object.entries(sources).sort(([, a], [, b]) => b - a);

  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let text = `*Income Breakdown — ${monthLabel}*\n`;
  text += `Total: *${fmt(total)}*\n\n`;

  for (const [source, amount] of sorted) {
    text += `• ${source}: *${fmt(amount)}*\n`;
  }

  return { text };
}

async function getDisputeDetail(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  provider: string,
): Promise<ToolResult> {
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, issue_summary, desired_outcome, status, disputed_amount, money_recovered, created_at, updated_at')
    .eq('user_id', userId)
    .ilike('provider_name', `%${provider}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!dispute) {
    return { text: `No dispute found matching "${provider}".` };
  }

  const { data: letters } = await supabase
    .from('correspondence')
    .select('entry_type, title, content, entry_date')
    .eq('dispute_id', dispute.id)
    .eq('user_id', userId)
    .order('entry_date', { ascending: true });

  let text = `*Dispute: ${dispute.provider_name}*\n`;
  text += `Status: ${dispute.status} · Type: ${dispute.issue_type?.replace(/_/g, ' ') ?? 'complaint'}\n`;
  text += `Opened: ${fmtDate(dispute.created_at)}`;
  if (dispute.disputed_amount) text += ` · Amount: ${fmt(dispute.disputed_amount)}`;
  if (dispute.money_recovered && Number(dispute.money_recovered) > 0) text += ` · Recovered: ${fmt(dispute.money_recovered)}`;
  text += '\n';
  if (dispute.issue_summary) text += `\n_${dispute.issue_summary}_\n`;
  if (dispute.desired_outcome) text += `Desired outcome: ${dispute.desired_outcome}\n`;

  if (letters && letters.length > 0) {
    text += `\n*Correspondence (${letters.length}):*\n`;
    for (const l of letters) {
      text += `\n📄 *${l.title ?? l.entry_type}* — ${fmtDate(l.entry_date)}\n`;
      if (l.content) {
        const preview = l.content.length > 300 ? l.content.slice(0, 300) + '...' : l.content;
        text += `${preview}\n`;
      }
    }
  }

  return { text };
}

// ============================================================
// ALERT PREFERENCE HANDLERS
// ============================================================

const PREF_LABELS: Record<string, string> = {
  morning_summary: 'Morning briefing (7:30am)',
  evening_summary: 'Evening wrap-up (8pm)',
  proactive_alerts: 'Proactive alerts (all)',
  price_increase_alerts: 'Price increase alerts',
  contract_expiry_alerts: 'Contract expiry alerts',
  budget_overrun_alerts: 'Budget overrun alerts',
  renewal_reminders: 'Renewal reminders',
  dispute_followups: 'Dispute follow-ups',
};

async function updateAlertPreferences(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const validFields = [
    'morning_summary', 'evening_summary', 'proactive_alerts',
    'price_increase_alerts', 'contract_expiry_alerts', 'budget_overrun_alerts',
    'renewal_reminders', 'dispute_followups', 'quiet_start', 'quiet_end',
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: string[] = [];

  for (const field of validFields) {
    if (field in input && input[field] !== undefined) {
      updates[field] = input[field];
      if (typeof input[field] === 'boolean') {
        changes.push(`${PREF_LABELS[field] ?? field}: ${input[field] ? '✅ On' : '❌ Off'}`);
      } else {
        changes.push(`${field.replace(/_/g, ' ')}: ${input[field]}`);
      }
    }
  }

  if (changes.length === 0) {
    return { text: 'No preferences specified to update. Tell me which alerts you want to turn on or off.' };
  }

  const { error } = await supabase.from('telegram_alert_preferences').upsert(
    { user_id: userId, ...updates },
    { onConflict: 'user_id' },
  );

  if (error) {
    return { text: `Failed to update preferences: ${error.message}` };
  }

  let text = `*Alert preferences updated:*\n\n`;
  for (const change of changes) {
    text += `• ${change}\n`;
  }
  text += `\nYou can change these any time — just ask me.`;

  return { text };
}

async function getAlertPreferences(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data } = await supabase
    .from('telegram_alert_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  const prefs = data ?? {
    morning_summary: true,
    evening_summary: true,
    proactive_alerts: true,
    price_increase_alerts: true,
    contract_expiry_alerts: true,
    budget_overrun_alerts: true,
    renewal_reminders: true,
    dispute_followups: true,
    quiet_start: null,
    quiet_end: null,
  };

  let text = `*Your Alert Preferences*\n\n`;
  text += `*Summaries:*\n`;
  text += `• Morning briefing (7:30am): ${prefs.morning_summary ? '✅ On' : '❌ Off'}\n`;
  text += `• Evening wrap-up (8pm): ${prefs.evening_summary ? '✅ On' : '❌ Off'}\n\n`;

  text += `*Proactive Alerts:*\n`;
  text += `• All alerts: ${prefs.proactive_alerts ? '✅ On' : '❌ Off'}\n`;
  if (prefs.proactive_alerts) {
    text += `  • Price increases: ${prefs.price_increase_alerts ? '✅' : '❌'}\n`;
    text += `  • Contract expiry: ${prefs.contract_expiry_alerts ? '✅' : '❌'}\n`;
    text += `  • Budget overruns: ${prefs.budget_overrun_alerts ? '✅' : '❌'}\n`;
    text += `  • Renewal reminders: ${prefs.renewal_reminders ? '✅' : '❌'}\n`;
    text += `  • Dispute follow-ups: ${prefs.dispute_followups ? '✅' : '❌'}\n`;
  }

  if (prefs.quiet_start && prefs.quiet_end) {
    text += `\n*Quiet Hours:* ${prefs.quiet_start} — ${prefs.quiet_end}`;
  } else {
    text += `\n*Quiet Hours:* Not set`;
  }

  text += `\n\nTo change any of these, just tell me — e.g. "turn off budget alerts" or "set quiet hours 10pm to 7am"`;

  return { text };
}

// ============================================================
// SAVINGS GOAL HANDLERS
// ============================================================

async function createSavingsGoal(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { goal_name: string; target_amount: number; target_date?: string; emoji?: string },
): Promise<ToolResult> {
  const { error } = await supabase.from('money_hub_savings_goals').insert({
    user_id: userId,
    goal_name: params.goal_name,
    target_amount: params.target_amount,
    current_amount: 0,
    target_date: params.target_date ?? null,
    emoji: params.emoji ?? '🎯',
  });

  if (error) {
    return { text: `Failed to create savings goal: ${error.message}` };
  }

  const emoji = params.emoji ?? '🎯';
  let text = `Savings goal created: ${emoji} *${params.goal_name}* — target ${fmt(params.target_amount)}`;
  if (params.target_date) text += ` by ${fmtDate(params.target_date)}`;
  text += `.\n\nIt's now live in your Money Hub dashboard. Tell me "I saved £X towards my ${params.goal_name}" any time to update progress.`;

  return { text };
}

async function updateSavingsGoal(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { goal_name: string; amount_saved?: number; add_amount?: number },
): Promise<ToolResult> {
  if (params.amount_saved === undefined && params.add_amount === undefined) {
    return { text: `Please specify either amount_saved (set to a value) or add_amount (add to current total).` };
  }

  const { data: goal, error: fetchError } = await supabase
    .from('money_hub_savings_goals')
    .select('id, goal_name, target_amount, current_amount, emoji')
    .eq('user_id', userId)
    .ilike('goal_name', `%${params.goal_name}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !goal) {
    return { text: `No savings goal found matching "${params.goal_name}". Use get_savings_goals to see your goals.` };
  }

  const newAmount =
    params.amount_saved !== undefined
      ? params.amount_saved
      : Number(goal.current_amount) + params.add_amount!;

  const { error } = await supabase
    .from('money_hub_savings_goals')
    .update({ current_amount: newAmount, updated_at: new Date().toISOString() })
    .eq('id', goal.id);

  if (error) {
    return { text: `Failed to update savings goal: ${error.message}` };
  }

  const target = Number(goal.target_amount);
  const pct = target > 0 ? Math.round((newAmount / target) * 100) : 0;
  const emoji = goal.emoji ?? '🎯';
  let text = `${emoji} *${goal.goal_name}* updated: ${fmt(newAmount)} / ${fmt(target)} (${pct}%)`;
  if (newAmount >= target) {
    text += `\n\n🎉 Goal reached! Well done!`;
  } else {
    text += `\n${fmt(target - newAmount)} still to go.`;
  }

  return { text };
}

// ============================================================
// TASK HANDLER
// ============================================================

async function createTask(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { title: string; description: string; priority: string },
): Promise<ToolResult> {
  const { error } = await supabase.from('tasks').insert({
    user_id: userId,
    type: 'other',
    title: params.title,
    description: params.description,
    priority: params.priority,
    status: 'pending_review',
  });

  if (error) {
    return { text: `Failed to create task: ${error.message}` };
  }

  return { text: `Task created: *${params.title}* (${params.priority} priority). View and manage it in your Paybacker dashboard.` };
}

// ============================================================
// DISPUTE STATUS HANDLER
// ============================================================

async function updateDisputeStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider: string; new_status: string; notes?: string; money_recovered?: number; provider_response?: string; draft_reply?: string },
): Promise<ToolResult> {
  const { data: dispute, error: fetchError } = await supabase
    .from('disputes')
    .select('id, provider_name, status, issue_type')
    .eq('user_id', userId)
    .ilike('provider_name', `%${params.provider}%`)
    .not('status', 'in', '("resolved_won","resolved_partial","resolved_lost","closed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !dispute) {
    return { text: `No open dispute found matching "${params.provider}". Use get_disputes to see all disputes.` };
  }

  const updates: Record<string, unknown> = {
    status: params.new_status,
    updated_at: new Date().toISOString(),
  };
  if (params.notes) updates.outcome_notes = params.notes;
  if (params.money_recovered !== undefined) updates.money_recovered = params.money_recovered;

  const isResolved = ['resolved_won', 'resolved_partial', 'resolved_lost', 'closed'].includes(params.new_status);
  if (isResolved) updates.resolved_at = new Date().toISOString();

  const { error } = await supabase.from('disputes').update(updates).eq('id', dispute.id);

  if (error) {
    return { text: `Failed to update dispute: ${error.message}` };
  }

  if (params.provider_response) {
    await supabase.from('correspondence').insert({
      dispute_id: dispute.id,
      user_id: userId,
      entry_type: 'company_response',
      title: `Response from ${dispute.provider_name}`,
      content: params.provider_response,
    });
  }

  if (params.draft_reply) {
    await supabase.from('correspondence').insert({
      dispute_id: dispute.id,
      user_id: userId,
      entry_type: 'ai_letter',
      title: `Draft Reply to ${dispute.provider_name}`,
      content: params.draft_reply,
    });
  }

  const statusEmoji: Record<string, string> = {
    open: '🔴', awaiting_response: '🟡', escalated: '🟠',
    resolved_won: '✅', resolved_partial: '🟢', resolved_lost: '❌', closed: '⚫',
  };

  const emoji = statusEmoji[params.new_status] ?? '⚪';
  let text = `${emoji} *${dispute.provider_name}* dispute updated to: *${params.new_status.replace(/_/g, ' ')}*`;
  if (params.notes) text += `\nNotes: ${params.notes}`;
  if (params.money_recovered) text += `\nRecovered: *${fmt(params.money_recovered)}*`;
  if (params.new_status === 'resolved_won') text += `\n\n🎉 Well done on winning this dispute!`;

  return { text };
}

// ============================================================
// CONTRACT HANDLER
// ============================================================

async function addContract(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider_name: string;
    category: string;
    monthly_cost: number;
    contract_end_date?: string;
    contract_start_date?: string;
    auto_renews: boolean;
    interest_rate?: number;
    remaining_balance?: number;
  },
): Promise<ToolResult> {
  const annual = params.monthly_cost * 12;

  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    provider_name: params.provider_name,
    category: params.category,
    amount: params.monthly_cost,
    billing_cycle: 'monthly',
    contract_type: 'fixed_contract',
    contract_start_date: params.contract_start_date ?? null,
    contract_end_date: params.contract_end_date ?? null,
    auto_renews: params.auto_renews,
    interest_rate: params.interest_rate ?? null,
    remaining_balance: params.remaining_balance ?? null,
    status: 'active',
    source: 'telegram',
  });

  if (error) {
    return { text: `Failed to add contract: ${error.message}` };
  }

  let text = `Contract added: *${params.provider_name}* [${params.category}] — ${fmt(params.monthly_cost)}/month (${fmt(annual)}/year)`;
  if (params.contract_end_date) {
    const daysLeft = Math.ceil(
      (new Date(params.contract_end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    text += `\nEnds: ${fmtDate(params.contract_end_date)} (${daysLeft} days)`;
    if (params.auto_renews) text += ` · Auto-renews`;
  }
  if (params.interest_rate) text += `\nInterest: ${params.interest_rate}%`;
  if (params.remaining_balance) text += ` · Remaining: ${fmt(params.remaining_balance)}`;
  text += `\n\nYou'll get renewal reminders before the contract ends.`;

  return { text };
}

// ============================================================
// DEALS HANDLER
// ============================================================

async function getDeals(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  category?: string,
): Promise<ToolResult> {
  // Fetch deals and (if category filter) user's current subscriptions in parallel
  let dealsQuery = supabase
    .from('affiliate_deals')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (category) {
    dealsQuery = dealsQuery.eq('category', category);
  }

  // Normalise category for subscription lookup (deals use 'broadband', subs may use same)
  const categoryForSubs = category ?? null;

  const [{ data: deals, error }, { data: userSubs }] = await Promise.all([
    dealsQuery,
    categoryForSubs
      ? supabase
          .from('subscriptions')
          .select('provider_name, amount, billing_cycle, category')
          .eq('user_id', userId)
          .eq('status', 'active')
          .eq('category', categoryForSubs)
      : Promise.resolve({ data: null }),
  ]);

  if (error) {
    return { text: `Failed to fetch deals: ${error.message}` };
  }

  if (!deals || deals.length === 0) {
    const catLabel = category ? ` for ${category}` : '';
    return { text: `No deals available${catLabel} right now. Check back soon — new offers are added regularly.` };
  }

  // Calculate user's current monthly spend for this category
  const currentSubs = userSubs ?? [];
  const currentMonthlySpend = currentSubs.reduce((sum, sub) => {
    const monthly =
      sub.billing_cycle === 'yearly'
        ? parseFloat(String(sub.amount)) / 12
        : sub.billing_cycle === 'quarterly'
        ? parseFloat(String(sub.amount)) / 3
        : parseFloat(String(sub.amount));
    return sum + (isNaN(monthly) ? 0 : monthly);
  }, 0);

  // Group deals by category
  const grouped: Record<string, typeof deals> = {};
  for (const deal of deals) {
    if (!grouped[deal.category]) grouped[deal.category] = [];
    grouped[deal.category].push(deal);
  }

  let text = category
    ? `*${category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')} Deals on Paybacker*\n\n`
    : `*Deals available on Paybacker*\n\n`;

  for (const [cat, catDeals] of Object.entries(grouped)) {
    if (!category) {
      const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
      text += `*${catLabel}*\n`;
    }
    for (const deal of catDeals) {
      const effectivePrice = deal.price_promotional && deal.price_promotional < deal.price_monthly
        ? parseFloat(String(deal.price_promotional))
        : parseFloat(String(deal.price_monthly));

      text += `• *${deal.provider}* — ${deal.plan_name}: ${fmt(deal.price_monthly)}/mo`;
      if (deal.price_promotional && deal.price_promotional < deal.price_monthly) {
        text += ` _(${fmt(deal.price_promotional)}/mo for ${deal.promotional_period ?? 'promo period'})_`;
      }
      if (deal.speed_mbps) text += ` · ${deal.speed_mbps}Mbps`;
      if (deal.data_allowance) text += ` · ${deal.data_allowance}`;
      if (deal.contract_length) text += ` · ${deal.contract_length}`;

      // Per-deal saving vs current total spend
      if (currentMonthlySpend > 0 && currentSubs.length > 0 && effectivePrice < currentMonthlySpend) {
        const monthlySaving = currentMonthlySpend - effectivePrice;
        const annualSaving = monthlySaving * 12;
        text += `\n  ↳ Switch & save *${fmt(monthlySaving)}/mo* (*${fmt(annualSaving)}/year*)`;
      }

      text += `\n`;
    }
    text += `\n`;
  }

  // Total savings summary when the user has subscriptions in this category
  if (currentMonthlySpend > 0 && currentSubs.length > 0 && category) {
    const catLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
    text += `*Your ${catLabel} Spending Summary*\n`;
    text += `You currently pay *${fmt(currentMonthlySpend)}/mo* across ${currentSubs.length} provider${currentSubs.length !== 1 ? 's' : ''}:\n`;
    for (const sub of currentSubs) {
      const monthly =
        sub.billing_cycle === 'yearly'
          ? parseFloat(String(sub.amount)) / 12
          : sub.billing_cycle === 'quarterly'
          ? parseFloat(String(sub.amount)) / 3
          : parseFloat(String(sub.amount));
      text += `  • ${sub.provider_name}: ${fmt(monthly)}/mo\n`;
    }

    // Find the cheapest deal for a direct comparison
    const cheapestDeal = deals.reduce((min, d) => {
      const p = d.price_promotional && d.price_promotional < d.price_monthly
        ? parseFloat(String(d.price_promotional))
        : parseFloat(String(d.price_monthly));
      const minP = min.price_promotional && min.price_promotional < min.price_monthly
        ? parseFloat(String(min.price_promotional))
        : parseFloat(String(min.price_monthly));
      return p < minP ? d : min;
    }, deals[0]);

    const cheapestPrice =
      cheapestDeal.price_promotional && cheapestDeal.price_promotional < cheapestDeal.price_monthly
        ? parseFloat(String(cheapestDeal.price_promotional))
        : parseFloat(String(cheapestDeal.price_monthly));

    if (cheapestPrice < currentMonthlySpend) {
      const totalMonthlySaving = currentMonthlySpend - cheapestPrice;
      const totalAnnualSaving = totalMonthlySaving * 12;
      text += `\n*Best saving: switch all to ${cheapestDeal.provider} ${cheapestDeal.plan_name}*\n`;
      text += `${fmt(currentMonthlySpend)}/mo → ${fmt(cheapestPrice)}/mo\n`;
      text += `*You'd save ${fmt(totalMonthlySaving)}/mo = ${fmt(totalAnnualSaving)}/year*\n`;
    }
    text += `\n`;
  }

  text += `_View all deals at paybacker.co.uk/deals_`;
  return { text };
}

// ============================================================
// PER-TRANSACTION RECATEGORISE HANDLER
// ============================================================

async function recategoriseTransaction(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  transactionId: string,
  newCategory: string,
): Promise<ToolResult> {
  // Support truncated IDs (8-char prefix shown in list_transactions output)
  if (transactionId.length < 36) {
    return { text: `Error: You provided a truncated ID ("${transactionId}"). The database requires a full 36-character UUID. Please use the 'recategorise_transactions' tool to search by merchant_name instead.` };
  }
  
  let txnQuery = supabase
    .from('bank_transactions')
    .select('id, merchant_name, description, amount, category, user_category')
    .eq('user_id', userId)
    .eq('id', transactionId);

  const { data: matches, error: fetchError } = await txnQuery.limit(2);

  if (fetchError) {
    return { text: `Database error querying transaction: ${fetchError.message}` };
  }
  if (!matches || matches.length === 0) {
    return { text: `Transaction not found. Check the ID is correct.` };
  }
  if (matches.length > 1) {
    return { text: `"${transactionId}" matches more than one transaction. Provide more characters of the ID to narrow it down.` };
  }
  const txn = matches[0];

  const { error: updateError } = await supabase
    .from('bank_transactions')
    .update({ user_category: newCategory })
    .eq('id', txn.id)
    .eq('user_id', userId);

  if (updateError) {
    return { text: `Failed to recategorise: ${updateError.message}` };
  }

  // Persist override so it survives future syncs
  await supabase.from('money_hub_category_overrides').insert({
    user_id: userId,
    merchant_pattern: 'txn_specific',
    user_category: newCategory,
    transaction_id: txn.id,
  });

  // Automatically feed this into the Learning Engine!
  try {
    const { learnFromCorrection } = await import('@/lib/learning-engine');
    await learnFromCorrection({
      rawName: txn.description || txn.merchant_name || 'Unknown',
      displayName: txn.merchant_name || undefined,
      category: newCategory,
      amount: txn.amount,
      userId: userId,
    });
  } catch (err: any) {
    console.error('[UserBot] Error pushing to learning engine:', err.message);
  }

  const merchant = txn.merchant_name ?? 'Unknown';
  const amt = fmt(Math.abs(Number(txn.amount)));
  const prevCategory = txn.user_category || txn.category || 'unknown';
  return {
    text: `Recategorised *${merchant}* (${amt}) from "${prevCategory}" to "${newCategory}". The change is now reflected in your Money Hub dashboard.`,
  };
}

async function getUpcomingPayments(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  days?: number,
): Promise<ToolResult> {
  const windowDays = days ?? 7;
  const now = new Date();
  const todayDay = now.getDate();
  const todayStr = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const endStr = endDate.toISOString().split('T')[0];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Fetch from THREE sources in parallel:
  // 1. Subscriptions with next_billing_date set
  // 2. Expected bills from bank transaction patterns (direct debits etc)
  // 3. Recent transactions this month to check what's already paid
  const startOfMonth = new Date(year, month - 1, 1).toISOString();
  const endOfMonth = new Date(year, month, 1).toISOString();

  const [subsRes, billsRes, recentTxnRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('provider_name, amount, billing_cycle, next_billing_date, category')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', todayStr)
      .lte('next_billing_date', endStr)
      .order('next_billing_date', { ascending: true }),
    supabase.rpc('get_expected_bills', { p_user_id: userId, p_year: year, p_month: month }),
    supabase
      .from('bank_transactions')
      .select('merchant_name, description, amount, timestamp')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', startOfMonth)
      .lt('timestamp', endOfMonth),
  ]);

  const subs = subsRes.data ?? [];
  const rawBills = (billsRes.data ?? []).filter(
    (b: any) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
  );
  const recentDebits = (recentTxnRes.data ?? []).map(t => ({
    name: (t.merchant_name || t.description || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim(),
    amount: Math.abs(Number(t.amount)),
  }));

  // Check if a bill has already been paid this month
  const isPaidThisMonth = (providerName: string, expectedAmount: number): boolean => {
    const norm = providerName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const prefix = norm.substring(0, Math.min(norm.length, 8));
    return recentDebits.some(d => {
      const nameMatch = d.name.includes(prefix) || (prefix.length >= 4 && d.name.startsWith(prefix.substring(0, 4)));
      const amountClose = Math.abs(d.amount - expectedAmount) <= expectedAmount * 0.25;
      return nameMatch && amountClose;
    });
  };

  // Build unified upcoming payment list from expected bills (by billing day in the window)
  interface UpcomingPayment {
    name: string;
    amount: number;
    dueDate: Date;
    type: string;
    source: 'subscription' | 'bank_pattern' | 'both';
    alreadyPaid: boolean;
  }

  const payments: UpcomingPayment[] = [];
  const addedNames = new Set<string>();

  const LOAN_CATEGORIES = new Set(['mortgage', 'loan', 'loans', 'credit']);
  const BILL_CATEGORIES = new Set(['utility', 'council_tax', 'water', 'broadband', 'mobile', 'bills', 'energy', 'insurance']);
  const FINANCE_KEYWORDS = ['mortgage', 'loan', 'finance', 'credit card', 'lendinvest', 'skipton', 'novuna', 'zopa', 'barclaycard', 'mbna', 'amex', 'american express', 'securepay'];

  const getType = (name: string, category: string | null): string => {
    const lower = name.toLowerCase();
    if (FINANCE_KEYWORDS.some((kw) => lower.includes(kw))) return 'loan';
    if (LOAN_CATEGORIES.has(category ?? '')) return 'loan';
    if (BILL_CATEGORIES.has(category ?? '')) return 'bill';
    return 'subscription';
  };

  // 1. Add subscriptions with explicit next_billing_date
  for (const s of subs) {
    const key = (s.provider_name || '').toLowerCase().substring(0, 8);
    addedNames.add(key);
    const dueDate = new Date(`${s.next_billing_date}T00:00:00`);
    payments.push({
      name: s.provider_name,
      amount: Math.abs(Number(s.amount)),
      dueDate,
      type: getType(s.provider_name, s.category),
      source: 'subscription',
      alreadyPaid: isPaidThisMonth(s.provider_name, Math.abs(Number(s.amount))),
    });
  }

  // 2. Add expected bills from bank patterns that fall within the window AND aren't already added from subscriptions
  const endDay = endDate.getMonth() === now.getMonth() ? endDate.getDate() : 31;
  for (const bill of rawBills) {
    const billingDay = bill.billing_day || 0;
    // Only include if billing day is in our window (today → today + windowDays)
    if (billingDay < todayDay || billingDay > endDay) continue;

    const key = (bill.provider_name || '').toLowerCase().substring(0, 8);
    // Check if already added from subscriptions (avoid duplicates)
    if (addedNames.has(key)) {
      // Upgrade source to 'both'
      const existing = payments.find(p => (p.name || '').toLowerCase().substring(0, 8) === key);
      if (existing) existing.source = 'both';
      continue;
    }
    addedNames.add(key);

    const expectedAmount = parseFloat(bill.expected_amount) || 0;
    const dueDate = new Date(year, month - 1, Math.min(billingDay, 28));

    payments.push({
      name: bill.provider_name,
      amount: expectedAmount,
      dueDate,
      type: bill.is_subscription ? 'subscription' : 'bill',
      source: 'bank_pattern',
      alreadyPaid: isPaidThisMonth(bill.provider_name, expectedAmount),
    });
  }

  if (payments.length === 0) {
    return { text: `No payments due in the next ${windowDays} days.` };
  }

  // Sort by due date
  payments.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const fmtPaymentDate = (d: Date): string => {
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  const unpaidPayments = payments.filter(p => !p.alreadyPaid);
  const paidPayments = payments.filter(p => p.alreadyPaid);
  const totalDue = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  const label = windowDays === 7 ? 'this week' : `in the next ${windowDays} days`;

  let text = `💰 *Upcoming payments ${label}:*\n`;

  if (unpaidPayments.length > 0) {
    for (const p of unpaidPayments) {
      const dateLabel = fmtPaymentDate(p.dueDate);
      const typeLabel = p.type !== 'subscription' ? ` _(${p.type})_` : '';
      const sourceTag = p.source === 'bank_pattern' ? ' 🏦' : '';
      text += `\n📅 ${dateLabel} — *${p.name}*: ${fmt(p.amount)}${typeLabel}${sourceTag}`;
    }
    text += `\n\n*Total due: ${fmt(totalDue)}*`;
  } else {
    text += `\nAll ${payments.length} payments in this period have already been paid! ✅`;
  }

  if (paidPayments.length > 0) {
    text += `\n\n✅ *Already paid (${paidPayments.length}):*`;
    for (const p of paidPayments) {
      text += `\n  ✓ ${p.name}: ${fmt(p.amount)}`;
    }
    text += `\n  _Total paid: ${fmt(totalPaid)}_`;
  }

  if (payments.some(p => p.source === 'bank_pattern')) {
    text += '\n\n_🏦 = detected from your bank transaction history_';
  }

  return { text };
}

// ============================================================
// NEW TOOLS — Loyalty, Referrals, Net Worth, Bills, Overcharges,
//             Profile, Tasks, Scanner, Cancellation, Support
// ============================================================

async function getLoyaltyStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const [pointsRes, badgesRes, eventsRes, profileRes] = await Promise.all([
    supabase
      .from('user_points')
      .select('balance, lifetime_earned, current_streak, longest_streak')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_badges')
      .select('badge_name, badge_emoji, earned_at')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false })
      .limit(10),
    supabase
      .from('point_events')
      .select('event_type, points, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .single(),
  ]);

  const balance = pointsRes.data?.balance ?? 0;
  const lifetime = pointsRes.data?.lifetime_earned ?? 0;
  const streak = pointsRes.data?.current_streak ?? 0;

  // Determine tier
  let tier = 'Bronze';
  let tierEmoji = '🥉';
  if (profileRes.data?.created_at) {
    const months = Math.floor((Date.now() - new Date(profileRes.data.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30));
    if (months >= 18 && lifetime >= 5000) { tier = 'Platinum'; tierEmoji = '💎'; }
    else if (months >= 9 && lifetime >= 2000) { tier = 'Gold'; tierEmoji = '🥇'; }
    else if (months >= 3 && lifetime >= 500) { tier = 'Silver'; tierEmoji = '🥈'; }
  }

  // Next tier requirements
  const tierGoals: Record<string, string> = {
    Bronze: 'Reach Silver: 3 months + 500 pts',
    Silver: 'Reach Gold: 9 months + 2,000 pts',
    Gold: 'Reach Platinum: 18 months + 5,000 pts',
    Platinum: 'You\'re at the top tier!',
  };

  // Redemption options
  const redemptions = [
    { points: 500, label: '£5 off next invoice' },
    { points: 900, label: '£10 off next invoice' },
    { points: 1500, label: 'Free month of Essential (£4.99)' },
    { points: 3000, label: 'Free month of Pro (£9.99)' },
    { points: 500, label: 'Donate £5 to Shelter' },
  ];

  let text = `*${tierEmoji} Loyalty Rewards — ${tier} Tier*\n\n`;
  text += `*Points balance:* ${balance.toLocaleString()} pts\n`;
  text += `*Lifetime earned:* ${lifetime.toLocaleString()} pts\n`;
  text += `*Active streak:* ${streak} month${streak !== 1 ? 's' : ''}\n\n`;

  text += `*Next tier:* ${tierGoals[tier]}\n\n`;

  text += `*Redeem your points:*\n`;
  for (const r of redemptions) {
    const canRedeem = balance >= r.points;
    text += `• ${r.label} — ${r.points} pts ${canRedeem ? '✅' : '🔒'}\n`;
  }

  const badges = badgesRes.data ?? [];
  if (badges.length > 0) {
    text += `\n*Badges earned (${badges.length}):*\n`;
    for (const b of badges.slice(0, 5)) {
      text += `${b.badge_emoji} ${b.badge_name}\n`;
    }
    if (badges.length > 5) text += `_...and ${badges.length - 5} more_\n`;
  }

  const events = eventsRes.data ?? [];
  if (events.length > 0) {
    text += `\n*Recent activity:*\n`;
    for (const e of events) {
      text += `• +${e.points} pts — ${e.description} (${fmtDate(e.created_at)})\n`;
    }
  }

  return { text };
}

// ============================================================
// PROACTIVE INTELLIGENCE HANDLERS
// ============================================================

async function getWeeklyOutlook(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayDay = now.getDate();
  const weekEndDay = todayDay + 7;
  const todayStr = now.toISOString().split('T')[0];
  const in30DaysStr = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [billsRes, contractsRes] = await Promise.all([
    supabase.rpc('get_expected_bills', { p_user_id: userId, p_year: year, p_month: month }),
    supabase
      .from('subscriptions')
      .select('provider_name, contract_end_date, amount, billing_cycle')
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', todayStr)
      .lte('contract_end_date', in30DaysStr)
      .order('contract_end_date', { ascending: true }),
  ]);

  const allBills = (billsRes.data ?? []) as Array<{
    provider_name: string; expected_amount: string; billing_day: number; occurrence_count: number;
  }>;
  const weekBills = allBills.filter(
    (b) => b.billing_day >= todayDay && b.billing_day <= weekEndDay && b.occurrence_count >= 2 && b.occurrence_count <= 30,
  );
  const contracts = contractsRes.data ?? [];

  if (weekBills.length === 0 && contracts.length === 0) {
    return { text: 'No bills due this week and no contracts ending in the next 30 days. All clear!' };
  }

  let text = '📅 *This Week\'s Financial Outlook*\n\n';

  if (weekBills.length > 0) {
    const weekTotal = weekBills.reduce((s, b) => s + (parseFloat(b.expected_amount) || 0), 0);
    text += `💸 *Bills due this week* — Total: *${fmt(weekTotal)}*\n`;
    for (const bill of weekBills) {
      const dayLabel = bill.billing_day === todayDay ? 'Today' : bill.billing_day === todayDay + 1 ? 'Tomorrow' : `Day ${bill.billing_day}`;
      text += `  • *${bill.provider_name}* — ${fmt(parseFloat(bill.expected_amount))} (${dayLabel})\n`;
    }
  } else {
    text += '✅ No bills expected this week\n';
  }

  if (contracts.length > 0) {
    text += '\n📋 *Contracts ending in 30 days*\n';
    for (const c of contracts) {
      const daysLeft = Math.ceil((new Date(c.contract_end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const monthly = c.billing_cycle === 'yearly' ? Number(c.amount) / 12 : c.billing_cycle === 'quarterly' ? Number(c.amount) / 3 : Number(c.amount);
      text += `  ${daysLeft <= 7 ? '🔴' : daysLeft <= 14 ? '🟠' : '🟡'} *${c.provider_name}* — ${fmt(monthly)}/month ends in ${daysLeft} days\n`;
    }
    text += '\n_Ask me to draft a switch letter or show available deals for any of these_';
  }

  return { text };
}

async function getMonthlyRecap(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  month?: string,
): Promise<ToolResult> {
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth(); // Default to previous month (1-indexed month is now.getMonth())
  
  if (targetMonth === 0) { // If it was Jan, previous month is Dec of previous year
    targetMonth = 12;
    targetYear -= 1;
  }

  if (typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-').map(Number);
    if (!isNaN(parts[0]) && !isNaN(parts[1])) {
      targetYear = parts[0];
      targetMonth = parts[1];
    }
  }

  const targetDate = new Date(targetYear, targetMonth - 1, 1);
  const prevDate = new Date(targetYear, targetMonth - 2, 1);

  const [spendRes, prevSpendRes, incomeRes, breakdownRes] = await Promise.all([
    supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: targetYear, p_month: targetMonth }),
    supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: prevDate.getFullYear(), p_month: prevDate.getMonth() + 1 }),
    supabase.rpc('get_monthly_income_total', { p_user_id: userId, p_year: targetYear, p_month: targetMonth }),
    supabase.rpc('get_monthly_spending', { p_user_id: userId, p_year: targetYear, p_month: targetMonth }),
  ]);

  const spending = parseFloat(spendRes.data) || 0;
  const prevSpending = parseFloat(prevSpendRes.data) || 0;
  const income = parseFloat(incomeRes.data) || 0;

  if (spending === 0 && income === 0) {
    return { text: `No financial data found for ${targetDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. Connect a bank account at paybacker.co.uk/dashboard/money-hub.` };
  }

  const monthLabel = targetDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const savingsRate = income > 0 ? ((income - spending) / income) * 100 : 0;
  const spendingDiff = spending - prevSpending;

  type SpendingRow = { category: string; category_total: string };
  const top5 = ((breakdownRes.data as SpendingRow[]) ?? [])
    .map((r) => ({ category: r.category, total: parseFloat(r.category_total) || 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  let text = `📊 *${monthLabel} Financial Recap*\n\n`;
  text += `💰 Income: *${fmt(income)}*\n`;
  text += `💸 Spending: *${fmt(spending)}*\n`;
  const net = income - spending;
  const netSign = net >= 0 ? '+' : '-';
  text += `${net >= 0 ? '✅' : '❌'} Net: *${netSign}${fmt(net)}*\n`;
  text += `${savingsRate >= 20 ? '🎉' : savingsRate >= 10 ? '👍' : '⚠️'} Savings rate: *${savingsRate.toFixed(1)}%*\n`;

  if (prevSpending > 0) {
    text += `${spendingDiff > 0 ? '📈' : '📉'} vs prior month: *${spendingDiff > 0 ? '+' : ''}${fmt(spendingDiff)}*\n`;
  }

  if (top5.length > 0) {
    text += '\n*Top Spending Categories*\n';
    const EMOJI: Record<string, string> = { food: '🛒', transport: '🚗', streaming: '📺', utility: '⚡', utilities: '⚡', bills: '📄', mortgage: '🏠', insurance: '🛡️', fitness: '💪', mobile: '📱', broadband: '🌐', other: '💰' };
    for (const c of top5) {
      const emoji = EMOJI[c.category.toLowerCase()] ?? '💰';
      const pct = spending > 0 ? ((c.total / spending) * 100).toFixed(0) : '0';
      text += `  ${emoji} ${c.category}: *${fmt(c.total)}* (${pct}%)\n`;
    }
  }

  return { text };
}

function normaliseMerchantLocal(name: string): string {
  return name
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk)\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function merchantNamesMatch(a: string, b: string): boolean {
  const na = normaliseMerchantLocal(a);
  const nb = normaliseMerchantLocal(b);
  if (!na || !nb) return false;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter.substring(0, Math.min(shorter.length, 8)));
}

async function getUnusedSubscriptions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const nintyDaysAgoCutoff = new Date(ninetyDaysAgo);

  const [subsRes, txnRes] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, category, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('billing_cycle', ['monthly', 'quarterly']),
    supabase
      .from('bank_transactions')
      .select('merchant_name, description, amount')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', ninetyDaysAgo),
  ]);

  const subs = (subsRes.data ?? []).filter(
    (s) => !s.created_at || new Date(s.created_at) < nintyDaysAgoCutoff,
  );
  const txns = txnRes.data ?? [];

  if (subs.length === 0) {
    return { text: 'No established monthly/quarterly subscriptions found.' };
  }

  const unused = subs.filter(
    (sub) => !txns.some((t) => merchantNamesMatch(sub.provider_name, t.merchant_name || t.description || '')),
  );

  if (unused.length === 0) {
    return { text: 'All your active subscriptions have matching transactions in the last 90 days — no obvious zombie subscriptions detected.' };
  }

  const monthlyTotal = unused.reduce((sum, s) => {
    const amt = Number(s.amount);
    return sum + (s.billing_cycle === 'quarterly' ? amt / 3 : amt);
  }, 0);

  let text = `💤 *Potentially Unused Subscriptions*\n_(No matching transactions in 90 days)_\n\n`;
  for (const sub of unused.slice(0, 8)) {
    const monthly = sub.billing_cycle === 'quarterly' ? Number(sub.amount) / 3 : Number(sub.amount);
    text += `• *${sub.provider_name}* — ${fmt(Number(sub.amount))}/${sub.billing_cycle ?? 'month'} (~${fmt(monthly * 12)}/year)\n`;
  }
  if (unused.length > 8) text += `_...and ${unused.length - 8} more_\n`;

  text += `\n*Total: ~${fmt(monthlyTotal)}/month* you may not be using\n`;
  text += `\n_Ask me to cancel any of these or draft a cancellation email_`;

  return { text };
}

async function getDisputeStatus(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const FCA_DEADLINE_DAYS = 56;

  const { data: disputes, error } = await supabase
    .from('disputes')
    .select('id, provider_name, issue_type, status, created_at, updated_at, disputed_amount, money_recovered')
    .eq('user_id', userId)
    .in('status', ['open', 'awaiting_response', 'escalated'])
    .order('created_at', { ascending: true });

  if (error || !disputes || disputes.length === 0) {
    return { text: 'No active disputes. Use "write a complaint letter to [company]" to start one.' };
  }

  const STATUS_EMOJI: Record<string, string> = { open: '🔴', awaiting_response: '🟡', escalated: '🔥' };

  let text = `📬 *Active Disputes (${disputes.length})*\n\n`;

  for (const d of disputes) {
    const daysSinceSent = Math.floor((now.getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilDeadline = FCA_DEADLINE_DAYS - daysSinceSent;
    const emoji = STATUS_EMOJI[d.status] ?? '❓';

    text += `${emoji} *${d.provider_name}* — ${d.issue_type}\n`;
    text += `  Status: ${d.status} | Sent: ${daysSinceSent} days ago\n`;

    if (daysUntilDeadline <= 0) {
      text += `  🚨 FCA deadline PASSED — escalate to ombudsman now\n`;
    } else if (daysUntilDeadline <= 14) {
      text += `  ⚠️ FCA deadline in ${daysUntilDeadline} days\n`;
    } else {
      text += `  📅 ${daysUntilDeadline} days until FCA deadline\n`;
    }

    if (daysSinceSent >= 14) {
      text += `  _No response in ${daysSinceSent} days — ask me to draft a follow-up_\n`;
    }
    text += '\n';
  }

  return { text: text.trim() };
}

async function getSavingsTotal(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data: savings, error } = await supabase
    .from('verified_savings')
    .select('amount_saved, saving_type, title, confirmed_at, annual_saving')
    .eq('user_id', userId)
    .order('confirmed_at', { ascending: false });

  if (error || !savings || savings.length === 0) {
    return {
      text: 'No verified savings recorded yet.\n\nWhen you win a dispute, cancel a subscription, or stop a price rise, I\'ll track it here. Ask me to write a complaint letter to get started!',
    };
  }

  const totalSaved = savings.reduce((sum, s) => sum + (Number(s.amount_saved) || 0), 0);
  const annualSavingTotal = savings.reduce((sum, s) => sum + (Number(s.annual_saving) || 0), 0);

  const byType: Record<string, number> = {};
  for (const s of savings) {
    const type = s.saving_type ?? 'other';
    byType[type] = (byType[type] ?? 0) + (Number(s.amount_saved) || 0);
  }

  const TYPE_LABELS: Record<string, string> = {
    dispute_won: '⚖️ Disputes won',
    cancelled_subscription: '✂️ Cancelled subscriptions',
    price_reverted: '📉 Price increases reversed',
    refund: '↩️ Refunds',
    other: '💰 Other savings',
  };

  let text = `🏆 *Your Total Savings with Paybacker*\n\n`;
  text += `*${fmt(totalSaved)}* saved to date\n`;
  if (annualSavingTotal > 0) text += `*${fmt(annualSavingTotal)}/year* in ongoing savings\n`;
  text += '\n*Breakdown:*\n';

  for (const [type, amount] of Object.entries(byType).sort(([, a], [, b]) => b - a)) {
    const label = TYPE_LABELS[type] ?? `💰 ${type}`;
    text += `  ${label}: *${fmt(amount)}*\n`;
  }

  if (savings.length > 0) {
    text += '\n*Recent Savings:*\n';
    for (const s of savings.slice(0, 5)) {
      text += `  • ${s.title ?? 'Saving'}: *${fmt(Number(s.amount_saved))}*\n`;
    }
    if (savings.length > 5) text += `  _...and ${savings.length - 5} more_\n`;
  }

  // Next milestone
  const MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000];
  const nextMilestone = MILESTONES.find((m) => m > totalSaved);
  if (nextMilestone) {
    text += `\n🎯 Next milestone: ${fmt(nextMilestone)} — ${fmt(nextMilestone - totalSaved)} to go!`;
  } else {
    text += `\n🏆 You've hit every milestone — legendary savings!`;
  }

  return { text };
}

async function getReferralLink(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single();

  let code = profile?.referral_code;

  if (!code) {
    // Generate a code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    code = 'PB-' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    await supabase.from('profiles').update({ referral_code: code }).eq('id', userId);
  }

  const shareUrl = `https://paybacker.co.uk/join?ref=${code}`;

  const { data: referrals } = await supabase
    .from('referrals')
    .select('referred_email, status, created_at')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  const list = referrals ?? [];
  const signedUp = list.filter(r => r.status === 'signed_up' || r.status === 'subscribed').length;
  const subscribed = list.filter(r => r.status === 'subscribed').length;

  let text = `*Your Paybacker Referral Link*\n\n`;
  text += `🔗 ${shareUrl}\n\n`;
  text += `*Your code:* \`${code}\`\n\n`;
  text += `*How it works:*\n`;
  text += `• Share your link with friends\n`;
  text += `• When they sign up: you earn 100 loyalty points\n`;
  text += `• When they subscribe: you BOTH get 1 free month\n\n`;

  text += `*Your referral stats:*\n`;
  text += `• Total referred: ${list.length}\n`;
  text += `• Signed up: ${signedUp}\n`;
  text += `• Subscribed (free month earned): ${subscribed}\n`;

  if (list.length > 0) {
    text += `\n*Recent referrals:*\n`;
    for (const r of list.slice(0, 5)) {
      const masked = r.referred_email
        ? r.referred_email.replace(/(.{2}).*(@.*)/, '$1***$2')
        : 'Unknown';
      const statusLabel = r.status === 'subscribed' ? '✅ Subscribed' : '⏳ Signed up';
      text += `• ${masked} — ${statusLabel}\n`;
    }
  }

  return { text };
}

async function getNetWorth(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const [assetsRes, liabilitiesRes] = await Promise.all([
    supabase.from('money_hub_assets').select('asset_name, asset_type, estimated_value').eq('user_id', userId),
    supabase.from('money_hub_liabilities').select('liability_name, liability_type, outstanding_balance, monthly_payment, interest_rate').eq('user_id', userId),
  ]);

  const assets = assetsRes.data ?? [];
  const liabilities = liabilitiesRes.data ?? [];

  if (assets.length === 0 && liabilities.length === 0) {
    return {
      text: `No net worth data found. Add your assets and liabilities on the Money Hub page at paybacker.co.uk/dashboard/money-hub to track your net worth.`,
    };
  }

  const totalAssets = assets.reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);
  const netWorth = totalAssets - totalLiabilities;

  let text = `*Net Worth Summary*\n\n`;
  text += `*Total assets:* ${fmt(totalAssets)}\n`;
  text += `*Total liabilities:* ${fmt(totalLiabilities)}\n`;
  text += `*Net worth:* *${netWorth >= 0 ? '' : '-'}${fmt(Math.abs(netWorth))}*\n`;

  if (assets.length > 0) {
    text += `\n*Assets:*\n`;
    for (const a of assets) {
      text += `• ${a.asset_name} (${a.asset_type}) — ${fmt(a.estimated_value)}\n`;
    }
  }

  if (liabilities.length > 0) {
    text += `\n*Liabilities:*\n`;
    for (const l of liabilities) {
      const rate = l.interest_rate ? ` @ ${l.interest_rate}%` : '';
      const monthly = l.monthly_payment ? ` (${fmt(l.monthly_payment)}/mo)` : '';
      text += `• ${l.liability_name} — ${fmt(l.outstanding_balance)}${rate}${monthly}\n`;
    }
  }

  return { text };
}

async function getExpectedBills(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayDay = now.getDate();

  // Fetch expected bills AND actual transactions this month in parallel
  const startOfMonth = new Date(year, month - 1, 1).toISOString();
  const endOfMonth = new Date(year, month, 1).toISOString();

  const [billsRes, txnRes, subsRes, manualRes] = await Promise.all([
    supabase.rpc('get_expected_bills', {
      p_user_id: userId,
      p_year: year,
      p_month: month,
    }),
    supabase
      .from('bank_transactions')
      .select('id, merchant_name, description, amount, timestamp')
      .eq('user_id', userId)
      .lt('amount', 0)  // debits only
      .gte('timestamp', startOfMonth)
      .lt('timestamp', endOfMonth)
      .order('timestamp', { ascending: false }),
    supabase
      .from('subscriptions')
      .select('provider_name, amount, next_billing_date, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('manual_bill_payments')
      .select('provider_name, amount, paid_date')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month),
  ]);

  if (billsRes.error) {
    return { text: `Unable to load expected bills: ${billsRes.error.message}` };
  }

  const bills = (billsRes.data ?? []).filter(
    (b: any) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
  );

  if (bills.length === 0) {
    return {
      text: `No expected bills found for this month. Connect a bank account at paybacker.co.uk/dashboard/money-hub to start tracking your recurring payments.`,
    };
  }

  // Build a list of actual debits this month with normalised names for matching
  const actualDebits = (txnRes.data ?? []).map(t => {
    const raw = (t.merchant_name || t.description || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    // Remove trailing reference numbers/dates that pollute matching
    const cleaned = raw.replace(/\s+\d{6,}.*$/, '').replace(/\s+(dd|ref|mandate)\b.*$/i, '').trim();
    return {
      name: cleaned,
      nameTokens: cleaned.split(/\s+/).filter(Boolean),
      amount: Math.abs(Number(t.amount)),
      date: new Date(t.timestamp),
    };
  });

  // Manual payment overrides (user said "mark X as paid" via Telegram)
  const manualPayments = new Map<string, { amount: number | null; date: string }>();
  for (const mp of (manualRes.data ?? [])) {
    const key = (mp.provider_name ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    manualPayments.set(key, { amount: mp.amount ? Number(mp.amount) : null, date: mp.paid_date });
  }

  // Intelligent matching: a bill is "paid" if we find a transaction this month where:
  //  1. The normalised names share significant overlap (token-based), AND
  //  2. The amount is within 20% of expected (bills fluctuate slightly)
  const matchBillToTransaction = (billName: string, expectedAmount: number) => {
    const normBill = billName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const billTokens = normBill.split(/\s+/).filter(Boolean);
    // Get the most significant token (longest, most unique word — skip common words)
    const COMMON_WORDS = new Set(['ltd', 'limited', 'uk', 'plc', 'the', 'direct', 'debit', 'payment', 'to', 'from', 'card']);
    const significantBillTokens = billTokens.filter(t => t.length >= 3 && !COMMON_WORDS.has(t));

    let bestMatch: { amount: number; date: Date } | null = null;
    let bestScore = 0;

    for (const debit of actualDebits) {
      // Score 1: Token overlap (how many significant bill tokens appear in the transaction name)
      let tokenMatches = 0;
      for (const bt of significantBillTokens) {
        if (debit.name.includes(bt) || debit.nameTokens.some((dt: string) => dt.includes(bt) || bt.includes(dt))) {
          tokenMatches++;
        }
      }
      const tokenScore = significantBillTokens.length > 0 ? tokenMatches / significantBillTokens.length : 0;

      // Score 2: Amount proximity (within 20% tolerance for variable bills like energy)
      const amountDiff = Math.abs(debit.amount - expectedAmount);
      const amountTolerance = expectedAmount * 0.20;
      const amountScore = amountDiff <= amountTolerance ? 1 : amountDiff <= expectedAmount * 0.5 ? 0.5 : 0;

      // Combined: need at least 50% token overlap AND reasonable amount match
      const combined = tokenScore * 0.6 + amountScore * 0.4;
      if (tokenScore >= 0.5 && combined > bestScore) {
        bestScore = combined;
        bestMatch = { amount: debit.amount, date: debit.date };
      }
    }

    // Also check direct exact-ish name match (first 6+ chars) for short provider names
    if (!bestMatch && normBill.length >= 4) {
      const prefix = normBill.substring(0, Math.min(normBill.length, 8));
      for (const debit of actualDebits) {
        if (debit.name.startsWith(prefix) || debit.name.includes(prefix)) {
          const amountDiff = Math.abs(debit.amount - expectedAmount);
          if (amountDiff <= expectedAmount * 0.25) {
            bestMatch = { amount: debit.amount, date: debit.date };
            break;
          }
        }
      }
    }

    return bestMatch;
  };

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let paidCount = 0;
  let unpaidCount = 0;
  let totalExpected = 0;
  let totalPaid = 0;
  let overdueCount = 0;

  const lines: string[] = [];
  const sorted = [...bills].sort((a: any, b: any) => a.billing_day - b.billing_day);

  for (const bill of sorted) {
    const expectedAmount = parseFloat(bill.expected_amount) || 0;
    totalExpected += expectedAmount;

    // Check manual payment override first (user said "mark X as paid" via Telegram)
    const normBillKey = (bill.provider_name ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const manualMatch = (() => {
      for (const [key, mp] of manualPayments) {
        if (normBillKey.includes(key) || key.includes(normBillKey.substring(0, Math.min(normBillKey.length, 8)))) {
          return mp;
        }
      }
      return null;
    })();

    const match = manualMatch
      ? { amount: manualMatch.amount ?? expectedAmount, date: new Date(manualMatch.date) }
      : matchBillToTransaction(bill.provider_name, expectedAmount);
    const billingDay = bill.billing_day || 0;
    const isDue = billingDay <= todayDay;

    let status: string;
    let detail = '';

    if (match) {
      // Bill was paid — check if amount differs from expected
      paidCount++;
      totalPaid += match.amount;
      const diff = match.amount - expectedAmount;
      if (Math.abs(diff) > 1 && !manualMatch) {
        // Amount differs (only flag for bank-matched payments, not manual overrides)
        const direction = diff > 0 ? '⬆️' : '⬇️';
        detail = ` — paid ${fmt(match.amount)} (${direction} ${fmt(Math.abs(diff))} vs expected)`;
      } else {
        detail = manualMatch ? ` — marked as paid manually` : ` — paid ${fmt(match.amount)}`;
      }
      status = '✅';
    } else if (isDue) {
      // Bill was due but no matching transaction found — flag as potentially missed
      unpaidCount++;
      overdueCount++;
      status = '❌';
      detail = ` — *due day ${billingDay}, no payment found*`;
    } else {
      // Bill not yet due
      unpaidCount++;
      status = '⏳';
      const daysUntil = billingDay - todayDay;
      detail = daysUntil === 1 ? ' — due tomorrow' : ` — due in ${daysUntil} days`;
    }

    const day = billingDay ? ` (day ${billingDay})` : '';
    lines.push(`${status} ${bill.provider_name}${day} — *${fmt(expectedAmount)}*${detail}`);
  }

  let text = `*Expected Bills — ${monthLabel}*\n\n`;
  text += lines.join('\n');
  text += `\n\n*Total expected:* ${fmt(totalExpected)}`;
  text += `\n*Paid so far:* ${fmt(totalPaid)} (${paidCount} bills)`;
  text += `\n*Outstanding:* ${unpaidCount} bills`;

  if (overdueCount > 0) {
    text += `\n\n⚠️ *${overdueCount} bill${overdueCount > 1 ? 's' : ''} past due date with no matching payment found.* Check your bank account or these may be overdue.`;
  }

  // Cross-reference with subscriptions that have next_billing_date this month but weren't in expected bills
  const subsDueThisMonth = (subsRes.data ?? []).filter(s => {
    if (!s.next_billing_date) return false;
    const nbd = new Date(s.next_billing_date);
    return nbd.getFullYear() === year && nbd.getMonth() + 1 === month;
  });
  const billNames = new Set(bills.map((b: any) => (b.provider_name || '').toLowerCase().substring(0, 6)));
  const missingSubs = subsDueThisMonth.filter(s => {
    const prefix = (s.provider_name || '').toLowerCase().substring(0, 6);
    return !billNames.has(prefix);
  });
  if (missingSubs.length > 0) {
    text += '\n\n📋 *Also tracked in your subscriptions:*\n';
    for (const s of missingSubs) {
      const nbd = new Date(s.next_billing_date);
      const dayNum = nbd.getDate();
      const isDue = dayNum <= todayDay;
      const subMatch = matchBillToTransaction(s.provider_name, Number(s.amount));
      const icon = subMatch ? '✅' : isDue ? '❌' : '⏳';
      const note = subMatch ? ` — paid ${fmt(subMatch.amount)}` : isDue ? ' — *no payment found*' : '';
      text += `${icon} ${s.provider_name} (day ${dayNum}) — *${fmt(Number(s.amount))}*${note}\n`;
    }
  }

  return { text };
}

async function getOverchargeAssessments(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('overcharge_assessments')
    .select('provider_name, subscription_category, current_price, market_avg_price, overcharge_score, estimated_annual_saving, signals, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('overcharge_score', { ascending: false });

  if (error) {
    return { text: `Unable to load overcharge assessments: ${error.message}` };
  }

  if (!data || data.length === 0) {
    return {
      text: `No active overcharge assessments found. Assessments are generated automatically when you have a connected bank account with recurring payments.`,
    };
  }

  const totalSaving = data.reduce((s, a) => s + (parseFloat(String(a.estimated_annual_saving)) || 0), 0);

  let text = `*Overcharge Assessments*\n`;
  text += `Potential annual saving: *${fmt(totalSaving)}*\n\n`;

  for (const a of data) {
    const score = a.overcharge_score ?? 0;
    const risk = score >= 80 ? '🔴 High' : score >= 60 ? '🟠 Medium' : '🟡 Low';
    text += `*${a.provider_name}* (${a.subscription_category})\n`;
    text += `  Risk: ${risk} | Score: ${score}/100\n`;
    if (a.current_price && a.market_avg_price) {
      text += `  You pay: ${fmt(a.current_price)}/mo | Market avg: ${fmt(a.market_avg_price)}/mo\n`;
    }
    text += `  Potential saving: *${fmt(a.estimated_annual_saving)}/year*\n\n`;
  }

  return { text };
}

async function getProfile(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email, phone, address, postcode, subscription_tier, subscription_status, created_at')
    .eq('id', userId)
    .single();

  if (!profile) {
    return { text: `Profile not found.` };
  }

  const name = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Not set';
  const tier = profile.subscription_tier ?? 'free';
  const tierLabel: Record<string, string> = {
    free: 'Free',
    essential: 'Essential (£4.99/mo)',
    pro: 'Pro (£9.99/mo)',
  };
  const status = profile.subscription_status ?? 'active';
  const memberSince = profile.created_at ? fmtDate(profile.created_at) : 'Unknown';

  let text = `*Your Account Profile*\n\n`;
  text += `*Name:* ${name}\n`;
  text += `*Email:* ${profile.email ?? 'Not set'}\n`;
  text += `*Phone:* ${profile.phone ?? 'Not set'}\n`;
  text += `*Address:* ${[profile.address, profile.postcode].filter(Boolean).join(', ') || 'Not set'}\n\n`;
  text += `*Plan:* ${tierLabel[tier] ?? tier}\n`;
  text += `*Status:* ${status}\n`;
  text += `*Member since:* ${memberSince}\n`;

  if (tier === 'free') {
    text += `\n\n💡 _To unlock bank sync, full monthly spending breakdowns, budget tracking, and smart alerts — upgrade to Essentials (£4.99/mo) or Pro (£9.99/mo) at paybacker.co.uk/dashboard/upgrade_`;
  }

  return { text };
}

async function getTasks(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
  limit?: number,
): Promise<ToolResult> {
  const targetStatus = status && status !== 'all' ? status : null;
  const maxResults = limit ?? 20;

  let query = supabase
    .from('tasks')
    .select('id, title, description, type, status, priority, created_at, provider_name')
    .eq('user_id', userId)
    .neq('type', 'opportunity') // opportunities have their own tool
    .order('created_at', { ascending: false })
    .limit(maxResults);

  if (targetStatus) {
    query = query.eq('status', targetStatus);
  } else {
    query = query.in('status', ['pending', 'pending_review', 'in_progress']);
  }

  const { data, error } = await query;

  if (error) {
    return { text: `Unable to load tasks: ${error.message}` };
  }

  if (!data || data.length === 0) {
    const statusLabel = targetStatus ?? 'pending';
    return { text: `No ${statusLabel} tasks found. Tasks are created when you use the dispute tool, opportunity scanner, or create them manually.` };
  }

  const priorityEmoji: Record<string, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' };

  let text = `*Your Tasks (${data.length})*\n\n`;
  for (const t of data) {
    const p = priorityEmoji[t.priority ?? 'medium'] ?? '🟡';
    const provider = t.provider_name ? ` — ${t.provider_name}` : '';
    text += `${p} *${t.title}*${provider}\n`;
    text += `   ${t.type.replace(/_/g, ' ')} | ${fmtDate(t.created_at)}\n\n`;
  }

  return { text };
}

async function getScannerResults(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  status?: string,
): Promise<ToolResult> {
  const targetStatus = status && status !== 'all' ? status : 'pending_review';

  // Query both task types for opportunity scanner results
  // 'suggested' is used for low-confidence items; both are shown here
  const statusFilter =
    targetStatus === 'pending_review'
      ? ['pending_review', 'suggested']
      : [targetStatus];

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, priority, status, created_at, provider_name')
    .eq('user_id', userId)
    .eq('type', 'opportunity')
    .in('status', statusFilter)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    // Fallback: try money_hub_alerts which the scanner also populates
    const { data: alerts, error: alertErr } = await supabase
      .from('money_hub_alerts')
      .select('id, title, description, type, value_gbp, created_at, metadata')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(25);

    if (alertErr || !alerts || alerts.length === 0) {
      return {
        text: `No email scanner findings yet. Run a scan from paybacker.co.uk/dashboard/scanner to detect overcharges, price increases, and refund opportunities.`,
      };
    }

    const priorityEmoji: Record<string, string> = {
      flight_delay: '✈️', price_increase: '🔴', refund: '💰',
      overcharge: '🔴', forgotten_subscription: '💸', other: '🟡',
    };

    let fallbackText = `*Email Scanner Findings (${alerts.length})*\n\n`;
    for (const item of alerts) {
      const emoji = priorityEmoji[item.type] ?? '🟡';
      fallbackText += `${emoji} *${item.title}*\n`;
      if (item.description) fallbackText += `   ${item.description}\n`;
      if (item.value_gbp && Number(item.value_gbp) > 0) {
        fallbackText += `   Potential saving: *${fmt(item.value_gbp)}/year*\n`;
      }
      fallbackText += `   Found: ${fmtDate(item.created_at)}\n\n`;
    }
    fallbackText += `_Visit paybacker.co.uk/dashboard/scanner to action these findings._`;
    return { text: fallbackText };
  }

  // Also query email_scan_findings for the expanded scanner results
  const { data: extFindings } = await supabase
    .from('email_scan_findings')
    .select('id, finding_type, provider, title, description, amount, due_date, previous_amount, urgency, created_at')
    .eq('user_id', userId)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(20);

  // Dispute correspondence (supplier responses)
  const { data: dispCorr } = await supabase
    .from('dispute_correspondence')
    .select('id, provider, subject, correspondence_type, summary, created_at')
    .eq('user_id', userId)
    .eq('status', 'new')
    .order('created_at', { ascending: false })
    .limit(5);

  // Pending cancellations
  const { data: cancelPending } = await supabase
    .from('cancellation_tracking')
    .select('id, provider, effective_date, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  const hasExtended = (extFindings && extFindings.length > 0) || (dispCorr && dispCorr.length > 0);

  if (!data || data.length === 0) {
    if (!hasExtended) {
      // Also check money_hub_alerts before giving up
      const { data: alerts } = await supabase
        .from('money_hub_alerts')
        .select('id, title, description, type, value_gbp, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);

      if (alerts && alerts.length > 0) {
        const priorityEmoji: Record<string, string> = {
          flight_delay: '✈️', price_increase: '🔴', refund: '💰',
          overcharge: '🔴', forgotten_subscription: '💸', other: '🟡',
        };
        let altText = `*Email Scanner Findings (${alerts.length})*\n\n`;
        for (const item of alerts) {
          const emoji = priorityEmoji[item.type] ?? '🟡';
          altText += `${emoji} *${item.title}*\n`;
          if (item.description) altText += `   ${item.description}\n`;
          if (item.value_gbp && Number(item.value_gbp) > 0) {
            altText += `   Potential saving: *${fmt(item.value_gbp)}/year*\n`;
          }
          altText += `   Found: ${fmtDate(item.created_at)}\n\n`;
        }
        altText += `_Visit paybacker.co.uk/dashboard/scanner to action these findings._`;
        return { text: altText };
      }

      return {
        text: `No email scanner findings yet. Connect Gmail or Outlook on the Scanner page (paybacker.co.uk/dashboard/scanner) to scan for overcharges, price increases, and refund opportunities.`,
      };
    }
  }

  const priorityEmoji: Record<string, string> = { high: '🔴', medium: '🟠', low: '🟡' };
  const typeEmoji: Record<string, string> = {
    bill: '📄', contract: '📋', dispute_response: '📩', cancellation_confirmation: '✅',
    bank_gap: '💸', price_increase: '🔴', flight_delay: '✈️', refund_opportunity: '💰',
    overcharge: '🔴', forgotten_subscription: '💸', renewal: '📅', deal_expiry: '⏰',
  };

  let text = '';
  const totalCount = (data?.length || 0) + (extFindings?.length || 0) + (dispCorr?.length || 0);
  text = `*Email Scanner Findings (${totalCount})*\n\n`;

  // Standard opportunity findings (tasks table)
  for (const item of data || []) {
    const p = priorityEmoji[item.priority ?? 'medium'] ?? '🟡';
    const provider = item.provider_name ? ` — ${item.provider_name}` : '';
    text += `${p} *${item.title}*${provider}\n`;
    try {
      const parsed = JSON.parse(item.description ?? '{}');
      if (parsed.description) text += `   ${parsed.description}\n`;
      if (parsed.amount && parsed.amount > 0) text += `   Potential saving: *${fmt(parsed.amount)}/year*\n`;
    } catch {
      if (item.description && item.description.length < 200) text += `   ${item.description}\n`;
    }
    text += `   Found: ${fmtDate(item.created_at)}\n\n`;
  }

  // Extended findings (bills, contracts, price increases, bank gaps)
  if (extFindings && extFindings.length > 0) {
    // Group by type for cleaner output
    const byType: Record<string, typeof extFindings> = {};
    for (const f of extFindings) {
      if (!byType[f.finding_type]) byType[f.finding_type] = [];
      byType[f.finding_type].push(f);
    }

    const typeLabels: Record<string, string> = {
      bill: 'Bills received', price_increase: 'Price increases', contract: 'Contracts detected',
      bank_gap: 'Not in your bank', cancellation_confirmation: 'Cancellations confirmed',
    };

    for (const [type, items] of Object.entries(byType)) {
      const emoji = typeEmoji[type] ?? '🟡';
      const label = typeLabels[type] ?? type.replace(/_/g, ' ');
      text += `*${label} (${items.length})*\n`;
      for (const f of items.slice(0, 3)) {
        const urgency = f.urgency === 'immediate' ? '🔴 ' : f.urgency === 'soon' ? '🟡 ' : '';
        let line = `${urgency}${emoji} *${f.provider}*`;
        if (f.amount) line += `: ${fmt(f.amount)}`;
        if (f.due_date) line += ` — due ${fmtDate(f.due_date)}`;
        text += `${line}\n`;
        if (f.description) text += `   ${f.description.substring(0, 120)}\n`;
      }
      text += '\n';
    }
  }

  // Dispute correspondence
  if (dispCorr && dispCorr.length > 0) {
    text += `*Supplier responses to disputes (${dispCorr.length})*\n`;
    for (const d of dispCorr) {
      const typeIcon = d.correspondence_type === 'rejection' ? '❌' : d.correspondence_type === 'resolution' ? '✅' : d.correspondence_type === 'escalation' ? '⚠️' : '📩';
      text += `${typeIcon} *${d.provider}*: ${d.subject || 'No subject'}\n`;
      if (d.summary) text += `   ${d.summary.substring(0, 120)}\n`;
    }
    text += '\nAsk me to help draft a follow-up response to any of these.\n\n';
  }

  // Pending cancellation verifications
  if (cancelPending && cancelPending.length > 0) {
    text += `*Pending cancellation verification (${cancelPending.length})*\n`;
    for (const c of cancelPending) {
      const eff = c.effective_date ? ` — effective ${fmtDate(c.effective_date)}` : '';
      text += `⏳ *${c.provider}*${eff}\n`;
    }
    text += '\nI\'m watching your bank statements to confirm these charges stopped.\n\n';
  }

  text += `_Visit paybacker.co.uk/dashboard/scanner to action these findings._`;

  return { text };
}

async function generateCancellationEmail(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider_name: string;
    category: string;
    amount?: number;
    account_email?: string;
  },
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, first_name, last_name, email')
    .eq('id', userId)
    .single();

  const fullName =
    profile?.full_name ??
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ??
    'Customer';

  const CATEGORY_LEGAL_CONTEXT: Record<string, string> = {
    broadband: `Reference Communications Act 2003 and Ofcom General Conditions. If out of contract: confirm right to cancel with 30 days notice. If in contract: request early termination charge details.`,
    mobile: `Reference Communications Act 2003 and Ofcom General Conditions. Request PAC code or STAC code. If out of contract: 30 days notice. If in contract: request early termination charges.`,
    energy: `Reference Ofgem Standards of Conduct and Ofgem Supplier Guaranteed Standards. Request final meter reading and final bill. Ask for any credit balance to be refunded within 10 working days (Ofgem requirement).`,
    insurance: `Reference Consumer Insurance (Disclosure and Representations) Act 2012 and FCA ICOBS. Request confirmation of any pro-rata refund for the unexpired portion.`,
    streaming: `Reference Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. Request confirmation of cancellation and final billing date.`,
    fitness: `Reference Consumer Rights Act 2015. If gym has changed terms or facilities: reference right to cancel due to material change. Request written confirmation of cancellation.`,
    software: `Reference Consumer Contracts Regulations 2013 and Consumer Rights Act 2015 for digital content. Request cancellation confirmation and data deletion rights under GDPR.`,
    mortgage: `Reference FCA Mortgage Conduct of Business rules (MCOB). Request Early Repayment Charge (ERC) statement and full settlement figure.`,
    loan: `Reference Consumer Credit Act 1974, Section 94 (right to early settlement). Request settlement figure and any early repayment charges.`,
    utility: `Reference Water Industry Act 1991 (water) or Ofgem Standards of Conduct (energy). Request final bill and refund of any credit balance.`,
    council_tax: `Reference Council Tax (Administration and Enforcement) Regulations 1992. Write as a formal request to the council, not a consumer cancellation.`,
    gambling: `Reference Gambling Act 2005 and UK Gambling Commission Social Responsibility Code. Request immediate account closure and return of remaining balance.`,
    other: `Reference Consumer Rights Act 2015 and Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013. Request written confirmation of cancellation.`,
  };

  const legalContext = CATEGORY_LEGAL_CONTEXT[params.category] ?? CATEGORY_LEGAL_CONTEXT.other;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const costLine = params.amount ? `Cost: £${params.amount}/month` : '';
  const accountLine = params.account_email ? `Account email: ${params.account_email}` : (profile?.email ? `Account email: ${profile.email}` : '');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Write a formal cancellation letter from a UK consumer to ${params.provider_name}.

Customer name: ${fullName}
Today's date: ${today}
Provider: ${params.provider_name}
Category: ${params.category}
${costLine}
${accountLine}

Legal context:
${legalContext}

Requirements:
- Professional, formal tone
- Use correct legal references for this category (NOT generic Consumer Contracts Regulations unless appropriate)
- Request written confirmation of cancellation and final billing date
- Ask for any refund due
- Under 200 words
- Do NOT include subject line — body only, starting with "Dear ${params.provider_name} Customer Services,"
- Close with "Yours faithfully," and the customer name

Return as JSON: { "subject": "...", "body": "..." }`;

  let subject = `Cancellation Request — ${params.provider_name}`;
  let body = '';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      subject = parsed.subject ?? subject;
      body = parsed.body ?? rawText;
    } else {
      body = rawText;
    }
  } catch (err: any) {
    return { text: `Failed to generate cancellation email: ${err.message}` };
  }

  // Save to tasks for history
  await supabase.from('tasks').insert({
    user_id: userId,
    type: 'cancellation_email',
    title: `Cancellation: ${params.provider_name}`,
    description: `Cancellation email generated for ${params.provider_name} (${params.category})`,
    provider_name: params.provider_name,
    status: 'completed',
    priority: 'medium',
  });

  let text = `*Cancellation Email — ${params.provider_name}*\n\n`;
  text += `*Subject:* ${subject}\n\n`;
  text += `---\n${body}\n---\n\n`;
  text += `_Copy and send this to ${params.provider_name}'s customer services. Keep a record of when you send it._`;

  return { text };
}

// ============================================================
// MONEY HUB WRITE HANDLERS — subscription updates, FAC management
// ============================================================

async function updateSubscription(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider_name: string;
    billing_cycle?: string;
    amount?: number;
    next_billing_date?: string;
  },
): Promise<ToolResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from('subscriptions')
    .select('id, provider_name, billing_cycle, amount, next_billing_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .ilike('provider_name', `%${params.provider_name}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) return { text: `Failed to look up subscription: ${fetchErr.message}` };
  if (!existing) {
    return { text: `No active subscription found matching "${params.provider_name}". Use get_subscriptions to see what's tracked.` };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.billing_cycle) updates.billing_cycle = params.billing_cycle;
  if (params.amount !== undefined) updates.amount = params.amount;
  if (params.next_billing_date) updates.next_billing_date = params.next_billing_date;

  if (Object.keys(updates).length === 1) {
    return { text: 'Nothing to update — please specify a billing cycle, amount, or next billing date.' };
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', existing.id)
    .eq('user_id', userId);

  if (error) return { text: `Failed to update subscription: ${error.message}` };

  const changes: string[] = [];
  if (params.billing_cycle) {
    changes.push(`billing cycle: *${existing.billing_cycle ?? 'monthly'}* → *${params.billing_cycle}*`);
  }
  if (params.amount !== undefined) {
    changes.push(`amount: *${fmt(existing.amount)}* → *${fmt(params.amount)}*`);
  }
  if (params.next_billing_date) {
    changes.push(`next billing date: *${fmtDate(params.next_billing_date)}*`);
  }

  return { text: `Updated *${existing.provider_name}*:\n${changes.map(c => `• ${c}`).join('\n')}` };
}

async function dismissActionItem(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider_name: string; item_type: string },
): Promise<ToolResult> {
  const kw = params.provider_name.toLowerCase();
  const dismissed: string[] = [];
  const tryAll = params.item_type === 'any';

  // 1. Tasks (opportunity type)
  if (tryAll || params.item_type === 'task') {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, provider_name')
      .eq('user_id', userId)
      .eq('type', 'opportunity')
      .in('status', ['pending_review', 'suggested', 'pending']);

    const matches = (tasks ?? []).filter(t =>
      (t.provider_name ?? '').toLowerCase().includes(kw) ||
      (t.title ?? '').toLowerCase().includes(kw),
    );
    if (matches.length > 0) {
      await supabase
        .from('tasks')
        .update({ status: 'dismissed' })
        .in('id', matches.map(t => t.id));
      dismissed.push(`${matches.length} action item${matches.length > 1 ? 's' : ''}`);
    }
  }

  // 2. Email scan findings
  if (tryAll || params.item_type === 'finding') {
    const { data: findings } = await supabase
      .from('email_scan_findings')
      .select('id, provider, title')
      .eq('user_id', userId)
      .in('status', ['new', 'pending_review']);

    const matches = (findings ?? []).filter(f =>
      (f.provider ?? '').toLowerCase().includes(kw) ||
      (f.title ?? '').toLowerCase().includes(kw),
    );
    if (matches.length > 0) {
      await supabase
        .from('email_scan_findings')
        .update({ status: 'dismissed' })
        .in('id', matches.map(f => f.id));
      dismissed.push(`${matches.length} email finding${matches.length > 1 ? 's' : ''}`);
    }
  }

  // 3. Money Hub alerts
  if (tryAll || params.item_type === 'alert') {
    const { data: alerts } = await supabase
      .from('money_hub_alerts')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', 'active')
      .ilike('title', `%${params.provider_name}%`);

    if (alerts && alerts.length > 0) {
      await supabase
        .from('money_hub_alerts')
        .update({ status: 'dismissed' })
        .in('id', alerts.map(a => a.id));
      dismissed.push(`${alerts.length} alert${alerts.length > 1 ? 's' : ''}`);
    }
  }

  if (dismissed.length === 0) {
    return {
      text: `No action centre items found matching "${params.provider_name}". Use get_scanner_results to see what's in your action centre.`,
    };
  }

  return {
    text: `Dismissed ${dismissed.join(' and ')} for *${params.provider_name}* from your action centre. ✅`,
  };
}

async function markBillPaid(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { provider_name: string; amount?: number; paid_date?: string },
): Promise<ToolResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const paidDate = params.paid_date ?? now.toISOString().split('T')[0];

  const { error } = await supabase
    .from('manual_bill_payments')
    .upsert(
      {
        user_id: userId,
        provider_name: params.provider_name,
        year,
        month,
        amount: params.amount ?? null,
        paid_date: paidDate,
      },
      { onConflict: 'user_id,provider_name,year,month' },
    );

  if (error) return { text: `Failed to mark bill as paid: ${error.message}` };

  const amtStr = params.amount ? ` (${fmt(params.amount)})` : '';
  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return {
    text: `Marked *${params.provider_name}*${amtStr} as paid for ${monthLabel}. ✅\nIt will now show as paid in your expected bills.`,
  };
}

async function createSupportTicket(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    subject: string;
    description: string;
    category: string;
    priority: string;
  },
): Promise<ToolResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      subject: params.subject,
      description: params.description,
      category: params.category,
      priority: params.priority,
      source: 'chatbot',
      status: 'open',
      metadata: { channel: 'telegram' },
    })
    .select('id, ticket_number, created_at')
    .single();

  if (error || !ticket) {
    return { text: `Failed to create support ticket: ${error?.message ?? 'Unknown error'}` };
  }

  // Insert first message
  await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'user',
    sender_name: profile?.email ?? 'User',
    message: params.description,
  });

  const ref = ticket.ticket_number || ticket.id.substring(0, 8).toUpperCase();
  const userEmail = profile?.email;
  const userName = profile?.full_name || 'there';

  // Send confirmation email to user
  if (userEmail) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY!);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
        replyTo: 'support@paybacker.co.uk',
        to: userEmail,
        subject: `Support ticket received: ${ref}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0f172a;padding:20px 32px;">
      <table width="100%"><tr>
        <td><span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#f59e0b;">backer</span></span></td>
        <td align="right"><span style="color:#94a3b8;font-size:12px;">${ref}</span></td>
      </tr></table>
    </div>
    <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
      <p style="margin:0 0 12px;">Hi ${userName},</p>
      <p style="margin:0 0 12px;">We have received your support request and a member of our team will get back to you shortly.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:600;">Ticket Reference: #${ref}</p>
        <p style="margin:0 0 4px;"><strong>Subject:</strong> ${params.subject}</p>
        <p style="margin:0 0 4px;"><strong>Priority:</strong> ${params.priority}</p>
        <p style="margin:0;"><strong>Category:</strong> ${params.category}</p>
      </div>
      <p style="margin:0 0 12px;">You can reply to this email to add further details to your ticket.</p>
      <p style="margin:0;color:#64748b;">Best,<br/>The Paybacker Support Team</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      Simply reply to this email if you need to add more details &middot; <a href="https://paybacker.co.uk" style="color:#f59e0b;text-decoration:none;">paybacker.co.uk</a>
    </div>
  </div>
</body></html>`,
      });
    } catch (emailErr) {
      console.error('[createSupportTicket] Failed to send user email:', emailErr);
    }
  }

  // Send notification email to support team
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY!);
    await resend.emails.send({
      from: 'Paybacker System <noreply@paybacker.co.uk>',
      to: 'support@paybacker.co.uk',
      subject: `New support ticket: ${ref} — ${params.subject}`,
      html: `<div style="font-family:sans-serif;padding:20px;max-width:600px;">
        <h2 style="color:#f59e0b;margin:0 0 16px;">New Support Ticket</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;font-weight:bold;">Ticket:</td><td>${ref}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">From:</td><td>${userEmail || 'Unknown'} (${userName})</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Subject:</td><td>${params.subject}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Category:</td><td>${params.category}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Priority:</td><td>${params.priority}</td></tr>
          <tr><td style="padding:8px 0;font-weight:bold;">Source:</td><td>Telegram Bot</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <h3 style="margin:0 0 8px;">Description:</h3>
        <pre style="white-space:pre-wrap;background:#f3f4f6;padding:15px;border-radius:8px;color:#111827;font-size:13px;">${params.description}</pre>
        <p style="color:#6b7280;font-size:12px;margin-top:16px;">View in admin: paybacker.co.uk/dashboard/admin</p>
      </div>`,
    });
  } catch (emailErr) {
    console.error('[createSupportTicket] Failed to send admin email:', emailErr);
  }

  let text = `*Support Ticket Created*\n\n`;
  text += `*Reference:* #${ref}\n`;
  text += `*Subject:* ${params.subject}\n`;
  text += `*Priority:* ${params.priority}\n`;
  text += `*Status:* Open\n\n`;
  text += `Our team will respond within 24 hours. You'll receive an email at ${userEmail ?? 'your registered email'} when we reply.\n\n`;
  text += `_Reply to the confirmation email if you need to add more details._`;

  return { text };
}
