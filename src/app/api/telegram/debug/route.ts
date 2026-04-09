import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    // Quick query of any detected issues or logs
    const { data: logs } = await supabase
        .from('telegram_message_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
        
    return NextResponse.json({
        hasTelegramToken: !!process.env.TELEGRAM_USER_BOT_TOKEN,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        anthropicModelMatch: process.env.ANTHROPIC_MODEL,
        logs
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message });
  }
}
