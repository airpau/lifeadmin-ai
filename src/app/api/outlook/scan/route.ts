import { NextRequest, NextResponse } from 'next/server';
import { toMoneyHubAlertRow } from '@/lib/email/scan-persistence';

// Several mailboxes are scanned one after another, so allow the Pro
// plan maximum. The loop stops starting new mailboxes at ~200s.
export const maxDuration = 300;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanOutlookForOpportunities, type Opportunity } from '@/lib/outlook';
import {
  listActiveOAuthConnections,
  hasConnectionsNeedingReauth,
  getScanAccessToken,
  mergeOpportunities,
} from '@/lib/email/oauth-connections';
import { checkUsageLimit, incrementUsage, checkFreeScanGate } from '@/lib/plan-limits';
import { resolveEmailScanWindow, buildScanWindowNotice } from '@/lib/email-scan-window';
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
    // Free-tier monthly gate (mirror of gmail/scan): one scan per 30 days.
    if (plan.tier === 'free') {
      const gate = await checkFreeScanGate(user.id);
      if (!gate.allowed) {
        return NextResponse.json(
          {
            error: `Free tier scans monthly. Next scan available ${gate.nextAvailableISO}. Upgrade for unlimited scans.`,
            upgrade_url: '/pricing',
            nextAvailableISO: gate.nextAvailableISO,
            lastScanISO: gate.lastScanISO,
          },
          { status: 429 }
        );
      }
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

  // Every active, non-archived Outlook OAuth connection, scanned one
  // after another. This used .single(), so a user with two Microsoft
  // accounts got "Outlook not connected" and neither was scanned.
  const { rows: outlookConns, error: connListErr } = await listActiveOAuthConnections(admin, user.id, 'outlook');
  if (connListErr) console.error('[outlook-scan] email_connections lookup failed:', connListErr);

  if (outlookConns.length === 0) {
    if (await hasConnectionsNeedingReauth(admin, user.id, 'outlook')) {
      return NextResponse.json({ error: 'Microsoft token refresh failed. Please reconnect your Microsoft account.', opportunities: [] }, { status: 401 });
    }
    return NextResponse.json({ error: 'Outlook not connected. Please connect your Microsoft account first.', opportunities: [] }, { status: 400 });
  }

  // Tier lookback cap — trial-aware via getEffectiveTier.
  const scanWindow = await resolveEmailScanWindow(user.id);

  const SCAN_BUDGET_MS = 200_000;
  const scanStartedAt = Date.now();
  const perAccountOpps: Opportunity[][] = [];
  const accountResults: Array<{
    email: string;
    status: 'scanned' | 'needs_reauth' | 'error' | 'skipped';
    error?: string;
    emailsFound?: number;
    emailsScanned?: number;
    opportunities?: number;
  }> = [];
  const pendingStamps: Array<{ id: string; stamp: Record<string, string | number> }> = [];
  let totalFound = 0;
  let totalScanned = 0;

  for (const conn of outlookConns) {
    if (Date.now() - scanStartedAt > SCAN_BUDGET_MS) {
      accountResults.push({ email: conn.email_address, status: 'skipped', error: 'time budget reached, scan again to continue' });
      continue;
    }
    // Refresh per connection; the new token (and any rotated refresh
    // token) is written to this row only, encrypted.
    const tok = await getScanAccessToken(admin, conn);
    if (!tok.ok) {
      console.error(`[outlook-scan] ${conn.id} token unavailable (${tok.reason}): ${tok.message}`);
      accountResults.push({ email: conn.email_address, status: tok.reason === 'needs_reauth' ? 'needs_reauth' : 'error', error: tok.message });
      continue;
    }
    console.log(`[outlook-scan] ${conn.id}: starting scan (window=${scanWindow.days}d, tier=${scanWindow.tier})`);
    try {
      const r = await scanOutlookForOpportunities(tok.accessToken, {
        lookbackDays: scanWindow.days,
      });
      perAccountOpps.push(r.opportunities);
      totalFound += r.emailsFound;
      totalScanned += r.emailsScanned;
      accountResults.push({
        email: conn.email_address,
        status: 'scanned',
        emailsFound: r.emailsFound,
        emailsScanned: r.emailsScanned,
        opportunities: r.opportunities.length,
      });
      pendingStamps.push({
        id: conn.id,
        stamp: {
          last_scanned_at: new Date().toISOString(),
          emails_scanned: (conn.emails_scanned ?? 0) + r.emailsScanned,
        },
      });
    } catch (scanErr: unknown) {
      const scanErrMsg = scanErr instanceof Error ? scanErr.message : String(scanErr);
      console.error(`[outlook-scan] ${conn.id} scan failed:`, scanErrMsg);
      accountResults.push({ email: conn.email_address, status: 'error', error: scanErrMsg || 'Scan failed' });
    }
  }

  const scannedCount = accountResults.filter((a) => a.status === 'scanned').length;
  if (scannedCount === 0) {
    if (accountResults.some((a) => a.status === 'needs_reauth')) {
      return NextResponse.json({ error: 'Microsoft token refresh failed. Please reconnect your Microsoft account.', opportunities: [], accounts: accountResults }, { status: 401 });
    }
    return NextResponse.json({
      error: accountResults.find((a) => a.error)?.error || 'Scan failed',
      opportunities: [],
      emailsFound: 0,
      emailsScanned: 0,
      accounts: accountResults,
    }, { status: 500 });
  }

  try {
    let opportunities = mergeOpportunities(perAccountOpps);

    console.log(`[outlook-scan] Scan complete across ${scannedCount}/${accountResults.length} mailbox(es): ${totalFound} found, ${totalScanned} scanned, ${opportunities.length} opportunities`);

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
              next_billing_date: o.nextPaymentDate || null,
              contract_end_date: o.contractEndDate || null,
              notes: o.description
            }))
          ).then(({ error: e }) => { if (e) console.error('[outlook-scan] subscriptions insert error:', e.message); });
        }

        // Populate Deals / Alerts
        if (newAlerts.length > 0) {
          // The column is `alert_type`, not `type`, and it is NOT NULL.
          // Every insert on this path violated the constraint and was
          // swallowed by the .then() below, so Money Hub alerts from
          // Outlook and IMAP scans have never landed. Mapped through
          // toMoneyHubAlertRow so the CHECK constraint is respected too.
          const alertRows = newAlerts
            .map((o: any) => toMoneyHubAlertRow(o, user.id))
            .filter((r): r is Record<string, unknown> => r !== null);
          if (alertRows.length > 0) {
          await admin.from('money_hub_alerts').insert(alertRows)
          .then(({ error: e }) => { if (e) console.error('[outlook-scan] money_hub_alerts insert error:', e.message); });
          }
        }

        // The dashboard's "Email scanner" card reads from
        // `email_scan_findings` (status in [new, reviewing]). Gmail
        // writes there; Outlook previously did not, so Outlook scans
        // produced findings the user never saw. Mirror Gmail's insert
        // here — filtered to the CHECK-constraint type allowlist.
        const FINDING_TYPES = new Set([
          'subscription', 'bill', 'contract', 'dispute_response',
          'cancellation_confirmation', 'price_increase', 'refund_opportunity',
          'flight_delay', 'debt_dispute', 'tax_rebate', 'renewal',
          'forgotten_subscription', 'upcoming_payment', 'deal_expiry',
          'bank_gap',
        ]);
        const findings = newOpportunities.filter((o: any) => FINDING_TYPES.has(o.type));
        if (findings.length > 0) {
          await admin.from('email_scan_findings').insert(
            findings.map((o: any) => ({
              user_id: user.id,
              finding_type: o.type,
              provider: o.provider || 'Unknown',
              email_id: o.emailId || null,
              title: o.title,
              description: o.description || null,
              amount: o.amount || o.paymentAmount || null,
              due_date: o.nextPaymentDate || null,
              contract_end_date: o.contractEndDate || null,
              previous_amount: o.previousAmount || null,
              price_change_date: o.priceChangeDate || null,
              payment_frequency: o.paymentFrequency || null,
              confidence: o.confidence || 70,
              urgency: o.urgency || 'routine',
              status: 'new',
              source: 'outlook',
              metadata: o,
            }))
          ).then(({ error: e }) => { if (e) console.error('[outlook-scan] email_scan_findings insert:', e.message); });
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

    // Update last scanned metadata on each mailbox that scanned, by id.
    for (const { id, stamp } of pendingStamps) {
      await admin.from('email_connections').update(stamp).eq('id', id);
    }

    return NextResponse.json({
      opportunities,
      emailsFound: totalFound,
      emailsScanned: totalScanned,
      opportunityCount: opportunities.length,
      accounts: accountResults,
      scannedAt: new Date().toISOString(),
      scanWindow: {
        days: scanWindow.days,
        tier: scanWindow.tier,
        capped: scanWindow.capped,
        fullWindowDays: scanWindow.fullWindowDays,
        sinceISO: scanWindow.sinceISO,
      },
      scanWindowNotice: buildScanWindowNotice(scanWindow, opportunities.length),
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
