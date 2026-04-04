import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/contracts — create a manual contract entry
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const {
    provider_name, contract_type, contract_start_date, contract_end_date,
    monthly_cost, auto_renewal, subscription_id,
  } = body;

  if (!provider_name) {
    return NextResponse.json({ error: 'Missing provider_name' }, { status: 400 });
  }

  const annualCost = monthly_cost ? parseFloat(monthly_cost) * 12 : null;

  const { data: extraction, error } = await supabase
    .from('contract_extractions')
    .insert({
      user_id: user.id,
      subscription_id: subscription_id || null,
      provider_name,
      contract_type: contract_type || null,
      contract_start_date: contract_start_date || null,
      contract_end_date: contract_end_date || null,
      monthly_cost: monthly_cost ? parseFloat(monthly_cost) : null,
      annual_cost: annualCost,
      auto_renewal: auto_renewal ? 'Yes — auto-renews at end of term' : 'No',
      raw_summary: `Manually entered contract for ${provider_name}.`,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create manual contract:', error);
    return NextResponse.json({ error: 'Failed to save contract' }, { status: 500 });
  }

  return NextResponse.json(extraction, { status: 201 });
}

// GET /api/contracts — list all contracts for the user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: contracts, error } = await supabase
    .from('contract_extractions')
    .select(`
      *,
      disputes(id, provider_name, status),
      subscriptions(id, provider_name, status, amount)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch contracts:', error);
    return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
  }

  return NextResponse.json(contracts || []);
}

// DELETE /api/contracts?id=... — delete a contract
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Delete from storage first
  const { data: contract } = await supabase
    .from('contract_extractions')
    .select('file_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (contract?.file_url) {
    // Extract path from signed URL or direct path
    const path = contract.file_url.includes('/contracts/')
      ? contract.file_url.split('/contracts/').pop()?.split('?')[0]
      : null;
    if (path) {
      await supabase.storage.from('contracts').remove([path]);
    }
  }

  await supabase.from('contract_extractions').delete().eq('id', id).eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
