import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * POST /api/money-hub/detect-liabilities/dismiss
 * Dismiss a detected liability so it no longer appears
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lender_key, lender_name } = await request.json();
    if (!lender_key || !lender_name) {
      return NextResponse.json({ error: 'lender_key and lender_name required' }, { status: 400 });
    }

    const admin = getAdmin();
    const { error } = await admin.from('dismissed_detected_liabilities').upsert({
      user_id: user.id,
      lender_key,
      lender_name,
      dismissed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lender_key' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ dismissed: true });
  } catch (err: any) {
    console.error('Dismiss liability error:', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}

/**
 * DELETE /api/money-hub/detect-liabilities/dismiss
 * Un-dismiss a previously dismissed liability (restore it)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const lenderKey = searchParams.get('lender_key');
    if (!lenderKey) return NextResponse.json({ error: 'lender_key required' }, { status: 400 });

    const admin = getAdmin();
    await admin.from('dismissed_detected_liabilities')
      .delete()
      .eq('user_id', user.id)
      .eq('lender_key', lenderKey);

    return NextResponse.json({ restored: true });
  } catch (err: any) {
    console.error('Restore liability error:', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
