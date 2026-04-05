import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken } from '@/lib/gmail';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { getUserPlan } from '@/lib/get-user-plan';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Plan and rate limit checks
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
    const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  const { data: tokenRow, error: tokenErr } = await admin
    .from('gmail_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (tokenErr || !tokenRow) {
    console.error('[gmail-scan] No gmail_tokens row:', tokenErr?.message);
    return NextResponse.json({ error: 'Gmail not connected. Please connect Gmail first.', opportunities: [] }, { status: 400 });
  }

  // Always refresh token (they expire every hour)
  let accessToken = tokenRow.access_token;
  if (tokenRow.refresh_token) {
    try {
      console.log('[gmail-scan] Refreshing access token...');
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await admin.from('gmail_tokens').update({ access_token: accessToken, token_expiry: newExpiry, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      await admin.from('email_connections').update({ access_token: accessToken, token_expiry: newExpiry }).eq('user_id', user.id).eq('provider_type', 'google');
      console.log('[gmail-scan] Token refreshed OK');
    } catch (refreshErr: any) {
      console.error('[gmail-scan] Token refresh failed:', refreshErr.message);
      return NextResponse.json({ error: 'Gmail token refresh failed. Please reconnect Gmail.', opportunities: [] }, { status: 401 });
    }
  }

  try {
    // Use the comprehensive scanning function from gmail.ts
    // This fetches full email bodies, uses targeted queries, and has a robust Claude prompt
    console.log('[gmail-scan] Starting comprehensive email scan...');
    const scanResult = await scanEmailsForOpportunities(accessToken);
    let opportunities = scanResult.opportunities;

    console.log(`[gmail-scan] Scan complete: ${scanResult.emailsFound} found, ${scanResult.emailsScanned} scanned, ${opportunities.length} opportunities`);

    if (!isAdmin) {
      await recordClaudeCall(user.id, usageCheck.tier);
      await incrementUsage(user.id, 'scan_run');
    }

    // Save opportunities to database for persistence
    if (opportunities.length > 0) {
      // Get existing opportunity titles to avoid duplicates (across all statuses, so we don't recreate dismissed items)
      const { data: existing } = await admin
        .from('tasks')
        .select('title')
        .eq('user_id', user.id)
        .eq('type', 'opportunity');

      const existingTitles = new Set((existing || []).map((t: any) => t.title));
      const newOpportunities = opportunities.filter((o: any) => !existingTitles.has(o.title));

      if (newOpportunities.length > 0) {
        await admin.from('tasks').insert(
          newOpportunities.map((o: any) => ({
            user_id: user.id,
            type: 'opportunity',
            title: o.title,
            description: JSON.stringify(o),
            provider_name: o.provider,
            status: o.confidence < 70 ? 'suggested' : 'pending_review',
            priority: o.confidence >= 80 ? 'high' : o.confidence >= 60 ? 'medium' : 'low',
          }))
        );
      }

      // Also save to scanned_receipts for the Scanner UI
      const today = new Date().toISOString().split('T')[0];
      await admin.from('scanned_receipts').insert(
        newOpportunities.map((o: any) => ({
          user_id: user.id,
          provider_name: o.provider || 'Unknown',
          receipt_type: o.category || o.type || 'other',
          amount: o.amount || 0,
          receipt_date: today,
          image_url: o.provider || 'scan',
          extracted_data: o,
        }))
      ).then(({ error: e }) => { if (e) console.error('[gmail-scan] scanned_receipts insert:', e.message); });

      // Update opportunities to only include new ones in response (existing ones are already persisted)
      opportunities = newOpportunities;
    }

    return NextResponse.json({
      opportunities,
      emailsFound: scanResult.emailsFound,
      emailsScanned: scanResult.emailsScanned,
      opportunityCount: opportunities.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Gmail scan error:', err.message);
    return NextResponse.json({
      error: err.message || 'Scan failed',
      opportunities: [],
      emailsFound: 0,
      emailsScanned: 0,
    }, { status: 500 });
  }
}
