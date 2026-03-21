import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { letter } = await request.json();
  if (typeof letter !== 'string') {
    return NextResponse.json({ error: 'Invalid letter' }, { status: 400 });
  }

  // Verify task belongs to user
  const { data: task } = await supabase
    .from('tasks')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Update letter in agent_runs output_data
  const { error } = await supabase.rpc('update_agent_run_letter', {
    p_task_id: id,
    p_letter: letter,
  });

  if (error) {
    // Fallback: fetch and update manually
    const { data: run } = await supabase
      .from('agent_runs')
      .select('id, output_data')
      .eq('task_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!run) return NextResponse.json({ error: 'Agent run not found' }, { status: 404 });

    const updatedOutput = { ...(run.output_data || {}), letter };
    const { error: updateError } = await supabase
      .from('agent_runs')
      .update({ output_data: updatedOutput })
      .eq('id', run.id);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
