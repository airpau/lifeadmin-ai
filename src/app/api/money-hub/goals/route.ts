import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase.from('money_hub_savings_goals')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase.from('money_hub_savings_goals').insert({
    user_id: user.id, goal_name: body.goal_name,
    target_amount: body.target_amount, current_amount: body.current_amount || 0,
    target_date: body.target_date || null, emoji: body.emoji || null,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const update: Record<string, any> = {};
  if (body.current_amount !== undefined) update.current_amount = body.current_amount;
  if (body.target_amount !== undefined) update.target_amount = body.target_amount;
  if (body.goal_name !== undefined) update.goal_name = body.goal_name;
  if (body.target_date !== undefined) update.target_date = body.target_date;

  const { data, error } = await supabase.from('money_hub_savings_goals')
    .update(update).eq('id', body.id).eq('user_id', user.id).select('*').single();

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

  await supabase.from('money_hub_savings_goals').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ deleted: true });
}
