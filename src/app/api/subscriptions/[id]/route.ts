import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardPoints } from '@/lib/loyalty';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Allowlist: only permit these fields to be updated (prevent mass assignment)
    const ALLOWED_FIELDS = new Set([
      'provider_name', 'category', 'amount', 'billing_cycle', 'next_billing_date',
      'account_email', 'contract_type', 'contract_end_date', 'contract_start_date',
      'contract_term_months', 'auto_renews', 'early_exit_fee', 'provider_type',
      'current_tariff', 'alerts_enabled', 'alert_before_days', 'contract_end_source',
      'status', 'needs_review', 'notes', 'dismissed_at', 'cancelled_at',
      'money_saved', 'subcategory',
    ]);
    const sanitisedBody: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        sanitisedBody[key] = body[key];
      }
    }

    // Fetch original before update (for learning)
    const { data: original } = await supabase
      .from('subscriptions')
      .select('provider_name, category, bank_description')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    const { data, error } = await supabase
      .from('subscriptions')
      .update(sanitisedBody)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Award loyalty points and track savings when subscription is cancelled
    if (body.status === 'cancelled' && original) {
      // Award 15 loyalty points
      awardPoints(user.id, 'subscription_cancelled', {
        provider: data.provider_name,
        amount: data.amount,
      }).catch(err => console.error('Failed to award cancel points:', err));

      // Calculate annual saving and add to total_money_recovered on profile
      const monthlySaving = body.money_saved || (
        data.billing_cycle === 'yearly' ? data.amount / 12
        : data.billing_cycle === 'quarterly' ? data.amount / 3
        : data.amount
      );
      if (monthlySaving > 0) {
        const annualSaving = monthlySaving * 12;
        supabase.from('profiles')
          .select('total_money_recovered')
          .eq('id', user.id)
          .single()
          .then(({ data: profile }) => {
            const current = parseFloat(profile?.total_money_recovered || '0');
            supabase.from('profiles')
              .update({ total_money_recovered: current + annualSaving })
              .eq('id', user.id)
              .then(({ error: saveErr }) => {
                if (saveErr) console.error('Failed to update money recovered:', saveErr);
                else console.log(`Money recovered updated: +${annualSaving.toFixed(2)}/yr for ${data.provider_name}`);
              });
          });
      }
    }

    // Self-learning: if user changed category, propagate everywhere
    if (original && body.category) {
      const newCategory = body.category;
      const providerName = data.provider_name;
      const rawName = original.bank_description || original.provider_name;
      const normalised = rawName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

      // 1. Update merchant rule for future auto-categorisation
      if (normalised) {
        supabase.from('merchant_rules').upsert({
          raw_name: rawName,
          raw_name_normalised: normalised,
          display_name: body.provider_name || providerName,
          category: newCategory,
          created_by_user_id: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'raw_name_normalised' }).then(({ error: ruleError }) => {
          if (ruleError) console.error('Merchant rule save failed:', ruleError);
        });
      }

      // 2. Update ALL bank transactions with matching merchant name (user_category)
      // This ensures Money Hub spending breakdown matches the subscription category
      const merchantVariants = [providerName, rawName].filter(Boolean);
      for (const name of merchantVariants) {
        supabase.from('bank_transactions')
          .update({ user_category: newCategory })
          .eq('user_id', user.id)
          .ilike('merchant_name', `%${name}%`)
          .then(({ error: txErr, count }) => {
            if (txErr) console.error(`Transaction recategorise failed for "${name}":`, txErr);
            else if (count) console.log(`Recategorised ${count} transactions for "${name}" → ${newCategory}`);
          });
      }

      // 3. Update category override table for Money Hub consistency
      supabase.from('money_hub_category_overrides').upsert({
        user_id: user.id,
        merchant_pattern: providerName.toLowerCase(),
        new_category: newCategory,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,merchant_pattern' }).then(({ error: ovErr }) => {
        if (ovErr) console.error('Category override save failed:', ovErr);
      });
    } else if (original && body.provider_name) {
      // Provider name changed without category — still update merchant rule
      const rawName = original.bank_description || original.provider_name;
      const normalised = rawName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (normalised) {
        supabase.from('merchant_rules').upsert({
          raw_name: rawName,
          raw_name_normalised: normalised,
          display_name: body.provider_name,
          category: data.category || 'other',
          created_by_user_id: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'raw_name_normalised' }).then(() => {});
      }
    }

    // If status changed to cancelled, return updated totals
    if (body.status === 'cancelled') {
      const { data: totals } = await supabase.rpc('get_subscription_total', { p_user_id: user.id });
      return NextResponse.json({ ...data, subscription_totals: totals });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT handler — same as PATCH (frontend uses PUT for needs_review updates)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PATCH(request, { params });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Use RPC for dismiss — returns updated subscription totals
    const { data: totals, error } = await supabase.rpc('dismiss_subscription', {
      p_user_id: user.id,
      p_subscription_id: id,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, ...totals });
  } catch (error: any) {
    console.error('Error deleting subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
