// /api/email/scan-all
//
// Universal email scan endpoint. Iterates ALL connected email accounts for the
// authenticated user (Gmail, Outlook, IMAP) and runs an opportunity scan on
// each. Results are deduplicated and written to the DB.
//
// Key improvements over calling /api/gmail/scan directly:
//   1. Scans ALL accounts, not just the primary Gmail one
//   2. Incremental mode: reads last_scanned_at from email_connections and only
//      processes emails since that date, cutting API token usage dramatically
//   3. 6-hour cooldown per account to prevent hammering on repeated page loads
//   4. Fixes the alert_type column name (was 'type', must be 'alert_type')
//
// Called by the Money Hub Financial Action Centre "Scan Inbox" button.

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 230;

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken } from '@/lib/gmail';
import { scanOutlookForOpportunities, refreshMicrosoftToken } from '@/lib/outlook';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { getUserPlan } from '@/lib/get-user-plan';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  // Trusted bot path: Pocket Agent calls with x-bot-scan-secret + x-bot-user-id headers
  const botSecret = request.headers.get('x-bot-scan-secret');
  const botUserId = request.headers.get('x-bot-user-id');
  const isBotCall = botSecret && botUserId && botSecret === process.env.CRON_SECRET;

  let userId: string;
  let userEmail: string | undefined;

  if (isBotCall) {
    userId = botUserId!;
    const adminForEmail = createAdminClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
      (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    );
    const { data: p } = await adminForEmail.from('profiles').select('email').eq('id', userId).single();
    userEmail = p?.email;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email;
  }

  const plan = await getUserPlan(userId);
  const usageCheck = await checkUsageLimit(userId, 'scan_run');
  const isAdmin = userEmail === 'aireypaul@googlemail.com';

  if (!isAdmin) {
    if (plan.tier === 'free') {
      return NextResponse.json(
        { error: 'Inbox scanning is available on Essential and Pro plans.', upgradeRequired: true },
        { status: 403 }
      );
    }
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: 'Monthly scan limit reached. Upgrade to Pro for unlimited scans.', upgradeRequired: true },
        { status: 429 }
      );
    }
    const rateLimit = await checkClaudeRateLimit(userId, usageCheck.tier);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  // Fetch all active email connections for this user
  const { data: connections } = await admin
    .from('email_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!connections || connections.length === 0) {
    // Fall back to gmail_tokens table (legacy single-account path)
    const { data: legacyToken } = await admin
      .from('gmail_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!legacyToken) {
      return NextResponse.json({ error: 'No email accounts connected. Please connect Gmail or Outlook in Profile.', opportunities: [] }, { status: 400 });
    }

    // Treat legacy gmail_tokens as a synthetic connection
    connections?.push({
      id: 'legacy_gmail',
      user_id: userId,
      provider_type: 'google',
      auth_method: 'oauth',
      email_address: legacyToken.email,
      access_token: legacyToken.access_token,
      refresh_token: legacyToken.refresh_token,
      token_expiry: legacyToken.token_expiry,
      last_scanned_at: null,
      emails_scanned: 0,
      status: 'active',
    });
  }

  const allOpportunities: any[] = [];
  let totalEmailsFound = 0;
  let totalEmailsScanned = 0;
  const accountResults: { email: string; provider: string; found: number; skipped?: boolean; error?: string }[] = [];

  // Load existing task titles and email IDs so we don't re-insert duplicates across accounts
  const [{ data: existingTasks }, { data: existingFindings }] = await Promise.all([
    admin.from('tasks').select('title').eq('user_id', userId).eq('type', 'opportunity'),
    admin.from('email_scan_findings').select('title, email_id').eq('user_id', userId),
  ]);
  const existingTaskTitles = new Set((existingTasks || []).map((t: any) => t.title));
  const existingFindingTitles = new Set((existingFindings || []).map((t: any) => t.title));
  const existingEmailIds = new Set((existingFindings || []).filter((t: any) => t.email_id).map((t: any) => t.email_id));

  const isNew = (o: any) =>
    !existingTaskTitles.has(o.title) &&
    !existingFindingTitles.has(o.title) &&
    (!o.emailId || !existingEmailIds.has(o.emailId));

  for (const conn of connections || []) {
    const accountLabel = conn.email_address || conn.provider_type;

    // 6-hour cooldown: skip accounts scanned very recently
    if (conn.last_scanned_at) {
      const msSinceLastScan = Date.now() - new Date(conn.last_scanned_at).getTime();
      if (msSinceLastScan < SIX_HOURS_MS) {
        console.log(`[scan-all] Skipping ${accountLabel} — scanned ${Math.round(msSinceLastScan / 60000)}m ago`);
        accountResults.push({ email: accountLabel, provider: conn.provider_type, found: 0, skipped: true });
        continue;
      }
    }

    // Determine incremental since-date (use last_scanned_at if within 60 days)
    const lastScannedAt = conn.last_scanned_at ? new Date(conn.last_scanned_at) : undefined;
    const sinceDate = lastScannedAt && (Date.now() - lastScannedAt.getTime()) < SIXTY_DAYS_MS
      ? lastScannedAt
      : undefined;

    try {
      let scanResult: { opportunities: any[]; emailsFound: number; emailsScanned: number };

      if (conn.provider_type === 'google') {
        // Refresh token before scanning
        let accessToken = conn.access_token;
        if (conn.refresh_token) {
          try {
            const refreshed = await refreshAccessToken(conn.refresh_token);
            accessToken = refreshed.access_token;
            const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
            if (conn.id !== 'legacy_gmail') {
              await admin.from('email_connections').update({ access_token: accessToken, token_expiry: newExpiry }).eq('id', conn.id);
            } else {
              // Legacy path: update gmail_tokens table
              await admin.from('gmail_tokens').update({ access_token: accessToken, token_expiry: newExpiry, updated_at: new Date().toISOString() }).eq('user_id', userId);
            }
          } catch (e: any) {
            console.error(`[scan-all] Token refresh failed for ${accountLabel}:`, e.message);
            accountResults.push({ email: accountLabel, provider: 'google', found: 0, error: 'Token refresh failed' });
            continue;
          }
        }

        console.log(`[scan-all] Scanning Gmail account: ${accountLabel}${sinceDate ? ` (since ${sinceDate.toISOString().split('T')[0]})` : ' (full scan)'}`);
        scanResult = await scanEmailsForOpportunities(accessToken, sinceDate);

      } else if (conn.provider_type === 'outlook') {
        // Refresh Microsoft token before scanning
        let accessToken = conn.access_token;
        if (conn.refresh_token) {
          try {
            const refreshed = await refreshMicrosoftToken(conn.refresh_token);
            accessToken = refreshed.access_token;
            const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
            await admin.from('email_connections').update({
              access_token: accessToken,
              token_expiry: newExpiry,
              ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
            }).eq('id', conn.id);
          } catch (e: any) {
            console.error(`[scan-all] Token refresh failed for ${accountLabel}:`, e.message);
            accountResults.push({ email: accountLabel, provider: 'outlook', found: 0, error: 'Token refresh failed' });
            continue;
          }
        }

        console.log(`[scan-all] Scanning Outlook account: ${accountLabel}${sinceDate ? ` (since ${sinceDate.toISOString().split('T')[0]})` : ' (full scan)'}`);
        scanResult = await scanOutlookForOpportunities(accessToken, sinceDate);

      } else {
        // IMAP and other providers: skip for now
        console.log(`[scan-all] Skipping unsupported provider: ${conn.provider_type}`);
        continue;
      }

      const newOpps = scanResult.opportunities.filter(isNew);
      allOpportunities.push(...newOpps);
      totalEmailsFound += scanResult.emailsFound;
      totalEmailsScanned += scanResult.emailsScanned;
      accountResults.push({ email: accountLabel, provider: conn.provider_type, found: newOpps.length });

      // Update last_scanned_at for this connection
      if (conn.id !== 'legacy_gmail') {
        await admin.from('email_connections').update({
          last_scanned_at: new Date().toISOString(),
          emails_scanned: (conn.emails_scanned || 0) + scanResult.emailsScanned,
        }).eq('id', conn.id);
      } else {
        // Update the google connections row (for the legacy gmail_tokens user)
        await admin.from('email_connections')
          .update({ last_scanned_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('provider_type', 'google');
      }

      // Add new opps to the dedup set so subsequent accounts don't re-insert them
      for (const o of newOpps) {
        existingTaskTitles.add(o.title);
        if (o.emailId) existingEmailIds.add(o.emailId);
      }

    } catch (err: any) {
      console.error(`[scan-all] Scan error for ${accountLabel}:`, err.message);
      accountResults.push({ email: accountLabel, provider: conn.provider_type, found: 0, error: err.message });
    }
  }

  // Nothing found across all accounts — return early
  if (allOpportunities.length === 0) {
    if (!isAdmin) {
      await recordClaudeCall(userId, usageCheck.tier);
      await incrementUsage(userId, 'scan_run');
    }
    return NextResponse.json({
      opportunities: [],
      emailsFound: totalEmailsFound,
      emailsScanned: totalEmailsScanned,
      opportunityCount: 0,
      accountResults,
      scannedAt: new Date().toISOString(),
    });
  }

  if (!isAdmin) {
    await recordClaudeCall(userId, usageCheck.tier);
    await incrementUsage(userId, 'scan_run');
  }

  // ── Save all new opportunities to DB ─────────────────────────────────────

  const sessionId = `scan_all_${Date.now()}`;
  const subs          = allOpportunities.filter((o) => o.type === 'subscription' || o.type === 'forgotten_subscription');
  const priceAlerts   = allOpportunities.filter((o) => o.type === 'price_increase');
  const bills         = allOpportunities.filter((o) => o.type === 'bill');
  const contracts     = allOpportunities.filter((o) => o.type === 'contract');
  const disputeResps  = allOpportunities.filter((o) => o.type === 'dispute_response');
  const cancels       = allOpportunities.filter((o) => o.type === 'cancellation_confirmation');
  const alertItems    = allOpportunities.filter((o) =>
    !['subscription', 'forgotten_subscription', 'bank_gap'].includes(o.type)
  );

  // 1. Tasks (audit trail for the Scanner UI)
  const tasksToInsert = [...subs, ...alertItems.filter((o) => !subs.includes(o))];
  if (tasksToInsert.length > 0) {
    await admin.from('tasks').insert(
      tasksToInsert.map((o: any) => ({
        user_id: userId,
        type: 'opportunity',
        title: o.title,
        description: JSON.stringify(o),
        provider_name: o.provider,
        source: `scan_all`,
        status: o.confidence < 70 ? 'suggested' : 'pending_review',
        priority: o.confidence >= 80 ? 'high' : o.confidence >= 60 ? 'medium' : 'low',
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] tasks insert:', e.message); });
  }

  // 2. email_scan_findings — bills, contracts, price alerts (structured findings)
  const findingsToInsert = [...bills, ...contracts, ...priceAlerts];
  if (findingsToInsert.length > 0) {
    await admin.from('email_scan_findings').insert(
      findingsToInsert.map((o: any) => ({
        user_id: userId,
        scan_session_id: sessionId,
        finding_type: o.type === 'price_increase' ? 'price_increase' : o.type,
        provider: o.provider || 'Unknown',
        email_id: o.emailId || null,
        title: o.title,
        description: o.description || null,
        amount: o.amount || o.paymentAmount || null,
        due_date: o.nextPaymentDate || null,
        previous_amount: o.previousAmount || null,
        confidence: o.confidence || 70,
        urgency: o.urgency || 'routine',
        status: 'new',
        metadata: o,
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] email_scan_findings insert:', e.message); });
  }

  // 3. dispute_correspondence — link to open disputes by provider name
  if (disputeResps.length > 0) {
    const { data: openDisputes } = await admin
      .from('disputes')
      .select('id, provider_name')
      .eq('user_id', userId)
      .not('status', 'in', '(resolved,dismissed)');
    const disputeMap = new Map((openDisputes || []).map((d: any) => [d.provider_name?.toLowerCase(), d.id]));

    await admin.from('dispute_correspondence').insert(
      disputeResps.map((o: any) => ({
        user_id: userId,
        dispute_id: disputeMap.get(o.provider?.toLowerCase()) || null,
        email_id: o.emailId || null,
        provider: o.provider || 'Unknown',
        subject: o.title,
        email_date: new Date().toISOString(),
        correspondence_type: o.correspondenceType || 'unknown',
        summary: o.description || null,
        suggested_action: o.suggestedAction || 'dispute',
        status: 'new',
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] dispute_correspondence insert:', e.message); });
  }

  // 4. Subscriptions — auto-add newly detected ones
  if (subs.length > 0) {
    await admin.from('subscriptions').insert(
      subs.map((o: any) => ({
        user_id: userId,
        provider_name: o.provider || 'Unknown',
        amount: o.amount || o.paymentAmount || 0,
        billing_cycle: o.paymentFrequency === 'yearly' ? 'yearly' : (o.paymentFrequency === 'quarterly' ? 'quarterly' : 'monthly'),
        status: 'active',
        source: 'email_scan',
        category: o.category || 'other',
        next_payment_date: o.nextPaymentDate || null,
        contract_end_date: o.contractEndDate || null,
        notes: o.description,
        detected_at: new Date().toISOString(),
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] subscriptions insert:', e.message); });
  }

  // 5. Cancellation tracking — match to subscriptions by provider
  if (cancels.length > 0) {
    const { data: activeSubs } = await admin.from('subscriptions').select('id, provider_name').eq('user_id', userId).eq('status', 'active');
    const subMap = new Map((activeSubs || []).map((s: any) => [s.provider_name?.toLowerCase(), s.id]));
    await admin.from('cancellation_tracking').insert(
      cancels.map((o: any) => ({
        user_id: userId,
        subscription_id: subMap.get(o.provider?.toLowerCase()) || null,
        provider: o.provider || 'Unknown',
        confirmation_email_id: o.emailId || null,
        confirmation_detected_at: new Date().toISOString(),
        effective_date: o.nextPaymentDate || null,
        status: 'confirmed',
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] cancellation_tracking insert:', e.message); });
  }

  // 6. money_hub_alerts — price increases, bills, dispute responses, contracts
  //    NOTE: column is 'alert_type' NOT 'type'
  const hubAlerts = allOpportunities.filter((o) =>
    ['price_increase', 'bill', 'dispute_response', 'contract', 'cancellation_confirmation', 'bank_gap'].includes(o.type)
  );
  if (hubAlerts.length > 0) {
    await admin.from('money_hub_alerts').insert(
      hubAlerts.map((o: any) => ({
        user_id: userId,
        alert_type: o.type,
        title: o.title,
        description: o.description,
        value_gbp: o.amount || 0,
        status: 'active',
        metadata: o,
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] money_hub_alerts insert:', e.message); });
  }

  // 7. scanned_receipts — for the Scanner UI
  const today = new Date().toISOString().split('T')[0];
  if (allOpportunities.length > 0) {
    await admin.from('scanned_receipts').insert(
      allOpportunities.map((o: any) => ({
        user_id: userId,
        provider_name: o.provider || 'Unknown',
        receipt_type: o.category || o.type || 'other',
        amount: o.amount || 0,
        receipt_date: today,
        image_url: o.provider || 'scan',
        extracted_data: o,
      }))
    ).then(({ error: e }) => { if (e) console.error('[scan-all] scanned_receipts insert:', e.message); });
  }

  return NextResponse.json({
    opportunities: allOpportunities,
    emailsFound: totalEmailsFound,
    emailsScanned: totalEmailsScanned,
    opportunityCount: allOpportunities.length,
    accountResults,
    scannedAt: new Date().toISOString(),
  });
}
