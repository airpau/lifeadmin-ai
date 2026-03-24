import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Assets CRUD
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [assets, liabilities] = await Promise.all([
    supabase.from('money_hub_assets').select('*').eq('user_id', user.id),
    supabase.from('money_hub_liabilities').select('*').eq('user_id', user.id),
  ]);

  const totalAssets = (assets.data || []).reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0);
  const totalLiabilities = (liabilities.data || []).reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);

  return NextResponse.json({
    assets: assets.data || [],
    liabilities: liabilities.data || [],
    totalAssets: parseFloat(totalAssets.toFixed(2)),
    totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
    netWorth: parseFloat((totalAssets - totalLiabilities).toFixed(2)),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (body.type === 'asset') {
    const { data, error } = await supabase.from('money_hub_assets').insert({
      user_id: user.id, asset_type: body.asset_type,
      asset_name: body.asset_name, estimated_value: body.estimated_value,
    }).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  if (body.type === 'liability') {
    const { data, error } = await supabase.from('money_hub_liabilities').insert({
      user_id: user.id, liability_type: body.liability_type,
      liability_name: body.liability_name, outstanding_balance: body.outstanding_balance,
      monthly_payment: body.monthly_payment, interest_rate: body.interest_rate,
    }).select('*').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  return NextResponse.json({ error: 'type must be asset or liability' }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type');
  if (!id || !type) return NextResponse.json({ error: 'id and type required' }, { status: 400 });

  const table = type === 'asset' ? 'money_hub_assets' : 'money_hub_liabilities';
  await supabase.from(table).delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ deleted: true });
}
