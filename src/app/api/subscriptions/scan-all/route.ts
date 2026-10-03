/**
 * Unified multi-inbox scan. Iterates every active row in `email_connections`
 * for the authed user (Gmail OAuth, Outlook OAuth) and runs the corresponding
 * provider scan. Results are merged, deduped by provider name, and persisted
 * exactly the same way the existing single-provider endpoints do — by
 * delegating to the existing /api/gmail/scan and /api/outlook/scan handlers
 * via internal fetch.
 *
 * NOTE / JUDGMENT CALL: rather than duplicating the very large persistence
 * code blocks from gmail/scan + outlook/scan into a third place (a real
 * footgun on a production codebase), the scan-all endpoint REUSES the
 * existing endpoints by calling them server-side with the user's session
 * cookie. This guarantees behaviour stays identical to single-inbox runs and
 * means a future change to either scan only needs to be made in one place.
 *
 * The cancellation-research fire-and-forget is also handled inside the
 * underlying endpoints (via subscriptions/route.ts when manually added) — for
 * scan-detected subscriptions we kick off the same helper here for any
 * provider that came back without an existing cancellation row.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { researchCancellationForProvider } from '@/lib/cancellation-provider';
import { resolveEmailScanWindow, buildScanWindowNotice } from '@/lib/email-scan-window';

export const maxDuration = 300;

type ProviderResult = {
  provider_email: string;
  provider_type: string;
  count: number;
  emailsFound?: number;
  emailsScanned?: number;
  opportunities: any[];
  error?: string;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );

  // Find every active inbox connection for this user.
  // Note: the schema calls this `email_connections` (the task description
  // referred to `email_accounts`).
  const { data: connections } = await admin
    .from('email_connections')
    .select('id, email_address, provider_type, auth_method, status')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (!connections || connections.length === 0) {
    return NextResponse.json({
      error: 'No inbox connected. Connect Gmail or Outlook first.',
      summary: [],
      opportunities: [],
    }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const cookie = request.headers.get('cookie') || '';

  const results: ProviderResult[] = [];

  // /api/gmail/scan and /api/outlook/scan each scan EVERY active inbox of
  // their provider. So call each endpoint once, not once per connection:
  // calling per connection meant N inboxes ran N full scans (N Haiku
  // calls each) and timed out. The two providers run in parallel (each
  // is its own function invocation with its own 300s limit), and each
  // call is aborted at 285s so this route answers inside its own 300s.
  const endpoints = new Map<string, typeof connections>();
  for (const conn of connections) {
    const provider = (conn.provider_type || '').toLowerCase();
    let path: string | null = null;
    if (provider === 'google' || provider === 'gmail') path = '/api/gmail/scan';
    else if (provider === 'outlook' || provider === 'microsoft') path = '/api/outlook/scan';

    if (!path) {
      results.push({
        provider_email: conn.email_address,
        provider_type: provider,
        count: 0,
        opportunities: [],
        error: 'Unsupported provider type for scan-all (IMAP not yet wired)',
      });
      continue;
    }
    const list = endpoints.get(path) ?? [];
    list.push(conn);
    endpoints.set(path, list);
  }

  const providerRuns = await Promise.all(
    Array.from(endpoints.entries()).map(async ([path, conns]) => {
      const providerType = path === '/api/gmail/scan' ? 'google' : 'outlook';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 285_000);
      try {
        const res = await fetch(`${origin}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          signal: controller.signal,
        });
        const body = await res.json().catch(() => ({}));
        return { providerType, conns, ok: res.ok, status: res.status, body };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Scan failed';
        return { providerType, conns, ok: false, status: 0, body: { error: msg } };
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  for (const run of providerRuns) {
    const opps = run.ok && Array.isArray(run.body?.opportunities) ? run.body.opportunities : [];
    if (!run.ok) {
      // Whole provider failed: report it against each of its inboxes.
      for (const conn of run.conns) {
        results.push({
          provider_email: conn.email_address,
          provider_type: run.providerType,
          count: 0,
          opportunities: [],
          error: run.body?.error || `Scan failed (${run.status})`,
        });
      }
      continue;
    }
    // Per-inbox summary from the endpoint's `accounts` array. The
    // findings themselves are provider-level, so they are attached once.
    const accounts: Array<{ email: string; status: string; error?: string; emailsFound?: number; emailsScanned?: number; opportunities?: number }> =
      Array.isArray(run.body?.accounts) ? run.body.accounts : [];
    if (accounts.length === 0) {
      results.push({
        provider_email: run.conns.map((c) => c.email_address).join(', '),
        provider_type: run.providerType,
        count: opps.length,
        emailsFound: run.body?.emailsFound,
        emailsScanned: run.body?.emailsScanned,
        opportunities: opps,
      });
      continue;
    }
    accounts.forEach((a, i) => {
      results.push({
        provider_email: a.email,
        provider_type: run.providerType,
        count: a.opportunities ?? 0,
        emailsFound: a.emailsFound,
        emailsScanned: a.emailsScanned,
        opportunities: i === 0 ? opps : [],
        ...(a.status === 'scanned' ? {} : { error: a.error || a.status }),
      });
    });
  }

  // Merge + dedupe across all inboxes by (provider name, type) — favours the
  // entry with the higher confidence / non-null amount.
  const merged = new Map<string, any>();
  for (const r of results) {
    for (const o of r.opportunities) {
      const key = `${(o.provider || '').toLowerCase()}|${o.type || ''}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, o);
        continue;
      }
      const better =
        (o.paymentAmount && !existing.paymentAmount) ||
        (Number(o.confidence || 0) > Number(existing.confidence || 0));
      if (better) merged.set(key, o);
    }
  }
  const combined = Array.from(merged.values());

  // Fire-and-forget cancellation research for any newly-detected subscription
  // providers. Idempotent — the helper bails if a cache row exists.
  const seenProviders = new Set<string>();
  for (const o of combined) {
    if ((o.type === 'subscription' || o.type === 'forgotten_subscription') && o.provider) {
      const k = String(o.provider).toLowerCase();
      if (seenProviders.has(k)) continue;
      seenProviders.add(k);
      void researchCancellationForProvider(String(o.provider)).catch(() => {});
    }
  }

  // The per-inbox endpoints each return their own notice keyed to their
  // own count. Rebuild it once here against the DEDUPED total so the
  // multi-inbox surface quotes the number the user can actually see.
  const scanWindow = await resolveEmailScanWindow(user.id);

  return NextResponse.json({
    summary: results.map(r => ({
      provider_email: r.provider_email,
      provider_type: r.provider_type,
      count: r.count,
      emailsFound: r.emailsFound,
      emailsScanned: r.emailsScanned,
      error: r.error,
    })),
    opportunities: combined,
    opportunityCount: combined.length,
    inboxesScanned: results.length,
    scannedAt: new Date().toISOString(),
    scanWindow: {
      days: scanWindow.days,
      tier: scanWindow.tier,
      capped: scanWindow.capped,
      fullWindowDays: scanWindow.fullWindowDays,
      sinceISO: scanWindow.sinceISO,
    },
    scanWindowNotice: buildScanWindowNotice(scanWindow, combined.length),
  });
}
