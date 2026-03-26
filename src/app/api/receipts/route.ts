import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('scanned_receipts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    console.error('Error fetching receipts:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing receipt id' }, { status: 400 });
    }

    // Fetch receipt to get storage path
    const { data: receipt, error: fetchError } = await supabase
      .from('scanned_receipts')
      .select('image_url')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // Extract storage path from URL
    if (receipt.image_url) {
      const urlParts = receipt.image_url.split('/media/');
      if (urlParts.length > 1) {
        const storagePath = urlParts[1];
        await supabase.storage.from('media').remove([storagePath]);
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('scanned_receipts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting receipt:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
