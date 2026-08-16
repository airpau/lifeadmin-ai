/**
 * Automated email-scanner cron — added 2026-05-28.
 *
 * Runs nightly at 05:30 UTC (≈06:30 BST in summer, before the 07:30
 * Telegram + WhatsApp morning-summary cron picks up the findings).
 *
 * Why this exists
 * ---------------
 * Until today the email scanner was user-triggered only — they had to
 * click "Scan inbox" from /dashboard for the Watchdog Claude pass to
 * run. The 2026-05-26 morning-brief fix flagged that `email_scan_findings`
 * was almost always empty for users who hadn't clicked Scan recently,
 * which made the brief's "Inbox Findings" section either silent or
 * showing stale rows. Paul wants the brief to land each morning with
 * fresh, real findings — so this cron does the scan on a schedule.
 *
 * What it does
 * ------------
 * For every user with an active Gmail or Outlook OAuth connection:
 *   1. Refresh the OAuth access token (the user-triggered scan paths
 *      do the same — tokens last ~1h and need refresh before every scan).
 *   2. Call the same `scanEmailsForOpportunities` (Gmail) or
 *      `scanOutlookForOpportunities` (Outlook) helper the dashboard
 *      uses — incremental by `last_scanned_at` so we don't re-scan
 *      two years of mail every night.
 *   3. Persist new findings into `email_scan_findings` with
 *      `status='new'`, plus the supporting writes to `tasks`,
 *      `subscriptions`, `money_hub_alerts`, `dispute_correspondence`,
 *      `cancellation_tracking`, `scanned_receipts` — mirroring the
 *      user-triggered path so the dashboard, morning brief, and
 *      Pocket Agent all see the same data.
 *   4. Stamp `last_scanned_at` on the row so the next tick scans
 *      incrementally from there.
 *
 * Caps
 * ----
 * - 100 connections per tick (so a backlog doesn't blow the function
 *   budget). Connections are processed oldest-first by
 *   `last_scanned_at` so the longest-unscanned inboxes win.
 * - Skips connections scanned in the last 12h — covers the case where
 *   the user just clicked Scan from the dashboard, and prevents
 *   thrashing if the cron is invoked manually mid-day.
 * - Skips free-tier users (mirror of the per-route gate — the
 *   user-triggered scan path 403s free-tier; we do the same here so
 *   the cron doesn't quietly run scans the user pays for).
 * - Skips disconnected / expired tokens; surfaces them as
 *   `last_error` on email_connections for the dashboard.
 *
 * Costs
 * -----
 * Every scan is a Claude Sonnet call against the email summary. The
 * helper already calls logClaudeCall + recordClaudeCall — the cron
 * sends the same telemetry. Inbound scan-run quota IS NOT incremented
 * for cron-initiated scans (those are reserved for user-driven scans
 * — the cron is a service-tier benefit, not a counted scan).
 *
 * Run cadence
 * -----------
 * 05:30 UTC daily (`schedule: "30 5 * * *"`). Adjust in vercel.json
 * if the morning brief moves.
 *
 * NOT in scope for this cron
 * --------------------------
 * - IMAP connections (encrypted password flow). Re-enable when the
 *   IMAP scan path is refactored to support a service-side credential
 *   load — for now IMAP users keep scanning manually.
 * - Free-tier users (see Caps above).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { scanEmailsForOpportunities, refreshAccessToken, type Opportunity as GmailOpportunity } from '@/lib/gmail';
import { scanOutlookForOpportunities, refreshMicrosoftToken } from '@/lib/outlook';
import { resolveEmailScanWindow, clampSinceToWindow } from '@/lib/email-scan-window';
import { isAtLeastEssential } from '@/lib/tier-rank';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_CONNECTIONS_PER_RUN = 100;
const MIN_HOURS_BETWEEN_SCANS = 12;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface ConnRow {
  id: string;
  user_id: string;
  provider_type: string;
  auth_method: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  email_address: string | null;
  last_scanned_at: string | null;
  last_full_scanned_at: string | null;
  emails_scanned: number | null;
  status: string;
}

interface ScanOutcome {
  connectionId: string;
  userId: string;
  provider: string;
  email: string | null;
  status: 'scanned' | 'skipped' | 'error';
  emailsFound?: number;
  emailsScanned?: number;
  newFindings?: number;
  error?: string;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdmin();
  const cutoffIso = new Date(Date.now() - MIN_HOURS_BETWEEN_SCANS * 3_600_000).toISOString();

  // Pull eligible connections — Gmail / Outlook OAuth, status='active',
  // oldest scan first. The `.or` includes never-scanned rows alongside
  // ones scanned more than MIN_HOURS_BETWEEN_SCANS ago.
  const { data: conns, error: connErr } = await sb
    .from('email_connections')
    .select(
      'id, user_id, provider_type, auth_method, access_token, refresh_token, token_expiry, email_address, last_scanned_at, last_full_scanned_at, emails_scanned, status',
    )
    .eq('auth_method', 'oauth')
    .in('provider_type', ['google', 'outlook'])
    .eq('status', 'active')
    .or(`last_scanned_at.is.null,last_scanned_at.lt.${cutoffIso}`)
    .order('last_scanned_at', { ascending: true, nullsFirst: true })
    .limit(MAX_CONNECTIONS_PER_RUN);

  if (connErr) {
    console.error('[cron/email-scanner] connection load failed:', connErr.message);
    return NextResponse.json({ ok: false, error: connErr.message }, { status: 500 });
  }
  if (!conns || conns.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, reason: 'no eligible connections' });
  }

  // Pre-load profile tiers so we can skip free-tier users in one go.
  const userIds = Array.from(new Set(conns.map((c) => c.user_id)));
  const { data: profiles } = await sb
    .from('profiles')
    .select('id, subscription_tier')
    .in('id', userIds);
  const tierById = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.id as string, (p as { subscription_tier: string | null }).subscription_tier]),
  );

  const outcomes: ScanOutcome[] = [];
  let totalNewFindings = 0;

  for (const c of conns as ConnRow[]) {
    const tier = tierById.get(c.user_id);
    // Free-tier users are gated on the user-triggered scan path; mirror
    // that here so the cron doesn't grant a benefit that the dashboard
    // refuses.
    // Any paid tier qualifies. A literal essential/pro check would have
    // locked household and dispute_pro users out of their own scans.
    if (!isAtLeastEssential(tier)) {
      outcomes.push({
        connectionId: c.id,
        userId: c.user_id,
        provider: c.provider_type,
        email: c.email_address,
        status: 'skipped',
        error: `free-tier (${tier ?? 'unknown'})`,
      });
      continue;
    }

    try {
      const result = c.provider_type === 'google'
        ? await scanGmail(sb, c)
        : await scanOutlook(sb, c);
      outcomes.push(result);
      if (result.status === 'scanned' && result.newFindings) {
        totalNewFindings += result.newFindings;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/email-scanner] ${c.provider_type} scan threw for connection ${c.id}:`, msg);
      outcomes.push({
        connectionId: c.id,
        userId: c.user_id,
        provider: c.provider_type,
        email: c.email_address,
        status: 'error',
        error: msg,
      });
      // Stamp last_error so the dashboard surfaces it.
      await sb
        .from('email_connections')
        .update({ last_error: msg.slice(0, 500), last_error_at: new Date().toISOString() })
        .eq('id', c.id);
    }
  }

  // Audit row — daily-driver visibility from the founder's
  // business_log feed.
  const scanned = outcomes.filter((o) => o.status === 'scanned').length;
  const skipped = outcomes.filter((o) => o.status === 'skipped').length;
  const errored = outcomes.filter((o) => o.status === 'error').length;
  await sb.from('business_log').insert({
    category: scanned > 0 ? 'action' : 'milestone',
    title: 'Nightly email-scanner sweep',
    content:
      `Scanned ${scanned} inboxes, skipped ${skipped} (free / recent), ` +
      `${errored} errors. ${totalNewFindings} new findings inserted into email_scan_findings.`,
    created_by: 'cron/email-scanner',
  });

  return NextResponse.json({
    ok: true,
    considered: conns.length,
    scanned,
    skipped,
    errored,
    totalNewFindings,
    outcomes: outcomes.slice(0, 50),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// GMAIL — refresh + scan + persist
// ─────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof getAdmin>;

async function scanGmail(sb: AdminClient, conn: ConnRow): Promise<ScanOutcome> {
  // Token refresh — Gmail access tokens expire every ~1h. The
  // user-triggered scan path refreshes before every run; the cron
  // does the same so a stale token doesn't 401 silently.
  let accessToken = conn.access_token ?? '';
  if (!conn.refresh_token) {
    return {
      connectionId: conn.id,
      userId: conn.user_id,
      provider: 'google',
      email: conn.email_address,
      status: 'error',
      error: 'no refresh_token — user must reconnect Gmail',
    };
  }
  try {
    const refreshed = await refreshAccessToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await Promise.all([
      sb.from('gmail_tokens').update({
        access_token: accessToken,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      }).eq('user_id', conn.user_id),
      sb.from('email_connections').update({
        access_token: accessToken,
        token_expiry: newExpiry,
      }).eq('id', conn.id),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      connectionId: conn.id,
      userId: conn.user_id,
      provider: 'google',
      email: conn.email_address,
      status: 'error',
      error: `token refresh failed: ${msg}`,
    };
  }

  // Incremental scan window — same logic as /api/gmail/scan: if the
  // connection has never had a full scan, do one; otherwise look at
  // emails since last_scanned_at (or the last 30 days as a floor).
  const isFullScan = !conn.last_full_scanned_at;
  // Tier lookback cap. The cron runs unattended across every active
  // connection, so this is the highest-volume enforcement point — a free
  // account must not get a 2-year sweep here just because no human is
  // watching. Trial-aware via getEffectiveTier.
  const scanWindow = await resolveEmailScanWindow(conn.user_id);
  const rawSince = isFullScan
    ? null
    : (conn.last_scanned_at || new Date(Date.now() - 30 * 86_400_000).toISOString());
  const sinceISO = clampSinceToWindow(rawSince, scanWindow);

  const scanResult = await scanEmailsForOpportunities(accessToken, {
    sinceISO,
    userId: conn.user_id,
    lookbackDays: scanWindow.days,
  });

  const newFindings = await persistFindings(sb, conn, scanResult.opportunities, 'gmail');

  // Stamp last_scanned_at + last_full_scanned_at if this was a full scan.
  const stamp: Record<string, string | number> = {
    last_scanned_at: new Date().toISOString(),
    emails_scanned: (conn.emails_scanned ?? 0) + scanResult.emailsScanned,
  };
  if (isFullScan) stamp.last_full_scanned_at = new Date().toISOString();
  await sb.from('email_connections').update(stamp).eq('id', conn.id);

  return {
    connectionId: conn.id,
    userId: conn.user_id,
    provider: 'google',
    email: conn.email_address,
    status: 'scanned',
    emailsFound: scanResult.emailsFound,
    emailsScanned: scanResult.emailsScanned,
    newFindings,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// OUTLOOK — refresh + scan + persist
// ─────────────────────────────────────────────────────────────────────────

async function scanOutlook(sb: AdminClient, conn: ConnRow): Promise<ScanOutcome> {
  let accessToken = conn.access_token ?? '';
  if (!conn.refresh_token) {
    return {
      connectionId: conn.id,
      userId: conn.user_id,
      provider: 'outlook',
      email: conn.email_address,
      status: 'error',
      error: 'no refresh_token — user must reconnect Outlook',
    };
  }
  try {
    const refreshed = await refreshMicrosoftToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
    await sb.from('email_connections').update({
      access_token: accessToken,
      token_expiry: newExpiry,
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', conn.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      connectionId: conn.id,
      userId: conn.user_id,
      provider: 'outlook',
      email: conn.email_address,
      status: 'error',
      error: `token refresh failed: ${msg}`,
    };
  }

  // Tier lookback cap — same rule as the Gmail leg above.
  const outlookWindow = await resolveEmailScanWindow(conn.user_id);
  const scanResult = await scanOutlookForOpportunities(accessToken, {
    lookbackDays: outlookWindow.days,
  });
  const newFindings = await persistFindings(sb, conn, scanResult.opportunities, 'outlook');

  await sb.from('email_connections').update({
    last_scanned_at: new Date().toISOString(),
    emails_scanned: (conn.emails_scanned ?? 0) + scanResult.emailsScanned,
  }).eq('id', conn.id);

  return {
    connectionId: conn.id,
    userId: conn.user_id,
    provider: 'outlook',
    email: conn.email_address,
    status: 'scanned',
    emailsFound: scanResult.emailsFound,
    emailsScanned: scanResult.emailsScanned,
    newFindings,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PERSIST — collapsed version of the user-triggered scan persistence
// path that only writes to `email_scan_findings`. The morning brief
// reads from this table, so it's the only one the cron strictly needs
// to populate. Other writes (subscriptions, money_hub_alerts, tasks)
// continue to happen on user-triggered scans where the user explicitly
// asked for them — the cron stays light to keep its blast radius small.
// ─────────────────────────────────────────────────────────────────────────

const FINDING_TYPES = new Set([
  'subscription', 'bill', 'contract', 'dispute_response',
  'cancellation_confirmation', 'price_increase', 'refund_opportunity',
  'flight_delay', 'debt_dispute', 'tax_rebate', 'renewal',
  'forgotten_subscription', 'upcoming_payment', 'deal_expiry',
  'bank_gap',
]);

async function persistFindings(
  sb: AdminClient,
  conn: ConnRow,
  opportunities: ReadonlyArray<GmailOpportunity | Record<string, unknown>>,
  source: 'gmail' | 'outlook',
): Promise<number> {
  if (!opportunities || opportunities.length === 0) return 0;

  // Dedup against existing findings — title OR email_id collision is
  // a re-detection of the same opportunity from a re-scan window.
  const { data: existing } = await sb
    .from('email_scan_findings')
    .select('title, email_id')
    .eq('user_id', conn.user_id);
  const seenTitles = new Set(
    (existing ?? []).map((r) => (r as { title: string | null }).title ?? ''),
  );
  const seenEmailIds = new Set(
    (existing ?? [])
      .map((r) => (r as { email_id: string | null }).email_id)
      .filter((v): v is string => !!v),
  );

  const sessionId = `cron_${Date.now()}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toInsert = (opportunities as any[])
    .filter((o) => FINDING_TYPES.has(o.type))
    .filter((o) => {
      if (o.title && seenTitles.has(o.title)) return false;
      if (o.emailId && seenEmailIds.has(o.emailId)) return false;
      return true;
    })
    .map((o) => ({
      user_id: conn.user_id,
      scan_session_id: sessionId,
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
      source,
      metadata: o,
    }));

  if (toInsert.length === 0) return 0;

  const { error } = await sb.from('email_scan_findings').insert(toInsert);
  if (error) {
    console.error(`[cron/email-scanner] email_scan_findings insert failed (${source}):`, error.message);
    return 0;
  }
  return toInsert.length;
}
