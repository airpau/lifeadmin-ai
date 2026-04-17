import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardPoints } from '@/lib/loyalty';
import { learnFromCorrection, normalisePattern } from '@/lib/learning-engine';

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

    // ─────────────────────────────────────────────────────────────────────
    // Subscription ↔ Money Hub category unity
    //
    // When a user corrects a subscription's category, we must:
    //   (1) update the cross-user self-learning merchant_rules via the
    //       canonical learning-engine (confidence scoring, amount ranges)
    //   (2) propagate that correction into money_hub_category_overrides AND
    //       retroactively into every matching bank_transactions row, so the
    //       Money Hub "spending by category" totals move immediately.
    //
    // (2) is done inside a SECURITY DEFINER Postgres RPC
    // (apply_subscription_category_correction — migration 20260417000000)
    // so the three writes are atomic and respect per-transaction overrides.
    //
    // Both promises are AWAITED — on Vercel's serverless runtime, fire-and-
    // forget .then() chains are killed when the response returns, which is
    // why this sync was previously silently failing.
    // ─────────────────────────────────────────────────────────────────────
    if (original) {
      const categoryChanged = Boolean(
        body.category && body.category !== original.category
      );
      const providerNameChanged = Boolean(
        body.provider_name && body.provider_name !== original.provider_name
      );

      if (categoryChanged || providerNameChanged) {
        const newCategory: string = body.category || data.category || 'other';
        const providerName: string = data.provider_name;
        const rawName: string = original.bank_description || original.provider_name;
        const rawNameNormalised = normalisePattern(rawName);

        try {
          await Promise.all([
            // (1) Self-learning rule (cross-user, confidence-scored)
            learnFromCorrection({
              rawName,
              displayName: providerName,
              category: newCategory,
              userId: user.id,
            }),
            // (2) Propagate to Money Hub (only when the category changed —
            //     a rename alone should not reclassify spending)
            categoryChanged
              ? supabase.rpc('apply_subscription_category_correction', {
                  p_user_id: user.id,
                  p_subscription_id: id,
                  p_new_category: newCategory,
                  p_raw_name: rawName,
                  p_raw_name_normalised: rawNameNormalised,
                  p_provider_name: providerName,
                }).then(({ data: rpcData, error: rpcErr }) => {
                  if (rpcErr) throw rpcErr;
                  console.log('[subs.patch] category unity RPC:', rpcData);
                  return rpcData;
                })
              : Promise.resolve(null),
          ]);
        } catch (syncErr: any) {
          // We deliberately DO NOT fail the PATCH response — the subscription
          // update itself succeeded. Money Hub unity failures are logged so
          // Morgan (CTO agent) can pick them up via the executive_reports
          // pipeline, and the next cron run of auto_categorise_transactions
          // will pick up the override regardless.
          console.error('[subs.patch] category sync failed:', syncErr?.message || syncErr);
        }
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
