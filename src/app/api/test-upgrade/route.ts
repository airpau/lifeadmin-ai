import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== 'sheva.tests.2026@outlook.com') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Force upgrade
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  
  await admin.from('profiles').update({ subscription_tier: 'pro' }).eq('id', user.id);

  return NextResponse.json({ success: true, message: 'Upgraded to Pro' });
}
