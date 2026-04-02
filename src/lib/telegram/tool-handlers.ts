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
      return getSubscriptions(supabase, userId, toolInput.filter as string | undefined);
    case 'get_disputes':
      return getDisputes(supabase, userId, toolInput.status as string | undefined);
    case 'get_contracts':
      return getContracts(supabase, userId, toolInput.provider as string | undefined);
    case 'get_budget_status':
      return getBudgetStatus(supabase, userId);
    case 'get_upcoming_renewals':
      return getUpcomingRenewals(supabase, userId);
    case 'get_price_alerts':
      return getPriceAlerts(supabase, userId);
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

  const [current, previous] = await Promise.all([
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
  ]);

  if (!current.data || current.data.length === 0) {
    return {
      text: `No bank transactions found for ${targetMonth}. Connect a bank account at paybacker.co.uk/dashboard to see spending data.`,
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
    .select('merchant_name, amount, category, timestamp')
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

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { text: `No transactions found for ${targetMonth}${params.category ? ` in ${params.category}` : ''}${params.merchant ? ` matching "${params.merchant}"` : ''}.` };
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
    text += `${date} · ${t.merchant_name ?? 'Unknown'} · ${isDebit ? '-' : '+'}${fmt(Math.abs(amt))} · ${t.category ?? 'other'}\n`;
  }

  text += `\n*Total: ${total < 0 ? '-' : ''}${fmt(Math.abs(total))}* (${data.length} transaction${data.length !== 1 ? 's' : ''})`;

  return { text };
}

async function getSubscriptions(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
  filter?: string,
): Promise<ToolResult> {
  const effectiveFilter = filter ?? 'active';

  let query = supabase
    .from('subscriptions')
    .select(
      'provider_name, amount, billing_cycle, next_billing_date, status, contract_end_date, provider_type',
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

  const { data, error } = await query.limit(25);
  if (error || !data || data.length === 0) {
    return { text: 'No subscriptions found.' };
  }

  const totalMonthly = data
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => {
      const amt = Number(s.amount);
      if (s.billing_cycle === 'monthly') return sum + amt;
      if (s.billing_cycle === 'quarterly') return sum + amt / 3;
      if (s.billing_cycle === 'yearly') return sum + amt / 12;
      return sum;
    }, 0);

  let text = `*Subscriptions (${effectiveFilter})*\n`;
  if (effectiveFilter !== 'cancelled') {
    text += `Monthly total: *${fmt(totalMonthly)}* | Annual: *${fmt(totalMonthly * 12)}*\n\n`;
  } else {
    text += '\n';
  }

  for (const s of data) {
    const renewal = s.next_billing_date ? `Renews ${fmtDate(s.next_billing_date)}` : '';
    const end = s.contract_end_date ? `Ends ${fmtDate(s.contract_end_date)}` : renewal;
    const cycle = s.billing_cycle ?? 'monthly';
    text += `• *${s.provider_name}* — ${fmt(s.amount)}/${cycle}`;
    if (end) text += ` (${end})`;
    if (s.status !== 'active') text += ` [${s.status}]`;
    text += '\n';
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
): Promise<ToolResult> {
  let query = supabase
    .from('subscriptions')
    .select(
      'provider_name, contract_type, contract_end_date, contract_start_date, amount, billing_cycle, auto_renews, early_exit_fee, provider_type',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .not('contract_end_date', 'is', null)
    .order('contract_end_date', { ascending: true })
    .limit(20);

  if (provider) {
    query = query.ilike('provider_name', `%${provider}%`);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return { text: 'No contracts found. Add contracts in the dashboard at paybacker.co.uk/dashboard/subscriptions' };
  }

  const now = new Date();
  let text = `*Contracts (${data.length})*\n\n`;

  for (const c of data) {
    const endDate = new Date(c.contract_end_date);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const urgency = daysLeft <= 7 ? '🔴' : daysLeft <= 30 ? '🟡' : '🟢';
    const cycle = c.billing_cycle ?? 'monthly';
    text += `${urgency} *${c.provider_name}*`;
    if (c.contract_type && c.contract_type !== 'subscription') {
      text += ` (${c.contract_type.replace(/_/g, ' ')})`;
    }
    text += `\n   ${fmt(c.amount)}/${cycle} · Ends ${fmtDate(c.contract_end_date)} (${daysLeft} days)`;
    if (c.auto_renews) text += ' · Auto-renews';
    if (c.early_exit_fee && Number(c.early_exit_fee) > 0) {
      text += ` · Exit fee: ${fmt(c.early_exit_fee)}`;
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
