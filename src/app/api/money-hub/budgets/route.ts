import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [budgetsRes, txnRes] = await Promise.all([
    supabase.from('money_hub_budgets').select('*').eq('user_id', user.id),
    supabase.from('bank_transactions')
      .select('amount, description, category, user_category, merchant_name')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('timestamp', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .limit(10000),
  ]);

  const budgets = budgetsRes.data || [];
  const txns = txnRes.data || [];

  if (budgets.length === 0) return NextResponse.json([]);

  // Import the learning engine for runtime categorisation
  const { loadLearnedRules, categoriseWithLearningSync: categorise } = await import('@/lib/learning-engine');
  await loadLearnedRules();

  // Build spending by category using the same logic as the main money-hub API
  const categorySpend: Record<string, number> = {};
  for (const t of txns) {
    const rawCat = t.user_category || '';
    const cat = rawCat || categorise(t.description || '', t.category || '') || 'other';
    const amt = Math.abs(parseFloat(String(t.amount)));
    categorySpend[cat] = (categorySpend[cat] || 0) + amt;
  }

  // Match budgets to spending (case-insensitive)
  const result = budgets.map(b => {
    const budgetCat = (b.category || '').toLowerCase();
    // Direct match
    let spent = categorySpend[budgetCat] || 0;
    // Also check for case variations
    if (spent === 0) {
      for (const [cat, total] of Object.entries(categorySpend)) {
        if (cat.toLowerCase() === budgetCat) {
          spent += total;
        }
      }
    }
    const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
    return {
      ...b,
      spent: parseFloat(spent.toFixed(2)),
      percentage: parseFloat(pct.toFixed(1)),
      remaining: parseFloat((b.monthly_limit - spent).toFixed(2)),
      status: pct > 100 ? 'over_budget' : pct > 80 ? 'warning' : 'on_track',
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase.from('money_hub_budgets').insert({
    user_id: user.id, category: body.category,
    monthly_limit: body.monthly_limit, rollover: body.rollover || false,
    payday_date: body.payday_date || null,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase.from('money_hub_budgets')
    .update({ monthly_limit: body.monthly_limit, rollover: body.rollover, payday_date: body.payday_date })
    .eq('id', body.id).eq('user_id', user.id).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await supabase.from('money_hub_budgets').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ deleted: true });
}
