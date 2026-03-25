import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.provider_name || body.amount === undefined || body.amount === null || !body.billing_cycle) {
      return NextResponse.json(
        { error: 'Missing required fields: provider_name, amount, billing_cycle' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        provider_name: body.provider_name,
        category: body.category || null,
        amount: parseFloat(body.amount),
        currency: 'GBP',
        billing_cycle: body.billing_cycle,
        next_billing_date: body.next_billing_date || null,
        last_used_date: body.last_used_date || null,
        usage_frequency: body.usage_frequency || 'sometimes',
        account_email: body.account_email || null,
        notes: body.notes || null,
        status: 'active',
        contract_type: body.contract_type || null,
        contract_end_date: body.contract_end_date || null,
        auto_renews: body.auto_renews !== undefined ? body.auto_renews : true,
        provider_type: body.provider_type || null,
        current_tariff: body.current_tariff || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
