// src/app/api/admin/yapily/test-consent-extension/route.ts
//
// Founder-only harness for the UK 90-day consent reconfirmation flow.
//
// Why this exists
// ───────────────
// Migle Ivanauskaite (Yapily) asked, on the 2026-08-20 pre-launch call,
// that we prove the extend-consent path works BEFORE live UK bank
// connections are switched on — using a sandbox bank (NatWest sandbox)
// rather than waiting 90 days for a real consent to age out.
//
// That test is awkward to do by hand: it needs a consent id, an
// authenticated call to Yapily, and a before/after comparison of
// lastConfirmedAt and reconfirmBy to show the clock actually moved. This
// route does all three and returns the diff.
//
// It is a diagnostic, not a product surface:
//   • Read-mostly. The single mutation is the extend call itself, which
//     is the thing under test, and it only ever moves a consent's
//     reconfirmation clock forward — it cannot revoke access or touch
//     transaction data.
//   • Admin or CRON_SECRET only, via authorizeAdminOrCron.
//   • dryRun defaults to TRUE. You have to ask for the mutation.
//
// Usage:
//   GET  ?connectionId=<uuid>              → inspect the consent only
//   POST { connectionId, dryRun: false }   → inspect, extend, re-inspect

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { getConsent, reconfirmConsent } from '@/lib/yapily';

export const maxDuration = 60;

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ConsentSummary {
  id?: string;
  status?: string;
  institutionId?: string;
  createdAt?: string;
  authorizedAt?: string;
  expiresAt?: string;
  lastConfirmedAt?: string;
  reconfirmBy?: string;
  featureScope?: string[];
}

function summarise(consent: Awaited<ReturnType<typeof getConsent>> | null): ConsentSummary | null {
  if (!consent) return null;
  return {
    id: consent.id,
    status: consent.status,
    institutionId: consent.institutionId,
    createdAt: consent.createdAt,
    authorizedAt: consent.authorizedAt,
    expiresAt: consent.expiresAt,
    lastConfirmedAt: consent.lastConfirmedAt,
    reconfirmBy: consent.reconfirmBy,
    featureScope: consent.featureScope,
  };
}

/**
 * Resolves the Yapily consent id to test against.
 *
 * Accepts a consentId directly (useful for a sandbox consent that was
 * never persisted) or a connectionId, which is the normal case.
 */
