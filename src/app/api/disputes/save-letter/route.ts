import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { disputeId, title, content, summary } = await request.json();
  const { data, error } = await supabase.rpc('save_generated_letter', {
    p_user_id: user.id,
    p_dispute_id: disputeId,
    p_title: title,
    p_content: content,
    p_summary: summary || null,
    p_entry_type: 'ai_letter',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
