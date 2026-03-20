import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken } from '@/lib/gmail';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: tokenRow } = await admin
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!tokenRow) {
    return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 });
  }

  // Refresh token if expired
  let accessToken = tokenRow.access_token;
  if (tokenRow.token_expiry && new Date(tokenRow.token_expiry) < new Date()) {
    if (!tokenRow.refresh_token) {
      return NextResponse.json({ error: 'Token expired, please reconnect Gmail' }, { status: 400 });
    }
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await admin.from('gmail_tokens').update({
      access_token: accessToken,
      token_expiry: newExpiry,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id);
  }

  const opportunities = await scanEmailsForOpportunities(accessToken);

  return NextResponse.json({ opportunities, scannedAt: new Date().toISOString() });
}
