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

    try {
      const res = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        results.push({
          provider_email: conn.email_address,
          provider_type: provider,
          count: 0,
          opportunities: [],
          error: body?.error || `Scan failed (${res.status})`,
        });
        continue;
      }
      const opps = Array.isArray(body.opportunities) ? body.opportunities : [];
      results.push({
        provider_email: conn.email_address,
        provider_type: provider,
        count: opps.length,
        emailsFound: body.emailsFound,
        emailsScanned: body.emailsScanned,
        opportunities: opps,
      });
    } catch (err: any) {
      results.push({
        provider_email: conn.email_address,
        provider_type: provider,
        count: 0,
        opportunities: [],
        error: err?.message || 'Scan failed',
      });
    }
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
  });
}
