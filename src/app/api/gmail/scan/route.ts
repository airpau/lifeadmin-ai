import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken } from '@/lib/gmail';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';
import { checkClaudeRateLimit, recordClaudeCall } from '@/lib/claude-rate-limit';
import { getUserPlan } from '@/lib/get-user-plan';
import { queueTelegramAlert } from '@/lib/telegram/queue';

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

      // ---- 1. email_scan_findings — bills, contracts, price alerts ----
      const findingsToInsert = [...bills, ...contracts, ...priceAlerts];
      if (findingsToInsert.length > 0) {
        await admin.from('email_scan_findings').insert(
          findingsToInsert.map((o: any) => ({
            user_id: user.id,
            scan_session_id: sessionId,
            finding_type: o.type === 'price_increase' ? 'price_increase' : o.type,
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
            metadata: o,
          }))
        ).then(({ error: e }) => { if (e) console.error('[gmail-scan] email_scan_findings insert:', e.message); });
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
          await admin.from('subscriptions').insert(
            subs.map((o: any) => ({
              user_id: user.id,
              provider_name: o.provider || 'Unknown',
              amount: o.amount || o.paymentAmount || 0,
              billing_cycle: o.paymentFrequency === 'yearly' ? 'yearly' : (o.paymentFrequency === 'quarterly' ? 'quarterly' : 'monthly'),
              status: 'active',
              source: 'gmail_scan',
              category: o.category || 'other',
              next_payment_date: o.nextPaymentDate || null,
              contract_end_date: o.contractEndDate || null,
              notes: o.description,
              detected_at: new Date().toISOString(),
            }))
          ).then(({ error: e }) => { if (e) console.error('[gmail-scan] subscriptions insert:', e.message); });
        }

        const alerts = newOpportunities.filter((o: any) => o.type !== 'subscription' && o.type !== 'forgotten_subscription');
        if (alerts.length > 0) {
          await admin.from('money_hub_alerts').insert(
            alerts.map((o: any) => ({
              user_id: user.id,
              type: o.type,
              title: o.title,
              description: o.description,
              value_gbp: o.amount || 0,
              status: 'active',
              metadata: o,
            }))
          ).then(({ error: e }) => { if (e) console.error('[gmail-scan] money_hub_alerts insert:', e.message); });
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

    // Stamp last_scanned_at so the dashboard staleness check won't re-fire on the next page load.
    // Scoped to provider_type=google so Outlook/IMAP connections are not incorrectly marked as scanned.
    await admin.from('email_connections')
      .update({ last_scanned_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('provider_type', 'google')
      .eq('status', 'active');

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
