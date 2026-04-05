import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

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
      return getDeals(supabase, toolInput.category as string | undefined);
    case 'get_upcoming_payments':
      return getUpcomingPayments(supabase, userId, toolInput.days as number | undefined);
    case 'get_savings_goals':
      return getSavingsGoals(supabase, userId);
    case 'get_savings_challenges':
      return getSavingsChallenges(supabase, userId);
    case 'get_bank_connections':
      return getBankConnections(supabase, userId);
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
  const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = targetMonth.split('-').map(Number);

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();

  // Previous month for comparison
  const prevDate = new Date(year, mon - 2, 1).toISOString();

  const [current, previous, connections] = await Promise.all([
    supabase
      .from('bank_transactions')
      .select('category, amount, merchant_name')
      .eq('user_id', userId)
      .lt('amount', 0) // debits only
      .gte('timestamp', startDate)
      .lt('timestamp', endDate),
    supabase
      .from('bank_transactions')
      .select('category, amount')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', prevDate)
      .lt('timestamp', startDate),
    supabase
      .from('bank_connections')
      .select('bank_name, status, last_synced_at')
      .eq('user_id', userId),
  ]);

  const connData = connections.data ?? [];
  const EXPIRED_STATUSES = ['expired', 'expired_legacy', 'revoked'];
  const allExpired = connData.length > 0 && connData.every(c => EXPIRED_STATUSES.includes(c.status));
  const noneConnected = connData.length === 0;

  if (!current.data || current.data.length === 0) {
    if (noneConnected) {
      return {
        text: `No bank transactions found for ${targetMonth}. Connect a bank account at paybacker.co.uk/dashboard/money-hub to start tracking spending.`,
      };
    }
    // User has/had a connection — data exists in other months but not this one
    const lastSync = connData.reduce((latest: string | null, c) => {
      if (!c.last_synced_at) return latest;
      return !latest || c.last_synced_at > latest ? c.last_synced_at : latest;
    }, null);
    const lastSyncStr = lastSync ? ` (last synced ${fmtDate(lastSync)})` : '';
    if (allExpired) {
      return {
        text: `No stored transactions found for ${targetMonth}. Your bank connection has expired${lastSyncStr} — reconnect at paybacker.co.uk/dashboard/money-hub to sync the latest data.`,
      };
    }
    return {
      text: `No transactions found for ${targetMonth}. Your bank account is connected and transactions will appear once synced.`,
    };
  }

  // Group by category
  const totals: Record<string, number> = {};
  for (const t of current.data) {
    const cat = t.category ?? 'Other';
    totals[cat] = (totals[cat] ?? 0) + Math.abs(Number(t.amount));
  }

  const prevTotals: Record<string, number> = {};
  for (const t of previous.data ?? []) {
    const cat = t.category ?? 'Other';
    prevTotals[cat] = (prevTotals[cat] ?? 0) + Math.abs(Number(t.amount));
  }

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(totals).sort(([, a], [, b]) => b - a);

  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  let text = `*Spending Summary — ${monthLabel}*\n`;
  text += `Total: *${fmt(grandTotal)}*\n\n`;

  for (const [cat, amount] of sorted) {
    const prev = prevTotals[cat] ?? 0;
    const diff = amount - prev;
    const arrow = diff > 1 ? ` ▲${fmt(diff)}` : diff < -1 ? ` ▼${fmt(Math.abs(diff))}` : '';
    text += `• ${cat}: *${fmt(amount)}*${arrow}\n`;
  }

  if (allExpired) {
    text += `\n_Note: Bank connection expired — this data is from before the connection lapsed. Reconnect at paybacker.co.uk/dashboard/money-hub to sync newer transactions._`;
  }

  return { text };
}

