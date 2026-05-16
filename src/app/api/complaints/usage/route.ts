import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkFreeLetterGate } from '@/lib/dispute-gate';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gate = await checkFreeLetterGate(user.id);
  return NextResponse.json({
    used: gate.used,
    limit: gate.limit,
    tier: gate.tier,
    lettersRemaining: gate.lettersRemaining,
  });
}
