import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const DESC_CATS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['mortgage', 'lendinvest', 'skipton b.s'], category: 'mortgage' },
  { keywords: ['natwest loan', 'santander loans', 'novuna', 'ca auto finance', 'tesco bank'], category: 'loans' },
  { keywords: ['council', 'winchester city'], category: 'council_tax' },
  { keywords: ['british gas', 'eon', 'octopus', 'ovo', 'edf', 'scottish power'], category: 'energy' },
  { keywords: ['thames water', 'severn trent'], category: 'water' },
  { keywords: ['sky broadband', 'virgin media', 'bt broadband', 'communityfibre'], category: 'broadband' },
  { keywords: ['vodafone', 'ee ', 'three', 'o2 ', 'giffgaff'], category: 'mobile' },
  { keywords: ['netflix', 'spotify', 'disney', 'amazon prime', 'apple', 'youtube'], category: 'streaming' },
  { keywords: ['gym', 'puregym', 'david lloyd', 'whoop', 'peloton'], category: 'fitness' },
  { keywords: ['tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'morrisons', 'waitrose', 'ocado'], category: 'groceries' },
  { keywords: ['deliveroo', 'just eat', 'uber eats', 'mcdonald', 'starbucks', 'costa', 'pret'], category: 'eating_out' },
  { keywords: ['petrol', 'shell ', 'bp ', 'esso', 'fuel'], category: 'fuel' },
  { keywords: ['insurance', 'admiral', 'aviva', 'direct line'], category: 'insurance' },
  { keywords: ['dvla', 'trainline', 'tfl', 'uber', 'bolt', 'parking'], category: 'transport' },
  { keywords: ['hmrc'], category: 'tax' },
  { keywords: ['amazon', 'ebay', 'asos', 'argos', 'currys'], category: 'shopping' },
];

function categorise(desc: string, bankCat: string): string {
  const d = desc.toLowerCase();
  for (const { keywords, category } of DESC_CATS) {
    if (keywords.some(kw => d.includes(kw))) return category;
  }
  const MAP: Record<string, string> = { PURCHASE: 'shopping', DEBIT: 'shopping', DIRECT_DEBIT: 'bills', STANDING_ORDER: 'bills', CREDIT: 'income' };
  return MAP[bankCat] || 'other';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const months = parseInt(searchParams.get('months') || '1');

  const admin = getAdmin();
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const { data: txns } = await admin.from('bank_transactions')
    .select('id, amount, description, category, timestamp, merchant_name')
    .eq('user_id', user.id)
    .gte('timestamp', since.toISOString())
    .order('timestamp', { ascending: false })
    .limit(500);

  let filtered = (txns || []).map(t => ({
    ...t,
    spending_category: categorise(t.description || '', t.category || ''),
    amount: parseFloat(t.amount),
  }));

  if (category) {
    filtered = filtered.filter(t => t.spending_category === category);
  }

  // Merchant breakdown within category
  const merchantTotals: Record<string, { total: number; count: number }> = {};
  for (const t of filtered) {
    if (t.amount >= 0) continue; // skip income
    const merchant = t.merchant_name || (t.description || '').substring(0, 30).trim();
    if (!merchantTotals[merchant]) merchantTotals[merchant] = { total: 0, count: 0 };
    merchantTotals[merchant].total += Math.abs(t.amount);
    merchantTotals[merchant].count++;
  }

  const merchants = Object.entries(merchantTotals)
    .map(([name, data]) => ({ merchant: name, total: parseFloat(data.total.toFixed(2)), count: data.count }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    transactions: filtered.slice(0, 100).map(t => ({
      id: t.id,
      description: t.description,
      merchant: t.merchant_name,
      amount: t.amount,
      category: t.spending_category,
      date: t.timestamp?.substring(0, 10),
    })),
    merchants,
    totalTransactions: filtered.length,
    totalSpent: parseFloat(filtered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2)),
  });
}
