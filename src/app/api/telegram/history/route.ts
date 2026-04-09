import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const { data, error } = await supabase
    .from('telegram_message_log')
    .select('created_at, direction, message_text, processing_time_ms')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ data, error });
}