async function listTransactions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: { month?: string; category?: string; merchant?: string; limit?: number },
): Promise<ToolResult> {
  const now = new Date();
  const targetMonth = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = targetMonth.split('-').map(Number);

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  const maxResults = params.limit ?? 25;

  let query = supabase
    .from('bank_transactions')
    .select('id, merchant_name, amount, category, user_category, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', startDate)
    .lt('timestamp', endDate)
    .order('timestamp', { ascending: false })
    .limit(maxResults);

  if (params.category) {
    query = query.ilike('category', params.category);
  }
  if (params.merchant) {
    query = query.ilike('merchant_name', `%${params.merchant}%`);
  }

  const [txResult, connResult] = await Promise.all([
    query,
    supabase.from('bank_connections').select('status, last_synced_at').eq('user_id', userId),
  ]);

  const { data, error } = txResult;
  const connData = connResult.data ?? [];
  const EXPIRED_STATUSES = ['expired', 'expired_legacy', 'revoked'];
  const allExpired = connData.length > 0 && connData.every(c => EXPIRED_STATUSES.includes(c.status));
  const noneConnected = connData.length === 0;

  if (error || !data || data.length === 0) {
    const filterDesc = `${params.category ? ` in ${params.category}` : ''}${params.merchant ? ` matching "${params.merchant}"` : ''}`;
    if (noneConnected) {
      return { text: `No transactions found for ${targetMonth}${filterDesc}. Connect a bank account at paybacker.co.uk/dashboard/money-hub` };
    }
    if (allExpired) {
      const lastSync = connData.reduce((latest: string | null, c) => {
        if (!c.last_synced_at) return latest;
        return !latest || c.last_synced_at > latest ? c.last_synced_at : latest;
      }, null);
      const lastSyncStr = lastSync ? ` (last synced ${fmtDate(lastSync)})` : '';
      return { text: `No transactions found for ${targetMonth}${filterDesc}. Bank connection expired${lastSyncStr} — reconnect at paybacker.co.uk/dashboard/money-hub to sync newer data.` };
    }
    return { text: `No transactions found for ${targetMonth}${filterDesc}.` };
  }

  const monthLabel = new Date(year, mon - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let text = `*Transactions — ${monthLabel}*`;
  if (params.category) text += ` (${params.category})`;
  if (params.merchant) text += ` matching "${params.merchant}"`;
  text += `\n\n`;

  let total = 0;
  for (const t of data) {
    const amt = Number(t.amount);
    total += amt;
    const date = new Date(t.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    const isDebit = amt < 0;
    const effectiveCategory = t.user_category || t.category || 'other';
    text += `\`${t.id.slice(0, 8)}\` · ${date} · ${t.merchant_name ?? 'Unknown'} · ${isDebit ? '-' : '+'}${fmt(Math.abs(amt))} · ${effectiveCategory}\n`;
  }

  text += `\n*Total: ${total < 0 ? '-' : ''}${fmt(Math.abs(total))}* (${data.length} transaction${data.length !== 1 ? 's' : ''})\n`;
  text += `_To recategorise a transaction, use its 8-character ID prefix._`;

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

  // Deduplicate by normalised provider name (same as website)
  const seen = new Set<string>();
  const deduped = data.filter(s => {
    const key = s.provider_name.toLowerCase().replace(/[^a-z0-9]/g, '');
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
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const [budgets, transactions] = await Promise.all([
    supabase
      .from('money_hub_budgets')
      .select('category, monthly_limit')
      .eq('user_id', userId),
    supabase
      .from('bank_transactions')
      .select('category, amount')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', startDate)
      .lt('timestamp', endDate),
  ]);

  if (!budgets.data || budgets.data.length === 0) {
    return {
      text: 'No budgets set up yet. Create budgets at paybacker.co.uk/dashboard/money-hub',
    };
  }

  const spent: Record<string, number> = {};
  for (const t of transactions.data ?? []) {
    const cat = t.category ?? 'Other';
    spent[cat] = (spent[cat] ?? 0) + Math.abs(Number(t.amount));
  }

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  let text = `*Budget Status — ${monthLabel}*\n\n`;

  for (const b of budgets.data) {
    const limit = Number(b.monthly_limit);
    const spentAmt = spent[b.category] ?? 0;
    const over = spentAmt > limit;
    const emoji = over ? '🔴' : spentAmt / limit > 0.8 ? '🟡' : '🟢';
    text += `${emoji} *${b.category}*\n`;
    text += `   ${blockBar(spentAmt, limit)} ${fmt(spentAmt)} / ${fmt(limit)}`;
    if (over) text += ` _(over by ${fmt(spentAmt - limit)})_`;
    text += '\n';
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
  text += `Total annual impact: *${fmt(totalImpact)}*\n\n`;

  for (const a of data) {
    text += `🔺 *${a.merchant_name ?? 'Unknown'}*\n`;
    text += `   ${fmt(a.old_amount)}/mo → ${fmt(a.new_amount)}/mo`;
    text += ` (+${Number(a.increase_pct).toFixed(0)}%) · ${fmt(a.annual_impact)}/year extra\n`;
    text += `   Detected: ${fmtDate(a.new_date)}\n`;
  }

  return { text };
}

// ============================================================
// ACTION HANDLERS
// ============================================================

async function draftDisputeLetter(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  params: {
    provider: string;
    issue_description: string;
    desired_outcome: string;
    issue_type: string;
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

  // Use Claude Sonnet for letter quality
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const letterPrompt = `Write a professional complaint letter from a UK consumer to ${params.provider}.

Customer name: ${fullName}
Customer address: ${profile?.address ?? '[Address]'}, ${profile?.postcode ?? '[Postcode]'}
Issue: ${params.issue_description}
Desired outcome: ${params.desired_outcome}
Letter type: ${params.issue_type.replace(/_/g, ' ')}

Requirements:
- Formal, professional tone
- Cite specific UK consumer law (Consumer Rights Act 2015, relevant sector regulations like Ofgem/Ofcom rules)
- Reference specific legislation sections where applicable
- State the desired outcome clearly and the timeframe for response (14 days)
- Mention escalation path (relevant ombudsman/regulator) if not resolved
- Include placeholders for date and account number where needed
- Keep under 400 words
- Do NOT include a subject line — the letter body only, starting with "Dear [Provider Name] Customer Services,"`;

  const letterResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
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

  const preview = letterText.length > 800
    ? letterText.slice(0, 800) + '...\n\n_[Letter truncated — full version saved on approval]_'
    : letterText;

  return {
    text: `*Draft letter for ${params.provider}:*\n\n${preview}`,
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
    dbQuery = dbQuery.or(`category.ilike.%${category}%,subcategory.ilike.%${category}%`);
  }

  // Text search in summary
  if (query) {
    dbQuery = dbQuery.or(
      `summary.ilike.%${query}%,law_name.ilike.%${query}%,applies_to.cs.{${query}}`,
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
  const { data, error } = await supabase
    .from('bank_transactions')
    .update({ category: newCategory })
    .eq('user_id', userId)
    .ilike('merchant_name', `%${merchantName}%`)
    .select('id');

  if (error) {
    return { text: `Failed to recategorise: ${error.message}` };
  }

  const count = data?.length ?? 0;
  if (count === 0) {
    return { text: `No transactions found matching "${merchantName}". Check the spelling or try a shorter name.` };
  }

  // Also add/update merchant_rules so future transactions auto-categorise
  await supabase.from('merchant_rules').upsert(
    {
      pattern: merchantName.toLowerCase(),
      category: newCategory,
      display_name: merchantName,
      source: 'telegram',
    },
    { onConflict: 'pattern' },
  ).then(() => {});

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
  const totalSpending = txs.filter(t => Number(t.amount) < 0).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const totalIncome = txs.filter(t => Number(t.amount) > 0).reduce((sum, t) => sum + Number(t.amount), 0);

  const totalSaved = (savings.data ?? []).reduce((sum, s) => sum + Number(s.amount_saved ?? 0), 0);
  const annualSaved = (savings.data ?? []).reduce((sum, s) => sum + Number(s.annual_saving ?? 0), 0);

  // Category breakdown (top 5)
  const catTotals: Record<string, number> = {};
  for (const t of txs.filter(t => Number(t.amount) < 0)) {
    const cat = t.category ?? 'other';
    catTotals[cat] = (catTotals[cat] ?? 0) + Math.abs(Number(t.amount));
  }
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
  const { data, error } = await supabase
    .from('bank_connections')
    .select('bank_name, status, last_synced_at, connected_at, account_display_names, consent_expires_at')
    .eq('user_id', userId)
    .order('connected_at', { ascending: false });

  if (error || !data || data.length === 0) {
    return { text: 'No bank accounts connected. Connect one at paybacker.co.uk/dashboard/subscriptions' };
  }

  const statusEmoji: Record<string, string> = {
    active: '🟢', expired: '🔴', expiring_soon: '🟡', revoked: '⚫', expired_legacy: '⚫',
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
  for (const t of data) {
    const d = new Date(t.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyData[key]) monthlyData[key] = { income: 0, spending: 0 };
    const amt = Number(t.amount);
    if (amt > 0) monthlyData[key].income += amt;
    else monthlyData[key].spending += Math.abs(amt);
  }

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
  const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = targetMonth.split('-').map(Number);

  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();

  const { data, error } = await supabase
    .from('bank_transactions')
    .select('merchant_name, amount, category, timestamp')
    .eq('user_id', userId)
    .gt('amount', 0)
    .gte('timestamp', startDate)
    .lt('timestamp', endDate)
    .order('amount', { ascending: false });

  if (error || !data || data.length === 0) {
    return { text: `No income found for ${targetMonth}.` };
  }

  const total = data.reduce((sum, t) => sum + Number(t.amount), 0);

  const sources: Record<string, number> = {};
  for (const t of data) {
    const source = t.merchant_name ?? t.category ?? 'Other';
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
  params: { provider: string; new_status: string; notes?: string; money_recovered?: number },
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
  category?: string,
): Promise<ToolResult> {
  let query = supabase
    .from('affiliate_deals')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }

  const { data: deals, error } = await query;

  if (error) {
    return { text: `Failed to fetch deals: ${error.message}` };
  }

  if (!deals || deals.length === 0) {
    const catLabel = category ? ` for ${category}` : '';
    return { text: `No deals available${catLabel} right now. Check back soon — new offers are added regularly.` };
  }

  // Group by category
  const grouped: Record<string, typeof deals> = {};
  for (const deal of deals) {
    if (!grouped[deal.category]) grouped[deal.category] = [];
    grouped[deal.category].push(deal);
  }

  let text = `*Deals available on Paybacker*\n\n`;

  for (const [cat, catDeals] of Object.entries(grouped)) {
    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ');
    text += `*${catLabel}*\n`;
    for (const deal of catDeals) {
      text += `• *${deal.provider}* — ${deal.plan_name}: ${fmt(deal.price_monthly)}/mo`;
      if (deal.price_promotional && deal.price_promotional < deal.price_monthly) {
        text += ` (was ${fmt(deal.price_monthly)}, now ${fmt(deal.price_promotional)}/${deal.promotional_period ?? 'promo'})`;
      }
      if (deal.speed_mbps) text += ` · ${deal.speed_mbps}Mbps`;
      if (deal.data_allowance) text += ` · ${deal.data_allowance}`;
      if (deal.contract_length) text += ` · ${deal.contract_length}`;
      text += `\n`;
    }
    text += `\n`;
  }

  text += `View all deals at paybacker.co.uk/deals`;
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
  let txnQuery = supabase
    .from('bank_transactions')
    .select('id, merchant_name, amount, category, user_category')
    .eq('user_id', userId);

  if (transactionId.length < 36) {
    txnQuery = txnQuery.ilike('id', transactionId + '%');
  } else {
    txnQuery = txnQuery.eq('id', transactionId);
  }

  const { data: matches, error: fetchError } = await txnQuery.limit(2);

  if (fetchError || !matches || matches.length === 0) {
    return { text: `Transaction not found. Use list_transactions to find the transaction ID first.` };
  }
  if (matches.length > 1) {
    return { text: `"${transactionId}" matches more than one transaction. Provide more characters of the ID to narrow it down.` };
  }
  const txn = matches[0];

  const { error: updateError } = await supabase
    .from('bank_transactions')
    .update({ user_category: newCategory })
    .eq('id', transactionId)
    .eq('user_id', userId);

  if (updateError) {
    return { text: `Failed to recategorise: ${updateError.message}` };
  }

  // Persist override so it survives future syncs
  await supabase.from('money_hub_category_overrides').insert({
    user_id: userId,
    merchant_pattern: 'txn_specific',
    user_category: newCategory,
    transaction_id: transactionId,
  });

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
  const todayStr = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('subscriptions')
    .select('provider_name, amount, billing_cycle, next_billing_date, category')
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('next_billing_date', 'is', null)
    .gte('next_billing_date', todayStr)
    .lte('next_billing_date', endStr)
    .order('next_billing_date', { ascending: true });

  if (error || !data || data.length === 0) {
    return { text: `No payments due in the next ${windowDays} days.` };
  }

  const LOAN_CATEGORIES = new Set(['mortgage', 'loan']);
  const BILL_CATEGORIES = new Set(['utility', 'council_tax', 'water', 'broadband', 'mobile', 'bills']);
  const FINANCE_KEYWORDS = ['mortgage', 'loan', 'finance', 'credit card', 'lendinvest', 'skipton', 'novuna', 'zopa', 'barclaycard', 'mbna', 'amex', 'american express', 'securepay'];

  const getType = (name: string, category: string | null): string => {
    const lower = name.toLowerCase();
    if (FINANCE_KEYWORDS.some((kw) => lower.includes(kw))) return 'loan';
    if (LOAN_CATEGORIES.has(category ?? '')) return 'loan';
    if (BILL_CATEGORIES.has(category ?? '')) return 'bill';
    return 'subscription';
  };

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const fmtPaymentDate = (dateStr: string): string => {
    const d = new Date(`${dateStr}T00:00:00`);
    return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  };

  const total = data.reduce((sum, s) => sum + Math.abs(Number(s.amount)), 0);
  const label = windowDays === 7 ? 'this week' : `in the next ${windowDays} days`;

  let text = `\u{1F4B0} *Upcoming payments ${label}:*\n`;
  for (const s of data) {
    const dateLabel = fmtPaymentDate(s.next_billing_date);
    const type = getType(s.provider_name, s.category);
    const typeLabel = type !== 'subscription' ? ` _(${type})_` : '';
    text += `\n\u{1F4C5} ${dateLabel} \u2014 *${s.provider_name}*: ${fmt(Number(s.amount))}${typeLabel}`;
  }

  text += `\n\n*Total due: ${fmt(total)}*`;
  text += '\n\n_Reply "details [payment name]" for more info._';

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
  // Default to previous month
  const targetDate = month
    ? (() => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1); })()
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1;
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

function normaliseMerchantName(name: string): string {
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
  const na = normaliseMerchantName(a);
  const nb = normaliseMerchantName(b);
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
