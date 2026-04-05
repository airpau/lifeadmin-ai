import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ bank_prompt_dismissed_at: new Date().toISOString() })
      .eq('id', user.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error dismissing bank prompt:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
