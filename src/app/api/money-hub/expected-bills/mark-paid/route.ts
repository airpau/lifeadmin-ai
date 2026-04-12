import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** POST — toggle a bill as manually paid/unpaid for a given month.
 *  Body: { bill_key: string, bill_month: string (YYYY-MM), paid: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { bill_key, bill_month, paid } = body;

    if (!bill_key || !bill_month) {
      return NextResponse.json({ error: 'bill_key and bill_month required' }, { status: 400 });
    }

    // Validate bill_month format
    if (!/^\d{4}-\d{2}$/.test(bill_month)) {
      return NextResponse.json({ error: 'bill_month must be YYYY-MM' }, { status: 400 });
    }

    const admin = getAdmin();

    if (paid) {
      // Mark as paid: upsert into bill_paid_overrides
      const { error } = await admin
        .from('bill_paid_overrides')
        .upsert(
          { user_id: user.id, bill_key, bill_month },
          { onConflict: 'user_id,bill_key,bill_month' }
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      // Unmark: delete the override
      const { error } = await admin
        .from('bill_paid_overrides')
        .delete()
        .eq('user_id', user.id)
        .eq('bill_key', bill_key)
        .eq('bill_month', bill_month);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, bill_key, bill_month, paid });
  } catch (err: any) {
    console.error('mark-paid error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
