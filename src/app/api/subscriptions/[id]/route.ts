import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Fetch original before update (for learning)
    const { data: original } = await supabase
      .from('subscriptions')
      .select('provider_name, category, bank_description')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    const { data, error } = await supabase
      .from('subscriptions')
      .update(body)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Self-learning: if user changed provider_name or category, create a merchant rule
    if (original && (body.provider_name || body.category)) {
      const rawName = original.bank_description || original.provider_name;
      const normalised = rawName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

      if (normalised) {
        await supabase.from('merchant_rules').upsert({
          raw_name: rawName,
          raw_name_normalised: normalised,
          display_name: body.provider_name || data.provider_name,
          category: body.category || data.category || 'other',
          created_by_user_id: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'raw_name_normalised' }).then(({ error: ruleError }) => {
          if (ruleError) console.error('Merchant rule save failed:', ruleError);
          else console.log(`Merchant rule learned: "${rawName}" → "${body.provider_name || data.provider_name}" [${body.category || data.category}]`);
        });
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
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

    // Soft delete — mark as dismissed so it won't be re-created by sync
    const { error } = await supabase
      .from('subscriptions')
      .update({ dismissed_at: new Date().toISOString(), status: 'dismissed' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting subscription:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
