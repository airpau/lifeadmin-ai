import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Delete all user data in order (FK safe)
  await Promise.all([
    admin.from('gmail_tokens').delete().eq('user_id', user.id),
    admin.from('outlook_tokens').delete().eq('user_id', user.id),
    admin.from('usage_logs').delete().eq('user_id', user.id),
  ]);

  await Promise.all([
    admin.from('agent_runs').delete().eq('user_id', user.id),
    admin.from('subscriptions').delete().eq('user_id', user.id),
    admin.from('waitlist_signups').delete().eq('email', user.email),
  ]);

  await admin.from('tasks').delete().eq('user_id', user.id);
  await admin.from('profiles').delete().eq('id', user.id);

  // Delete Supabase auth user (must be last)
  await admin.auth.admin.deleteUser(user.id);

  return NextResponse.json({ success: true });
}
