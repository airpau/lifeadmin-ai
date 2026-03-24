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

  // Income breakdown
  const incByType: Record<string, number> = {};
  for (const t of allTxns.filter(t => parseFloat(t.amount) > 0)) {
    const type = t.income_type || 'other';
    incByType[type] = (incByType[type] || 0) + parseFloat(t.amount);
  }
  const incSummary = Object.entries(incByType).map(([t, v]) => `${t}: £${v.toFixed(0)}`).join(', ');

  const subsSummary = (subs.data || []).map(s => `${s.provider_name}: £${s.amount}/${s.billing_cycle}`).join(', ');
  const budgetSummary = (budgets.data || []).map(b => `${b.category}: £${b.monthly_limit}/month`).join(', ');
  const goalsSummary = (goals.data || []).map(g => `${g.goal_name}: £${g.current_amount}/${g.target_amount}`).join(', ');

  const financialContext = `User's ACTUAL financial data this month (from bank transactions):
- Total income: £${income.toFixed(2)} (${incSummary || 'breakdown unavailable'})
- Total outgoings: £${outgoings.toFixed(2)}
- Net position: £${(income - outgoings).toFixed(2)}
- Spending by category: ${catSummary || 'no spending data'}
- Active subscriptions (${(subs.data || []).length}): ${subsSummary || 'none'}
- Budget limits: ${budgetSummary || 'none set'}
- Savings goals: ${goalsSummary || 'none'}
- Active alerts: ${(alerts.data || []).map(a => a.title).join(', ') || 'none'}
- Total transactions this month: ${allTxns.length}`;

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
- Never use em dashes.`;

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
