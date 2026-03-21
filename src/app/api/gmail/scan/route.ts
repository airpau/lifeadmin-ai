import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken } from '@/lib/gmail';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check plan limit
  const usageCheck = await checkUsageLimit(user.id, 'scan_run');
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: 'Monthly scan limit reached', upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit },
      { status: 403 }
    );
  }

  // Check Claude rate limit
  const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
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

  try {
    const { opportunities, emailsFound, emailsScanned } = await scanEmailsForOpportunities(accessToken);
    await recordClaudeCall(user.id, usageCheck.tier);
    await incrementUsage(user.id, 'scan_run');
    return NextResponse.json({ opportunities, emailsFound, emailsScanned, scannedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('Gmail scan error:', err);
    return NextResponse.json({ error: err.message || 'Scan failed', opportunities: [], emailsFound: 0, emailsScanned: 0 }, { status: 500 });
  }
}