async function resolveConsentId(
  searchParams: URLSearchParams,
  body: Record<string, unknown>,
): Promise<{ consentId: string; connectionId: string | null } | { error: string; status: number }> {
  const directConsentId =
    (body.consentId as string | undefined) || searchParams.get('consentId');
  if (directConsentId) return { consentId: directConsentId, connectionId: null };

  const connectionId =
    (body.connectionId as string | undefined) || searchParams.get('connectionId');
  if (!connectionId) {
    return { error: 'Provide either connectionId or consentId', status: 400 };
  }

  const { data, error } = await getAdmin()
    .from('bank_connections')
    .select('id, yapily_consent_id, bank_name, institution_id, status, consent_expires_at')
    .eq('id', connectionId)
    .maybeSingle();

  if (error) return { error: `Lookup failed: ${error.message}`, status: 500 };
  if (!data) return { error: 'Bank connection not found', status: 404 };
  if (!data.yapily_consent_id) {
    return {
      // Pre-2026-04-27 rows stored only consent_token, never the
      // consent id the extend endpoint needs in its path.
      error: 'This connection predates yapily_consent_id — it cannot be extended, only reconnected',
      status: 400,
    };
  }
  return { consentId: data.yapily_consent_id, connectionId: data.id };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const resolved = await resolveConsentId(searchParams, {});
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  try {
    const consent = await getConsent(resolved.consentId);
    return NextResponse.json({
      ok: true,
      mode: 'inspect',
      consentId: resolved.consentId,
      connectionId: resolved.connectionId,
      consent: summarise(consent),
      hint: 'POST with { dryRun: false } to call the extend endpoint and compare before/after.',
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'inspect',
        error: err instanceof Error ? err.message : 'Unknown error',
        status: (err as { status?: number })?.status ?? null,
        tracingId: (err as { tracingId?: string })?.tracingId ?? null,
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // An empty body is fine — params can come from the query string.
  }

  const { searchParams } = new URL(request.url);
  const resolved = await resolveConsentId(searchParams, body);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // Defaults to a dry run. Extending a consent is safe, but this is a
  // route that calls a live third-party API against production data, so
  // the mutation should be an explicit choice rather than the default
  // behaviour of a URL someone might open to "have a look".
  const dryRun = body.dryRun !== false && searchParams.get('dryRun') !== 'false';

  let before: ConsentSummary | null = null;
  try {
    before = summarise(await getConsent(resolved.consentId));
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'before',
        error: err instanceof Error ? err.message : 'Unknown error',
        status: (err as { status?: number })?.status ?? null,
        tracingId: (err as { tracingId?: string })?.tracingId ?? null,
      },
      { status: 502 },
    );
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      mode: 'dry_run',
      consentId: resolved.consentId,
      connectionId: resolved.connectionId,
      before,
      wouldSend: {
        method: 'POST',
        path: `/consents/${resolved.consentId}/extend`,
        // Mirrors what reconfirmConsent builds: mandatory, and
        // back-dated so clock skew can't produce Yapily's
        // "lastConfirmedAt cannot be a future date and time" 400.
        body: { lastConfirmedAt: new Date(Date.now() - 30_000).toISOString() },
      },
      hint: 'Re-POST with { "dryRun": false } to actually extend.',
    });
  }

  let extended: ConsentSummary | null = null;
  try {
    extended = summarise(await reconfirmConsent(resolved.consentId));
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        stage: 'extend',
        before,
        error: err instanceof Error ? err.message : 'Unknown error',
        status: (err as { status?: number })?.status ?? null,
        tracingId: (err as { tracingId?: string })?.tracingId ?? null,
      },
      { status: 502 },
    );
  }

  // Read the consent back independently rather than trusting the extend
  // response alone — the point of the exercise is to prove the change
  // persisted on Yapily's side, not that one response echoed our input.
  let after: ConsentSummary | null = null;
  try {
    after = summarise(await getConsent(resolved.consentId));
  } catch {
    // Non-fatal: the extend succeeded, we just couldn't re-read.
  }

  const movedForward = (a?: string, b?: string): boolean | null => {
    if (!a || !b) return null;
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
    return tb > ta;
  };

  // Keep our copy in step with Yapily's. Without this the admin test
  // would leave the DB claiming an expiry Yapily no longer agrees with.
  if (resolved.connectionId && (after ?? extended)) {
    const authoritative = after ?? extended!;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (authoritative.reconfirmBy) {
      update.consent_reconfirm_by = authoritative.reconfirmBy;
      update.consent_expires_at = authoritative.reconfirmBy;
    } else if (authoritative.expiresAt) {
      update.consent_expires_at = authoritative.expiresAt;
    }
    if (authoritative.lastConfirmedAt) {
      update.consent_last_confirmed_at = authoritative.lastConfirmedAt;
    }
    await getAdmin().from('bank_connections').update(update).eq('id', resolved.connectionId);
  }

  return NextResponse.json({
    ok: true,
    mode: 'extended',
    consentId: resolved.consentId,
    connectionId: resolved.connectionId,
    before,
    after: after ?? extended,
    // The assertions Migle actually wants to see.
    verification: {
      lastConfirmedAtMovedForward: movedForward(
        before?.lastConfirmedAt,
        (after ?? extended)?.lastConfirmedAt,
      ),
      reconfirmByMovedForward: movedForward(
        before?.reconfirmBy,
        (after ?? extended)?.reconfirmBy,
      ),
      statusAfter: (after ?? extended)?.status ?? null,
    },
  });
}
