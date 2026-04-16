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

    // Auto-advance next_billing_date if in the past
    const now = new Date();
    for (const sub of data || []) {
      if (sub.next_billing_date && sub.status === 'active') {
        const billDate = new Date(sub.next_billing_date);
        if (billDate < now) {
          // Advance based on billing cycle
          const newDate = new Date(billDate);
          while (newDate < now) {
            if (sub.billing_cycle === 'monthly') newDate.setMonth(newDate.getMonth() + 1);
            else if (sub.billing_cycle === 'quarterly') newDate.setMonth(newDate.getMonth() + 3);
            else if (sub.billing_cycle === 'yearly') newDate.setFullYear(newDate.getFullYear() + 1);
            else break;
          }
          sub.next_billing_date = newDate.toISOString().split('T')[0];
          // Update in background — catch errors to avoid unhandled promise rejections
          Promise.resolve(
            supabase.from('subscriptions').update({ next_billing_date: sub.next_billing_date }).eq('id', sub.id)
          )
            .then(({ error }) => { if (error) console.error(`Failed to advance billing date for sub ${sub.id}:`, error.message); })
            .catch((err: unknown) => console.error(`Failed to advance billing date for sub ${sub.id}:`, err));
        }
      }
    }

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

    if (typeof body.provider_name !== 'string' || body.provider_name.trim().length === 0) {
      return NextResponse.json({ error: 'Provider name is required' }, { status: 400 });
    }
    if (body.provider_name.length > 100) {
      return NextResponse.json({ error: 'Provider name must be 100 characters or fewer' }, { status: 400 });
    }

    const parsedAmount = parseFloat(body.amount);
    if (isNaN(parsedAmount) || parsedAmount < 0 || parsedAmount > 99999) {
      return NextResponse.json({ error: 'Amount must be a number between 0 and 99,999' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: user.id,
        provider_name: body.provider_name.trim().slice(0, 100),
        category: body.category || null,
        amount: parsedAmount,
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
        contract_start_date: body.contract_start_date || null,
        contract_term_months: body.contract_term_months || null,
        auto_renews: body.auto_renews !== undefined ? body.auto_renews : true,
        early_exit_fee: body.early_exit_fee || null,
        provider_type: body.provider_type || null,
        current_tariff: body.current_tariff || null,
        alerts_enabled: body.alerts_enabled !== undefined ? body.alerts_enabled : true,
        alert_before_days: body.alert_before_days || 30,
        contract_end_source: body.contract_end_source || (body.contract_end_date ? 'manual' : null),
        source: body.source || 'manual',
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
