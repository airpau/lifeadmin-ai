import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getTransactions } from '@/lib/yapily';
import {
  getAccessToken as getTrueLayerAccessToken,
  fetchTransactions as fetchTrueLayerTransactions,
} from '@/lib/truelayer';
import { decrypt } from '@/lib/encrypt';
import { detectRecurring } from '@/lib/detect-recurring';
import { getUserPlan } from '@/lib/get-user-plan';
import {
  TIER_CONFIG,
  GLOBAL_DAILY_API_CEILING,
  getTodayApiCallCount,
  checkAndAlertCeiling,
  sendTelegramAlert,
} from '@/lib/bank-tier-config';

export const maxDuration = 60;

interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  // Yapily fields
  consent_token: string | null;
  consent_expires_at: string | null;
  // TrueLayer fields
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  // Common
  account_ids: string[] | null;
  bank_name: string | null;
  status: string;
  last_synced_at: string | null;
  last_manual_sync_at: string | null;
}

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/bank/sync-now
 *
 * Pro-only manual bank sync with rate limiting:
 * - 6-hour cooldown per connection
 * - Max 3 manual syncs per day total across all accounts
 * - Global 500-call/day API ceiling (shared with cron)
 *
 * Body: { connectionId?: string } — omit to sync all active connections
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pro-only feature
  const plan = await getUserPlan(user.id);
  if (plan.tier !== 'pro') {
    const msg = plan.tier === 'essential'
      ? 'Manual sync is a Pro feature. Upgrade to Pro for on-demand syncing.'
      : 'Manual sync requires an Essential or Pro plan.';
    return NextResponse.json({ error: msg, upgradeRequired: true }, { status: 403 });
  }

  const config = TIER_CONFIG.pro;

  // Check daily manual sync limit (3 per day)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: todaySyncCount } = await supabase
    .from('bank_sync_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('trigger_type', 'manual')
    .eq('status', 'success')
    .gte('created_at', todayStart.toISOString());

  if ((todaySyncCount ?? 0) >= config.manualSyncDailyLimit) {
    return NextResponse.json(
      {
        error: `You've reached your daily limit of ${config.manualSyncDailyLimit} manual syncs. Resets at midnight.`,
        rateLimited: true,
        dailyLimitReached: true,
      },
      { status: 429 }
    );
  }

  // Check global daily API ceiling
  const admin = getAdmin();
  const totalCallsToday = await getTodayApiCallCount(admin);

  if (totalCallsToday >= GLOBAL_DAILY_API_CEILING) {
    await sendTelegramAlert(
      `🚨 *Open Banking API ceiling reached*\n\n` +
      `Daily limit of ${GLOBAL_DAILY_API_CEILING} API calls hit.\n` +
      `Manual sync blocked. Resets at midnight UTC.`
    );
    return NextResponse.json(
      { error: 'Service temporarily limited. Please try again tomorrow.' },
      { status: 503 }
    );
  }

  // Parse optional connectionId from body
  let connectionId: string | undefined;
  try {
    const body = await request.json();
    connectionId = body?.connectionId;
  } catch {
    // No body — sync all connections
  }

  // Fetch active bank connection(s) — TrueLayer and Yapily
  let connectionsQuery = supabase
    .from('bank_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('provider', ['truelayer', 'yapily']);

  if (connectionId) {
    connectionsQuery = connectionsQuery.eq('id', connectionId);
  }

  const { data: connections } = await connectionsQuery;

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: 'No active bank connections found.' }, { status: 400 });
  }

  // Enforce 6-hour cooldown on the target connection(s)
  const cooldownMs = config.manualSyncCooldownHours * 60 * 60 * 1000;
  const primaryConn = connections[0];

  if (primaryConn.last_manual_sync_at) {
    const lastSyncTime = new Date(primaryConn.last_manual_sync_at).getTime();
    const cooldownRemaining = lastSyncTime + cooldownMs - Date.now();

    if (cooldownRemaining > 0) {
      const hoursLeft = Math.floor(cooldownRemaining / 3_600_000);
      const minsLeft = Math.floor((cooldownRemaining % 3_600_000) / 60_000);
      return NextResponse.json(
        {
          error: `Sync cooldown active. Available again in ${hoursLeft}h ${minsLeft}m.`,
          rateLimited: true,
          cooldownRemainingMs: cooldownRemaining,
        },
        { status: 429 }
      );
    }
  }

  // Run sync for each connection
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  let totalSynced = 0;
  let apiCallsMade = 0;
  const now = new Date().toISOString();

  for (const conn of connections as BankConnection[]) {
    if (conn.provider === 'truelayer') {
      // === TrueLayer path ===
      if (!conn.access_token) {
        await supabase
          .from('bank_connections')
          .update({ status: 'expired', updated_at: now })
          .eq('id', conn.id);

        await supabase.from('bank_sync_log').insert({
          user_id: user.id,
          connection_id: conn.id,
          trigger_type: 'manual',
          status: 'failed',
          api_calls_made: apiCallsMade,
          error_message: 'No access token — reconnect required',
        });
        continue;
      }

      // Get access token, refreshing if expired — mark connection expired if refresh fails
      let accessToken: string;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accessToken = await getTrueLayerAccessToken(conn as any);
      } catch {
        await supabase
          .from('bank_connections')
          .update({ status: 'expired', updated_at: now })
          .eq('id', conn.id);

        await supabase.from('bank_sync_log').insert({
          user_id: user.id,
          connection_id: conn.id,
          trigger_type: 'manual',
          status: 'failed',
          api_calls_made: apiCallsMade,
          error_message: 'Token refresh failed — reconnect required',
        });

        return NextResponse.json(
          {
            error: 'Your bank connection has expired. Please reconnect your bank account.',
            reconnectRequired: true,
          },
          { status: 401 }
        );
      }

      const accountIds = conn.account_ids || [];
      for (const accountId of accountIds) {
        try {
          const transactions = await fetchTrueLayerTransactions(accessToken, accountId, ninetyDaysAgo);
          apiCallsMade++;

          if (transactions.length === 0) continue;

          const rows = transactions.map((tx) => ({
            user_id: user.id,
            connection_id: conn.id,
            transaction_id: tx.transaction_id,
            account_id: accountId,
            amount: tx.amount,
            currency: tx.currency || 'GBP',
            description: tx.description || null,
            merchant_name: tx.merchant_name || null,
            category: null,
            timestamp: tx.timestamp,
          }));

          const { error } = await supabase
            .from('bank_transactions')
            .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

          if (!error) totalSynced += rows.length;
        } catch {
          // Non-fatal per-account error — continue with next account
        }
      }
    } else {
      // === Yapily path ===
      if (!conn.consent_token) {
        await supabase
          .from('bank_connections')
          .update({ status: 'expired', updated_at: now })
          .eq('id', conn.id);

        await supabase.from('bank_sync_log').insert({
          user_id: user.id,
          connection_id: conn.id,
          trigger_type: 'manual',
          status: 'failed',
          api_calls_made: apiCallsMade,
          error_message: 'No consent token — reconnect required',
        });
        continue;
      }

      // Check consent expiry (Yapily consents are valid for 90 days)
      if (conn.consent_expires_at) {
        const expiresAt = new Date(conn.consent_expires_at).getTime();
        if (Date.now() >= expiresAt) {
          await supabase
            .from('bank_connections')
            .update({ status: 'expired', updated_at: now })
            .eq('id', conn.id);

          await supabase.from('bank_sync_log').insert({
            user_id: user.id,
            connection_id: conn.id,
            trigger_type: 'manual',
            status: 'failed',
            api_calls_made: apiCallsMade,
            error_message: 'Consent expired — reconnect required',
          });
          continue;
        }
      }

      const consentToken = decrypt(conn.consent_token);

      const accountIds = conn.account_ids || [];
      for (const accountId of accountIds) {
        try {
          const fromDate = ninetyDaysAgo.toISOString().split('T')[0];
          const toDate = new Date().toISOString().split('T')[0];
          const transactions = await getTransactions(accountId, consentToken, fromDate, toDate);
          apiCallsMade++;

          if (transactions.length === 0) continue;

          const rows = transactions.map((tx) => ({
            user_id: user.id,
            connection_id: conn.id,
            transaction_id: tx.id,
            account_id: accountId,
            amount: tx.transactionAmount.amount,
            currency: tx.transactionAmount.currency || 'GBP',
            description: tx.description || null,
            merchant_name: tx.merchantName || null,
            category: null,
            timestamp: tx.bookingDateTime,
          }));

          const { error } = await supabase
            .from('bank_transactions')
            .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

          if (!error) totalSynced += rows.length;
        } catch {
          // Non-fatal per-account error — continue with next account
        }
      }
    }

    // Update sync timestamps
    await supabase
      .from('bank_connections')
      .update({
        last_synced_at: now,
        last_manual_sync_at: now,
        updated_at: now,
      })
      .eq('id', conn.id);

    // Log success
    await supabase.from('bank_sync_log').insert({
      user_id: user.id,
      connection_id: conn.id,
      trigger_type: 'manual',
      status: 'success',
      api_calls_made: apiCallsMade,
    });
  }

  // Run recurring payment detection
  const recurringDetected = await detectRecurring(user.id, supabase);

  // Check if we've crossed the 80% ceiling alert threshold
  await checkAndAlertCeiling(totalCallsToday, totalCallsToday + apiCallsMade);

  return NextResponse.json({
    synced: totalSynced,
    recurring_detected: recurringDetected,
  });
}
