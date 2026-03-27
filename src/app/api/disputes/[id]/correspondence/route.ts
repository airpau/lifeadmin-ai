import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/disputes/[id]/correspondence — add an entry to the thread
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify dispute ownership
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id')
    .eq('id', disputeId)
    .eq('user_id', user.id)
    .single();

  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const body = await request.json();

  if (!body.entry_type || !body.content) {
    return NextResponse.json({ error: 'Missing required fields: entry_type, content' }, { status: 400 });
  }

  const validTypes = ['company_email', 'company_letter', 'phone_call', 'user_note', 'company_response'];
  if (!validTypes.includes(body.entry_type)) {
    return NextResponse.json({ error: `entry_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from('correspondence')
    .insert({
      dispute_id: disputeId,
      user_id: user.id,
      entry_type: body.entry_type,
      title: body.title || null,
      content: body.content,
      summary: body.summary || null,
      attachments: body.attachments || [],
      entry_date: body.entry_date || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to add correspondence:', error);
    return NextResponse.json({ error: 'Failed to add entry' }, { status: 500 });
  }

  // Update dispute's updated_at
  await supabase
    .from('disputes')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', disputeId);

  return NextResponse.json(entry, { status: 201 });
}

// DELETE /api/disputes/[id]/correspondence — delete an entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get('entryId');
  if (!entryId) return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });

  const { error } = await supabase
    .from('correspondence')
    .delete()
    .eq('id', entryId)
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete correspondence:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
