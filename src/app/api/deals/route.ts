import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/deals?category=broadband — fetch active deals from DB
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

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
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 });
  }

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const deal of deals || []) {
    if (!grouped[deal.category]) grouped[deal.category] = [];
    grouped[deal.category].push(deal);
  }

  return NextResponse.json({ deals: deals || [], grouped });
}
