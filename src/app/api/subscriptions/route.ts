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

    // Deduplicate on the server side as a safety net —
    // prevents duplicate cron entries from leaking to the client.
    // Key includes amount band so that two legitimately separate subscriptions
    // to the same provider at different amounts are NOT collapsed (e.g. two
    // council-tax DDs for different properties, two gym memberships, etc.).
    const amountBand = (amount: number) => {
      if (amount <= 0) return 0;
      return Math.round(Math.log(Math.max(amount, 0.01)) / Math.log(1.1));
    };
    const seen = new Map<string, boolean>();
    const deduped = (data || []).filter((sub: any) => {
      const band = amountBand(Math.abs(parseFloat(String(sub.amount)) || 0));
      const key = `${(sub.provider_name || '').toLowerCase().trim()}|${sub.billing_cycle}|${band}`;
      if (seen.has(key)) return false;
      seen.set(key, true);
      return true;
    });

    // Auto-advance next_billing_date if in the past (only run on small batches to avoid timeout)
    const now = new Date();
    const toAdvance = deduped.filter((sub: any) =>
      sub.next_billing_date && sub.status === 'active' && new Date(sub.next_billing_date) < now
    );

    for (const sub of toAdvance) {
      try {
        const newDate = new Date(sub.next_billing_date);
        let iterations = 0;
        while (newDate < now && iterations < 24) {
          if (sub.billing_cycle === 'monthly') newDate.setMonth(newDate.getMonth() + 1);
          else if (sub.billing_cycle === 'quarterly') newDate.setMonth(newDate.getMonth() + 3);
          else if (sub.billing_cycle === 'yearly') newDate.setFullYear(newDate.getFullYear() + 1);
          else break;
          iterations++;
        }
        sub.next_billing_date = newDate.toISOString().split('T')[0];
        // Update in background — don't await so we don't block the response
        Promise.resolve(
          supabase.from('subscriptions')
            .update({ next_billing_date: sub.next_billing_date })
            .eq('id', sub.id)
        )
          .then(({ error }) => { if (error) console.error(`Failed to advance billing date for sub ${sub.id}:`, error.message); })
          .catch((err: unknown) => console.error(`Failed to advance billing date for sub ${sub.id}:`, err));
      } catch (advErr) {
        console.error(`Error advancing billing date for sub ${sub.id}:`, advErr);
      }
    }

    return NextResponse.json(deduped);
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
