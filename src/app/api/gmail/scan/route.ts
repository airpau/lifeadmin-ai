import { NextRequest, NextResponse } from 'next/server';
import { toFindingRow, toMoneyHubAlertRow } from '@/lib/email/scan-persistence';

// Several mailboxes are scanned one after another, so allow the Pro
// plan maximum. The loop stops starting new mailboxes at ~200s.
export const maxDuration = 300;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken, type Opportunity } from '@/lib/gmail';
import {
  listActiveOAuthConnections,
  hasAnyGoogleConnectionRow,
  hasConnectionsNeedingReauth,
  getScanAccessToken,
  mergeOpportunities,
} from '@/lib/email/oauth-connections';
import { decryptToken, encryptToken } from '@/lib/email/token-crypto';
import { checkUsageLimit, incrementUsage, checkFreeScanGate } from '@/lib/plan-limits';
import { resolveEmailScanWindow, clampSinceToWindow, buildScanWindowNotice } from '@/lib/email-scan-window';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { getUserPlan } from '@/lib/get-user-plan';
import { queueTelegramAlert } from '@/lib/telegram/queue';
import { deriveRecurringGroup } from '@/lib/subscription-key';

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
    // Free-tier monthly gate: free users may scan once per 30 days. We let them
    // *try* (so we can surface the upgrade nudge) but 429 when the cooldown
    // hasn't elapsed. Paid tiers fall through to the usual usage check.
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

  // ---- Which mailboxes to scan ----
  //
  // Every active, non-archived Gmail row in email_connections, scanned one
  // after another, each with its own token refresh written back only to
  // its own row. This used to read the single gmail_tokens row, so only
  // the most recently connected Gmail was ever scanned, and its refreshed
  // token was then written over every other Gmail row the user had.
  //
  // gmail_tokens is only consulted for very old accounts that have no
  // email_connections row at all (the dashboard still calls this route
  // for them as its legacy fallback).
  const url = new URL(request.url);
  const forceFull = url.searchParams.get('full') === '1';
  const { rows: googleConns, error: connListErr } = await listActiveOAuthConnections(admin, user.id, 'google');
  if (connListErr) console.error('[gmail-scan] email_connections lookup failed:', connListErr);

  type LegacyTarget = { refreshToken: string | null; accessToken: string | null; email: string };
  let legacyTarget: LegacyTarget | null = null;
  if (googleConns.length === 0 && !(await hasAnyGoogleConnectionRow(admin, user.id))) {
    const { data: legacyRow } = await admin
      .from('gmail_tokens')
      .select('email, access_token, refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();
    if (legacyRow) {
      legacyTarget = {
        email: legacyRow.email,
        accessToken: decryptToken(legacyRow.access_token),
        refreshToken: decryptToken(legacyRow.refresh_token),
      };
    }
  }

  if (googleConns.length === 0 && !legacyTarget) {
    if (await hasConnectionsNeedingReauth(admin, user.id, 'google')) {
      return NextResponse.json({ error: 'Gmail token refresh failed. Please reconnect Gmail.', opportunities: [] }, { status: 401 });
    }
    console.error('[gmail-scan] No active Gmail connection for user');
    return NextResponse.json({ error: 'Gmail not connected. Please connect Gmail first.', opportunities: [] }, { status: 400 });
  }

  // Tier lookback cap. resolveEmailScanWindow goes through
  // getEffectiveTier, so an active onboarding trial gets the paid
  // window and a downgraded user just gets the shallower window on
  // their next scan (no error, no broken state).
  const scanWindow = await resolveEmailScanWindow(user.id);

  // Incremental scans, per mailbox: if a connection already has
  // `last_full_scanned_at`, narrow its window to messages since its own
  // `last_scanned_at` (default 30 days back). `?full=1` forces a fresh
  // sweep on every mailbox and resets `last_full_scanned_at`.
  //
  // Mailboxes are scanned sequentially (not in parallel) so two inboxes
  // do not double the burst against Gmail's per-project quota, and new
  // mailboxes stop being started once the time budget is used so the
  // function never dies mid-write.
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

  for (const conn of googleConns) {
    if (Date.now() - scanStartedAt > SCAN_BUDGET_MS) {
      accountResults.push({ email: conn.email_address, status: 'skipped', error: 'time budget reached, scan again to continue' });
      continue;
    }
    const tok = await getScanAccessToken(admin, conn);
    if (!tok.ok) {
      console.error(`[gmail-scan] ${conn.id} token unavailable (${tok.reason}): ${tok.message}`);
      accountResults.push({ email: conn.email_address, status: tok.reason === 'needs_reauth' ? 'needs_reauth' : 'error', error: tok.message });
      continue;
    }
    const isFullScan = forceFull || !conn.last_full_scanned_at;
    const rawSince = isFullScan
      ? null
      : (conn.last_scanned_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    const sinceISO = clampSinceToWindow(rawSince, scanWindow);
    console.log(`[gmail-scan] ${conn.id}: starting ${isFullScan ? 'FULL' : 'INCREMENTAL'} scan (since=${sinceISO}, window=${scanWindow.days}d, tier=${scanWindow.tier})`);
    try {
      const r = await scanEmailsForOpportunities(tok.accessToken, {
        sinceISO,
        userId: user.id,
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
      const nowIso = new Date().toISOString();
      const stamp: Record<string, string | number> = {
        last_scanned_at: nowIso,
        emails_scanned: (conn.emails_scanned ?? 0) + r.emailsScanned,
      };
      if (isFullScan) stamp.last_full_scanned_at = nowIso;
      pendingStamps.push({ id: conn.id, stamp });
    } catch (scanErr: unknown) {
      const scanErrMsg = scanErr instanceof Error ? scanErr.message : String(scanErr);
      console.error(`[gmail-scan] ${conn.id} scan failed:`, scanErrMsg);
      accountResults.push({ email: conn.email_address, status: 'error', error: scanErrMsg || 'Scan failed' });
    }
  }

  // Legacy-only account (no email_connections row at all).
  if (legacyTarget) {
    let accessToken = legacyTarget.accessToken;
    let legacyOk = true;
    if (legacyTarget.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(legacyTarget.refreshToken);
        accessToken = refreshed.access_token;
        await admin.from('gmail_tokens').update({
          access_token: encryptToken(accessToken),
          token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id).eq('email', legacyTarget.email);
      } catch (refreshErr: unknown) {
        const refreshErrMsg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        console.error('[gmail-scan] legacy token refresh failed:', refreshErrMsg);
        accountResults.push({ email: legacyTarget.email, status: 'needs_reauth', error: refreshErrMsg });
        legacyOk = false;
      }
    }
    if (legacyOk && accessToken) {
      try {
        // Legacy rows have no scan cursor, so this is always a full sweep
        // within the tier window, exactly as before.
        const r = await scanEmailsForOpportunities(accessToken, {
          sinceISO: clampSinceToWindow(null, scanWindow),
          userId: user.id,
          lookbackDays: scanWindow.days,
        });
        perAccountOpps.push(r.opportunities);
        totalFound += r.emailsFound;
        totalScanned += r.emailsScanned;
        accountResults.push({ email: legacyTarget.email, status: 'scanned', emailsFound: r.emailsFound, emailsScanned: r.emailsScanned, opportunities: r.opportunities.length });
      } catch (scanErr: unknown) {
        const scanErrMsg = scanErr instanceof Error ? scanErr.message : String(scanErr);
        accountResults.push({ email: legacyTarget.email, status: 'error', error: scanErrMsg || 'Scan failed' });
      }
    } else if (legacyOk) {
      accountResults.push({ email: legacyTarget.email, status: 'needs_reauth', error: 'No usable Gmail token' });
    }
  }

  const scannedCount = accountResults.filter((a) => a.status === 'scanned').length;
  if (scannedCount === 0) {
    const anyReauth = accountResults.some((a) => a.status === 'needs_reauth');
    const firstError = accountResults.find((a) => a.error)?.error;
    if (anyReauth) {
      return NextResponse.json({ error: 'Gmail token refresh failed. Please reconnect Gmail.', opportunities: [], accounts: accountResults }, { status: 401 });
    }
    return NextResponse.json({
      error: firstError || 'Scan failed',
      opportunities: [],
      emailsFound: 0,
      emailsScanned: 0,
      accounts: accountResults,
    }, { status: 500 });
  }

  try {
    let opportunities = mergeOpportunities(perAccountOpps);

    console.log(`[gmail-scan] Scan complete across ${scannedCount}/${accountResults.length} mailbox(es): ${totalFound} found, ${totalScanned} scanned, ${opportunities.length} opportunities`);

    if (!isAdmin) {
      await recordClaudeCall(user.id, usageCheck.tier);
      await incrementUsage(user.id, 'scan_run');
    }

    // Save opportunities to database for persistence
    if (opportunities.length > 0) {
      const sessionId = `scan_${Date.now()}`;

      // Get existing titles to avoid duplicates
      const [{ data: existingTasks }, { data: existingFindings }] = await Promise.all([
        admin.from('tasks').select('title').eq('user_id', user.id).eq('type', 'opportunity'),
        admin.from('email_scan_findings').select('title, email_id').eq('user_id', user.id),
      ]);
      const existingTaskTitles = new Set((existingTasks || []).map((t: any) => t.title));
      const existingFindingTitles = new Set((existingFindings || []).map((t: any) => t.title));
      const existingEmailIds = new Set((existingFindings || []).filter((t: any) => t.email_id).map((t: any) => t.email_id));

      // ---- Categorise into buckets ----
      const isNew = (o: any) => !existingTaskTitles.has(o.title) && !existingFindingTitles.has(o.title) && (!o.emailId || !existingEmailIds.has(o.emailId));

      const bills         = opportunities.filter((o: any) => isNew(o) && o.type === 'bill');
      const contracts     = opportunities.filter((o: any) => isNew(o) && o.type === 'contract');
      const disputeResps  = opportunities.filter((o: any) => isNew(o) && o.type === 'dispute_response');
      const cancels       = opportunities.filter((o: any) => isNew(o) && o.type === 'cancellation_confirmation');
      const subs          = opportunities.filter((o: any) => isNew(o) && (o.type === 'subscription' || o.type === 'forgotten_subscription'));
      const priceAlerts   = opportunities.filter((o: any) => isNew(o) && o.type === 'price_increase');
      const standard      = opportunities.filter((o: any) => isNew(o) && !['bill','contract','dispute_response','cancellation_confirmation'].includes(o.type));
      const allNew        = [...bills, ...contracts, ...disputeResps, ...cancels, ...subs, ...priceAlerts, ...standard.filter((o: any) => !subs.includes(o) && !priceAlerts.includes(o))];

      // ---- 1. email_scan_findings — EVERY storable finding ----
      //
      // This used to be `[...bills, ...contracts, ...priceAlerts]`.
      // email_scan_findings is the only table the dashboard's Email
      // Scanner card reads, so every other classification the scanner
      // produced — subscriptions, renewals, refunds, flight delays, tax
      // rebates — was computed, paid for, and thrown away. A scan that
      // found thirty subscriptions and no bills reported "Scan complete
      // · 0 findings — your inbox looks clean."
      //
      // Now: everything new, filtered to the types the CHECK constraint
      // accepts. toFindingRow returns null for anything else so an
      // unmapped type drops a row instead of rejecting the batch.
      const findingRows = allNew
        .map((o: any) => toFindingRow(o, user.id, sessionId))
        .filter((r): r is Record<string, unknown> => r !== null);
      if (findingRows.length > 0) {
        await admin.from('email_scan_findings').insert(findingRows)
          .then(({ error: e }) => { if (e) console.error('[gmail-scan] email_scan_findings insert:', e.message); });
      }

      // ---- 2. dispute_correspondence — link to open disputes by provider name ----
      if (disputeResps.length > 0) {
        // Try to match each dispute response to an open dispute record
        const { data: openDisputes } = await admin
          .from('disputes')
          .select('id, provider_name')
          .eq('user_id', user.id)
          .not('status', 'in', '(resolved,dismissed)');

        const disputeMap = new Map((openDisputes || []).map((d: any) => [d.provider_name?.toLowerCase(), d.id]));

        await admin.from('dispute_correspondence').insert(
          disputeResps.map((o: any) => {
            const disputeId = disputeMap.get(o.provider?.toLowerCase()) || null;
            return {
              user_id: user.id,
              dispute_id: disputeId,
              email_id: o.emailId || null,
              provider: o.provider || 'Unknown',
              subject: o.title,
              email_date: new Date().toISOString(),
              correspondence_type: o.correspondenceType || 'unknown',
              summary: o.description || null,
              suggested_action: o.suggestedAction || 'dispute',
              status: 'new',
            };
          })
        ).then(({ error: e }) => { if (e) console.error('[gmail-scan] dispute_correspondence insert:', e.message); });

        // Also log to email_scan_findings for unified querying
        await admin.from('email_scan_findings').insert(
          disputeResps.map((o: any) => ({
            user_id: user.id,
            scan_session_id: sessionId,
            finding_type: 'dispute_response',
            provider: o.provider || 'Unknown',
            email_id: o.emailId || null,
            title: o.title,
            description: o.description || null,
            confidence: o.confidence || 70,
            urgency: o.urgency || 'soon',
            status: 'new',
            metadata: { ...o, correspondenceType: o.correspondenceType },
          }))
        ).then(({ error: e }) => { if (e) console.error('[gmail-scan] email_scan_findings (dispute_resp) insert:', e.message); });
      }

      // ---- 3. cancellation_tracking — match to subscriptions by provider name ----
      if (cancels.length > 0) {
        const { data: activeSubs } = await admin
          .from('subscriptions')
          .select('id, provider_name')
          .eq('user_id', user.id)
          .eq('status', 'active');

        const subMap = new Map((activeSubs || []).map((s: any) => [s.provider_name?.toLowerCase(), s.id]));

        await admin.from('cancellation_tracking').insert(
          cancels.map((o: any) => {
            const subId = subMap.get(o.provider?.toLowerCase()) || null;
            return {
              user_id: user.id,
              subscription_id: subId,
              provider: o.provider || 'Unknown',
              confirmation_email_id: o.emailId || null,
              confirmation_detected_at: new Date().toISOString(),
              effective_date: o.nextPaymentDate || null,
              status: 'confirmed',
            };
          })
        ).then(({ error: e }) => { if (e) console.error('[gmail-scan] cancellation_tracking insert:', e.message); });

        // Mark matched subscriptions as cancelled
        for (const o of cancels) {
          const subId = subMap.get(o.provider?.toLowerCase());
          if (subId) {
            await admin.from('subscriptions').update({ status: 'cancelled' }).eq('id', subId)
              .then(({ error: e }) => { if (e) console.error('[gmail-scan] subscription cancel update:', e.message); });
          }
        }

        // Log to email_scan_findings
        await admin.from('email_scan_findings').insert(
          cancels.map((o: any) => ({
            user_id: user.id,
            scan_session_id: sessionId,
            finding_type: 'cancellation_confirmation',
            provider: o.provider || 'Unknown',
            email_id: o.emailId || null,
            title: o.title,
            description: o.description || null,
            due_date: o.nextPaymentDate || null,
            confidence: o.confidence || 70,
            urgency: 'routine',
            status: 'new',
            metadata: o,
          }))
        ).then(({ error: e }) => { if (e) console.error('[gmail-scan] email_scan_findings (cancel) insert:', e.message); });
      }

      // ---- 4. Bank cross-reference: subscriptions in email but not in bank ----
      // Find email-detected subscriptions with a known monthly amount that have no
      // matching bank transaction from that provider in the last 90 days
      if (subs.length > 0) {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentTx } = await admin
          .from('bank_transactions')
          .select('merchant_name, description')
          .eq('user_id', user.id)
          .gte('timestamp', ninetyDaysAgo)
          .lt('amount', 0);

        const bankMerchants = new Set(
          (recentTx || []).flatMap((t: any) => [
            (t.merchant_name || '').toLowerCase(),
            (t.description || '').toLowerCase(),
          ])
        );

        const bankGaps = subs.filter((o: any) => {
          const name = (o.provider || '').toLowerCase();
          return !Array.from(bankMerchants).some(m => m.includes(name.substring(0, 6)) || name.includes((m as string).substring(0, 6)));
        });

        if (bankGaps.length > 0) {
          await admin.from('email_scan_findings').insert(
            bankGaps.map((o: any) => ({
              user_id: user.id,
              scan_session_id: sessionId,
              finding_type: 'bank_gap',
              provider: o.provider || 'Unknown',
              email_id: o.emailId || null,
              title: `${o.provider} subscription not seen in your bank`,
              description: `${o.provider} appears in your emails as a subscription but has no matching transaction in your bank in the last 90 days. It may be charged to a card not connected to Paybacker, paid by a third party, or already cancelled.`,
              amount: o.paymentAmount || o.amount || null,
              payment_frequency: o.paymentFrequency || null,
              confidence: 65,
              urgency: 'routine',
              status: 'new',
              metadata: o,
            }))
          ).then(({ error: e }) => { if (e) console.error('[gmail-scan] email_scan_findings (bank_gap) insert:', e.message); });

          // Add bank_gap to the findings for notification
          opportunities = [...opportunities, ...bankGaps.map((o: any) => ({ ...o, type: 'bank_gap', title: `${o.provider} subscription not seen in your bank` }))];
        }
      }

      // ---- 5. tasks + subscriptions + money_hub_alerts (existing behaviour) ----
      const newOpportunities = [...subs, ...standard.filter((o: any) => !subs.includes(o))];
      if (newOpportunities.length > 0) {
        await admin.from('tasks').insert(
          newOpportunities.map((o: any) => ({
            user_id: user.id,
            type: 'opportunity',
            title: o.title,
            description: JSON.stringify(o),
            provider_name: o.provider,
            source: 'gmail_scan',
            status: o.confidence < 70 ? 'suggested' : 'pending_review',
            priority: o.confidence >= 80 ? 'high' : o.confidence >= 60 ? 'medium' : 'low',
          }))
        );

        if (subs.length > 0) {
          // Only insert providers that aren't already tracked (by canonical
          // recurring_group). Without this filter the partial unique index
          // from 20260422020000 would reject the whole batch and nothing
          // would land. Also fixes a latent bug: the previous code wrote
          // `next_payment_date`, which isn't a column on `subscriptions` —
          // the correct field is `next_billing_date`.
          const { data: existingKeysRows } = await admin
            .from('subscriptions')
            .select('recurring_group')
            .eq('user_id', user.id);
          const existingKeysSet = new Set(
            (existingKeysRows || [])
              .map((r: { recurring_group: string | null }) => r.recurring_group)
              .filter((k: string | null): k is string => !!k)
          );

          // Two passes of dedup:
          //  1. Drop providers already tracked in DB (existingKeysSet).
          //  2. Dedup duplicates *within this scan result* by
          //     recurring_group — without this, two opportunities that
          //     normalise to the same key would violate the partial
          //     unique index from 20260422020000 and the whole batch
          //     would fail.
          const seenKeys = new Set<string>();
          const subsToInsert = subs
            .map((o: any) => {
              const providerName = o.provider || 'Unknown';
              return { o, providerName, key: deriveRecurringGroup(providerName) };
            })
            .filter(({ key }: { key: string | null }) => !key || !existingKeysSet.has(key))
            .filter(({ key }: { key: string | null }) => {
              if (!key) return true;
              if (seenKeys.has(key)) return false;
              seenKeys.add(key);
              return true;
            })
            .map(({ o, providerName, key }: { o: any; providerName: string; key: string | null }) => ({
              user_id: user.id,
              provider_name: providerName,
              amount: o.amount || o.paymentAmount || 0,
              billing_cycle: o.paymentFrequency === 'yearly' ? 'yearly' : (o.paymentFrequency === 'quarterly' ? 'quarterly' : 'monthly'),
              status: 'active',
              source: 'gmail_scan',
              category: o.category || 'other',
              next_billing_date: o.nextPaymentDate || null,
              contract_end_date: o.contractEndDate || null,
              notes: o.description,
              recurring_group: key,
            }));

          if (subsToInsert.length > 0) {
            await admin.from('subscriptions').insert(subsToInsert)
              .then(({ error: e }: { error: { message: string } | null }) => {
                if (e) console.error('[gmail-scan] subscriptions insert:', e.message);
              });
          }
        }

        // alert_type has a 14-value CHECK constraint and the scanner
        // emits types outside it. Because this is a single batch, one
        // unmappable row rejected every valid alert with it. Mapped and
        // filtered now — see toMoneyHubAlertType.
        const alertRows = newOpportunities
          .filter((o: any) => o.type !== 'subscription' && o.type !== 'forgotten_subscription')
          .map((o: any) => toMoneyHubAlertRow(o, user.id))
          .filter((r): r is Record<string, unknown> => r !== null);
        if (alertRows.length > 0) {
          await admin.from('money_hub_alerts').insert(alertRows)
            .then(({ error: e }) => { if (e) console.error('[gmail-scan] money_hub_alerts insert:', e.message); });
        }
      }

      // scanned_receipts for the Scanner UI
      const today2 = new Date().toISOString().split('T')[0];
      if (allNew.length > 0) {
        await admin.from('scanned_receipts').insert(
          allNew.map((o: any) => ({
            user_id: user.id,
            provider_name: o.provider || 'Unknown',
            receipt_type: o.category || o.type || 'other',
            amount: o.amount || 0,
            receipt_date: today2,
            image_url: o.provider || 'scan',
            extracted_data: o,
          }))
        ).then(({ error: e }) => { if (e) console.error('[gmail-scan] scanned_receipts insert:', e.message); });
      }

      // ---- 6. Queue actionable findings for the daily Telegram digest ----
      // Nothing is sent immediately — findings are batched and delivered once
      // per day by the evening-summary cron. Deduped by (user_id, reference_key)
      // so re-scanning the same month never re-queues the same item.
      const { data: telegramSession } = await admin
        .from('telegram_sessions')
        .select('telegram_chat_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (telegramSession?.telegram_chat_id) {
        const chatId = Number(telegramSession.telegram_chat_id);
        const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);

        // Price increases (highest priority)
        for (const p of priceAlerts.slice(0, 3)) {
          const change = p.paymentAmount && p.previousAmount
            ? Number(p.paymentAmount) - Number(p.previousAmount)
            : null;
          await queueTelegramAlert(admin, {
            userId:       user.id,
            chatId,
            alertType:    'price_increase',
            providerName: p.provider,
            amount:       p.paymentAmount ? Number(p.paymentAmount) : undefined,
            amountChange: change ?? undefined,
            referenceKey: `scan_price_${slugify(p.provider)}_${monthKey}`,
            sourceId:     p.id ?? undefined,
            metadata:     { source: 'email_scan' },
          });
        }

        // Bills
        for (const b of bills.slice(0, 3)) {
          await queueTelegramAlert(admin, {
            userId:       user.id,
            chatId,
            alertType:    'bill_detected',
            providerName: b.provider,
            amount:       b.paymentAmount ? Number(b.paymentAmount) : undefined,
            referenceKey: `scan_bill_${slugify(b.provider)}_${monthKey}`,
            sourceId:     b.id ?? undefined,
            metadata:     { source: 'email_scan', urgency: b.urgency },
          });
        }

        // Bank gaps (subscriptions in email but not in bank)
        const bankGapFindings = opportunities.filter((o: any) => o.type === 'bank_gap');
        for (const g of bankGapFindings.slice(0, 3)) {
          await queueTelegramAlert(admin, {
            userId:       user.id,
            chatId,
            alertType:    'subscription_detected',
            providerName: g.provider,
            amount:       g.paymentAmount ? Number(g.paymentAmount) : undefined,
            referenceKey: `scan_sub_${slugify(g.provider)}_${monthKey}`,
            sourceId:     g.id ?? undefined,
            metadata:     { source: 'email_scan' },
          });
        }

        // Dispute responses
        for (const d of disputeResps.slice(0, 2)) {
          await queueTelegramAlert(admin, {
            userId:       user.id,
            chatId,
            alertType:    'dispute_response',
            providerName: d.provider,
            referenceKey: `scan_dispute_${slugify(d.provider)}_${monthKey}`,
            sourceId:     d.id ?? undefined,
            metadata:     { source: 'email_scan', correspondenceType: (d as any).correspondenceType },
          });
        }

        // Mark scan findings as queued (fire-and-forget)
        void admin.from('email_scan_findings')
          .update({ telegram_notified_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('scan_session_id', sessionId);
      }

      // Return all new findings for the UI
      opportunities = allNew;
    }

    // Stamp last_scanned_at (and last_full_scanned_at after a full scan)
    // on each mailbox that actually scanned, by row id, only after the
    // findings above were persisted. A mailbox that failed keeps its old
    // cursor so the next scan covers what was missed.
    for (const { id, stamp } of pendingStamps) {
      await admin.from('email_connections').update(stamp).eq('id', id);
    }

    return NextResponse.json({
      opportunities,
      emailsFound: totalFound,
      emailsScanned: totalScanned,
      opportunityCount: opportunities.length,
      // Per-mailbox outcome (additive). Lets the UI say "2 of 3 inboxes
      // scanned, reconnect x@gmail.com" without another round trip.
      accounts: accountResults,
      scannedAt: new Date().toISOString(),
      // Depth transparency. `scanWindowNotice` is null for paid tiers —
      // a paying user never sees an upsell after a scan they paid for.
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
    console.error('Gmail scan error:', err.message);
    return NextResponse.json({
      error: err.message || 'Scan failed',
      opportunities: [],
      emailsFound: 0,
      emailsScanned: 0,
    }, { status: 500 });
  }
}
