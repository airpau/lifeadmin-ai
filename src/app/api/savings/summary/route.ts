import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: savings, error } = await supabase
    .from('verified_savings')
    .select('*')
    .eq('user_id', user.id)
    .order('confirmed_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = savings || [];
  const totalSaved = entries.reduce((s, e) => s + (Number(e.amount_saved) || 0), 0);
  const annualRecurring = entries.reduce((s, e) => s + (Number(e.annual_saving) || 0), 0);
  const monthlyRecurring = annualRecurring / 12;

  const byType: Record<string, number> = {};
  for (const e of entries) {
    byType[e.saving_type] = (byType[e.saving_type] || 0) + (Number(e.amount_saved) || 0);
  }

  return NextResponse.json({
    totalSaved,
    monthlyRecurring,
    annualRecurring,
    count: entries.length,
    byType,
    timeline: entries.slice(0, 20),
  });
}
