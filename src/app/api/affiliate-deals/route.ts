import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/affiliate-deals?category=mobile
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  let query = supabase
    .from('affiliate_deals')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });

  return NextResponse.json(data || []);
}

// POST /api/affiliate-deals/click — track a deal click
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const body = await request.json();

  await supabase.from('deal_clicks').insert({
    user_id: user?.id || null,
    provider: body.provider,
    category: body.category,
    deal_id: body.deal_id,
    plan_name: body.plan_name,
  });

  return NextResponse.json({ ok: true });
}
