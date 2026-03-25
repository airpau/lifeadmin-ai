import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await request.json();
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  await admin.from('tasks').update({
    status: 'dismissed',
    resolved_at: new Date().toISOString(),
  }).eq('id', taskId).eq('user_id', user.id);

  return NextResponse.json({ dismissed: true });
}
