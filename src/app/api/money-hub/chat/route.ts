import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getAdmin();

  // Check Pro tier
  const { data: profile } = await admin.from('profiles').select('subscription_tier').eq('id', user.id).single();
  if (profile?.subscription_tier !== 'pro') {
    return NextResponse.json({ error: 'Money Hub AI assistant is available on the Pro plan.', upgradeRequired: true }, { status: 403 });
  }

  const { message, history } = await request.json();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  // Gather user's financial context
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [txns, subs, budgets, goals, alerts] = await Promise.all([
    admin.from('bank_transactions').select('amount, description, category, timestamp, user_category, income_type, merchant_name')
      .eq('user_id', user.id).gte('timestamp', startOfMonth).order('timestamp', { ascending: false }).limit(100),
    admin.from('subscriptions').select('provider_name, amount, billing_cycle, category, status')
      .eq('user_id', user.id).is('dismissed_at', null).eq('status', 'active'),
    admin.from('money_hub_budgets').select('category, monthly_limit').eq('user_id', user.id),
    admin.from('money_hub_savings_goals').select('goal_name, target_amount, current_amount').eq('user_id', user.id),
    admin.from('money_hub_alerts').select('title, value_gbp, alert_type').eq('user_id', user.id).eq('status', 'active').limit(5),
  ]);

  const allTxns = txns.data || [];
  const income = allTxns.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const outgoings = allTxns.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

  // Category spending breakdown from actual data
  const catSpend: Record<string, number> = {};
  for (const t of allTxns.filter(t => parseFloat(t.amount) < 0)) {
    const cat = t.user_category || t.category || 'other';
    catSpend[cat] = (catSpend[cat] || 0) + Math.abs(parseFloat(t.amount));
  }
  const catSummary = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: £${v.toFixed(0)}`).join(', ');

  // Income breakdown by type AND by source (sender)
  const incByType: Record<string, number> = {};
  const incBySender: Record<string, { total: number; type: string; count: number }> = {};
  for (const t of allTxns.filter(t => parseFloat(t.amount) > 0)) {
    const type = t.income_type || 'other';
    incByType[type] = (incByType[type] || 0) + parseFloat(t.amount);
    // Group by sender for granular detail
    const sender = (t.description || '').replace(/FP \d.*/, '').replace(/\d{6,}.*/, '').trim().substring(0, 30) || 'Unknown';
    if (!incBySender[sender]) incBySender[sender] = { total: 0, type, count: 0 };
    incBySender[sender].total += parseFloat(t.amount);
    incBySender[sender].count++;
  }
  const incSummary = Object.entries(incByType).sort((a, b) => b[1] - a[1]).map(([t, v]) => `${t}: £${v.toFixed(0)}`).join(', ');
  const incDetail = Object.entries(incBySender).sort((a, b) => b[1].total - a[1].total).slice(0, 10)
    .map(([sender, data]) => `${sender} (${data.type}): £${data.total.toFixed(0)} x${data.count}`).join(', ');

  const subsSummary = (subs.data || []).map(s => `${s.provider_name}: £${s.amount}/${s.billing_cycle}`).join(', ');
  const budgetSummary = (budgets.data || []).map(b => `${b.category}: £${b.monthly_limit}/month`).join(', ');
  const goalsSummary = (goals.data || []).map(g => `${g.goal_name}: £${g.current_amount}/${g.target_amount}`).join(', ');

  const financialContext = `User's ACTUAL financial data this month (from bank transactions):

INCOME: £${income.toFixed(2)} total
- By type: ${incSummary || 'not classified yet'}
- By source: ${incDetail || 'no detail'}

OUTGOINGS: £${outgoings.toFixed(2)} total
- By category: ${catSummary || 'no spending data'}

SAVINGS RATE: ${income > 0 ? (((income - outgoings) / income) * 100).toFixed(1) + '%' : 'N/A'}
SUBSCRIPTIONS: ${(subs.data || []).length} active (${subsSummary || 'none'})
BUDGETS: ${budgetSummary || 'none set'}
GOALS: ${goalsSummary || 'none'}
ALERTS: ${(alerts.data || []).map(a => a.title).join(', ') || 'none'}
TRANSACTIONS: ${allTxns.length} this month

When the user asks about income, give the specific breakdown by source name and type. Do not say "grouped as other" if you have source names.`;

  const systemPrompt = `You are the Paybacker Money Hub AI assistant. You help Pro users manage their finances through conversation.

You can help with:
- Answering questions about their spending ("How much did I spend on eating out?")
- Suggesting budget amounts based on their spending patterns
- Explaining their financial data in plain English
- Recommending actions (cancel subscriptions, set budgets, dispute charges)
- Recategorising transactions when asked

${financialContext}

Rules:
- Be concise and direct. 2-4 sentences unless they ask for detail.
- Use British English and £ symbols.
- When suggesting actions, tell them exactly where to go in the dashboard.
- If they want to set a budget, tell them the amount you'd suggest based on their data.
- If they ask about a specific merchant or category, give them the exact numbers.
- Never use em dashes.
- DASHBOARD WIDGETS: If the user asks you to show, display, or visualise data (e.g. "show me a pie chart of spending", "display my income breakdown"), include a widget command at the END of your response in this exact format:
[WIDGET:{"type":"pie","title":"Spending by Category","data":[{"label":"Groceries","value":450,"color":"#22c55e"},{"label":"Bills","value":320,"color":"#64748b"}]}]

Widget types: "pie" (pie chart), "bar" (horizontal bars), "stat" (big number with label).
For "stat" type: {"type":"stat","title":"Total Saved","data":{"value":"£1,234","label":"this month"}}
For "bar" type: {"type":"bar","title":"Top Spending","data":[{"label":"Groceries","value":450,"color":"#22c55e"}]}

Use REAL data from the user's financial context. Only include a widget when explicitly asked for a visualisation.
- USER NOTES: If the user tells you something personal or relevant about their finances that would be useful to remember (e.g. "I'm saving for a house", "my salary is paid on the 25th"), include at the END of your response: [NOTE:the relevant fact to remember]
These notes help you give better advice in future conversations.`;

  const messages = [
    ...(history || []).map((h: any) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user' as const, content: message },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0];
  if (text.type !== 'text') return NextResponse.json({ error: 'Unexpected response' }, { status: 500 });

  return NextResponse.json({ reply: text.text });
}
