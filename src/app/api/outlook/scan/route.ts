import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanOutlookForOpportunities, refreshMicrosoftToken } from '@/lib/outlook';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { getUserPlan } from '@/lib/get-user-plan';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Plan and rate limit checks (identical to Gmail)
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
    return NextResponse.json({ error: 'Outlook not connected. Please connect your Microsoft account first.', opportunities: [] }, { status: 400 });
  }

  // Always refresh token (they expire every hour)
  let accessToken = connection.access_token;
  if (connection.refresh_token) {
    try {
      console.log('[outlook-scan] Refreshing access token...');
      const refreshed = await refreshMicrosoftToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
      await admin.from('email_connections').update({
        access_token: accessToken,
        token_expiry: newExpiry,
        // If a new refresh token was issued, save it (Microsoft sometimes rotates)
        ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', connection.id);
      console.log('[outlook-scan] Token refreshed OK');
    } catch (refreshErr: any) {
      console.error('[outlook-scan] Token refresh failed:', refreshErr.message);
      return NextResponse.json({ error: 'Microsoft token refresh failed. Please reconnect your Microsoft account.', opportunities: [] }, { status: 401 });
    }
  }

  try {
    // Use the comprehensive scanning function (now matches Gmail capability)
    console.log('[outlook-scan] Starting comprehensive email scan...');
    const scanResult = await scanOutlookForOpportunities(accessToken);
    let opportunities = scanResult.opportunities;

    console.log(`[outlook-scan] Scan complete: ${scanResult.emailsFound} found, ${scanResult.emailsScanned} scanned, ${opportunities.length} opportunities`);

    if (!isAdmin) {
      await recordClaudeCall(user.id, usageCheck.tier);
      await incrementUsage(user.id, 'scan_run');
    }

    // Save opportunities to database for persistence (identical to Gmail)
    if (opportunities.length > 0) {
      // Get existing opportunity titles to avoid duplicates (across all statuses, so we don't recreate dismissed items)
      const { data: existing } = await admin
        .from('tasks')
        .select('title')
        .eq('user_id', user.id)
        .eq('type', 'opportunity');

      const existingTitles = new Set((existing || []).map((t: any) => t.title));

      // Separate opportunities by type
      const newSubs = opportunities.filter((o: any) => !existingTitles.has(o.title) && (o.type === 'subscription' || o.type === 'forgotten_subscription'));
      const newAlerts = opportunities.filter((o: any) => !existingTitles.has(o.title) && (o.type !== 'subscription' && o.type !== 'forgotten_subscription'));
      const newOpportunities = [...newSubs, ...newAlerts];

      if (newOpportunities.length > 0) {
        // Log to tasks (audit trail for scanner)
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

        // Populate Subscriptions
        if (newSubs.length > 0) {
          await admin.from('subscriptions').insert(
            newSubs.map((o: any) => ({
              user_id: user.id,
              provider_name: o.provider || 'Unknown',
              amount: o.amount || o.paymentAmount || 0,
              billing_cycle: o.paymentFrequency === 'yearly' ? 'yearly' : (o.paymentFrequency === 'quarterly' ? 'quarterly' : 'monthly'),
              status: 'active',
              source: 'outlook_scan',
              category: o.category || 'other',
              next_payment_date: o.nextPaymentDate || null,
              contract_end_date: o.contractEndDate || null,
              notes: o.description,
              detected_at: new Date().toISOString()
            }))
          ).then(({ error: e }) => { if (e) console.error('[outlook-scan] subscriptions insert error:', e.message); });
        }

        // Populate Deals / Alerts
        if (newAlerts.length > 0) {
          await admin.from('money_hub_alerts').insert(
            newAlerts.map((o: any) => ({
              user_id: user.id,
              type: o.type,
              title: o.title,
              description: o.description,
              value_gbp: o.amount || 0,
              status: 'active',
              metadata: o
            }))
          ).then(({ error: e }) => { if (e) console.error('[outlook-scan] money_hub_alerts insert error:', e.message); });
        }
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
      ).then(({ error: e }) => { if (e) console.error('[outlook-scan] scanned_receipts insert:', e.message); });

      // Update opportunities to only include new ones in response
      opportunities = newOpportunities;
    }

    // Update last scanned metadata
    await admin.from('email_connections').update({
      last_scanned_at: new Date().toISOString(),
      emails_scanned: (connection.emails_scanned || 0) + scanResult.emailsScanned,
    }).eq('id', connection.id);

    return NextResponse.json({
      opportunities,
      emailsFound: scanResult.emailsFound,
      emailsScanned: scanResult.emailsScanned,
      opportunityCount: opportunities.length,
      scannedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[outlook-scan] Scan error:', err.message);
    return NextResponse.json({
      error: err.message || 'Scan failed',
      opportunities: [],
      emailsFound: 0,
      emailsScanned: 0,
    }, { status: 500 });
  }
}
