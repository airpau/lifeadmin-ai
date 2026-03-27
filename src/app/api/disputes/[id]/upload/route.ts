import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/disputes/[id]/upload — upload a file attachment for correspondence
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

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split('.').pop() || 'bin';
  const path = `disputes/${user.id}/${disputeId}/${Date.now()}.${ext}`;

  const { data: upload, error: uploadError } = await supabase.storage
    .from('correspondence-files')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Upload failed:', uploadError);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from('correspondence-files')
    .getPublicUrl(upload.path);

  return NextResponse.json({
    url: urlData.publicUrl,
    filename: file.name,
    type: file.type,
    size: file.size,
    path: upload.path,
  });
}
