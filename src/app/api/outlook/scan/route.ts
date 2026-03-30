import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanOutlookForOpportunities, refreshMicrosoftToken } from '@/lib/outlook';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Plan and rate limit checks
  const { getUserPlan } = await import('@/lib/get-user-plan');
  const { checkUsageLimit } = await import('@/lib/plan-limits');
  
  const plan = await getUserPlan(user.id);
  const usageCheck = await checkUsageLimit(user.id, 'scan_run');
  const isAdmin = user.email === 'aireypaul@googlemail.com';

  if (!isAdmin) {
    if (plan.tier === 'free') {
      return NextResponse.json(
        { error: 'Inbox scanning is available on Essential and Pro plans. Upgrade to automatically find hidden subscriptions and savings.', upgradeRequired: true },
        { status: 403 }
      );
    }

    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: 'Monthly scan limit reached. Upgrade to Pro for unlimited scans.', upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit },
        { status: 403 }
      );
    }
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check email_connections for Outlook OAuth connection
  const { data: connection } = await admin
    .from('email_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider_type', 'outlook')
    .eq('auth_method', 'oauth')
    .eq('status', 'active')
    .single();

  if (!connection) {
    return NextResponse.json({ error: 'Outlook not connected' }, { status: 400 });
  }

  let accessToken = connection.access_token;

  // Refresh token if expired
  if (connection.token_expiry && new Date(connection.token_expiry) < new Date()) {
    if (!connection.refresh_token) {
      return NextResponse.json({ error: 'Token expired, please reconnect Outlook' }, { status: 400 });
    }
    try {
      const refreshed = await refreshMicrosoftToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      await admin.from('email_connections').update({
        access_token: accessToken,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', connection.id);
    } catch (err: any) {
      console.error('[outlook-scan] Token refresh failed:', err.message);
      return NextResponse.json({ error: 'Token expired. Please reconnect Outlook.' }, { status: 400 });
    }
  }

  try {
    const opportunities = await scanOutlookForOpportunities(accessToken);

    // Update last scanned
    await admin.from('email_connections').update({
      last_scanned_at: new Date().toISOString(),
      emails_scanned: (connection.emails_scanned || 0) + opportunities.length,
    }).eq('id', connection.id);

    return NextResponse.json({
      opportunities,
      count: opportunities.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[outlook-scan] Scan error:', err.message);
    return NextResponse.json({ error: err.message || 'Scan failed' }, { status: 500 });
  }
}
