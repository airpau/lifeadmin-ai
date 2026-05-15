import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { logAlertInteraction, responseTimeFrom } from '@/lib/alert-interactions';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { taskId } = await request.json();
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: task } = await admin
    .from('tasks')
    .select('created_at, type, provider_name')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  await admin.from('tasks').update({
    status: 'dismissed',
    resolved_at: new Date().toISOString(),
  }).eq('id', taskId).eq('user_id', user.id);

  void logAlertInteraction({
    userId: user.id,
    alertType: task?.type === 'opportunity' ? 'opportunity' : 'task',
    alertKey: taskId,
    action: 'dismissed',
    responseTimeSeconds: responseTimeFrom(task?.created_at),
    surface: 'web',
    metadata: task?.provider_name ? { provider: task.provider_name } : null,
    client: admin,
  });

  return NextResponse.json({ dismissed: true });
}
