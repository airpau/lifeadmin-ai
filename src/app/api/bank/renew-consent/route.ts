import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { reconfirmConsent } from '@/lib/yapily';

/**
 * POST /api/bank/renew-consent
 *
 * Renews a user's Yapily bank consent (UK 90-day cycle).
 *
 * Body: { connectionId: string }
 *
 * 1. Verifies authenticated user
 * 2. Finds the bank_connection and checks ownership + eligible status
 * 3. Calls Yapily reconfirmConsent API
 * 4. On success: extends consent_expires_at by 90 days, sets status to 'active'
 * 5. On failure: returns error suggesting full reconnection
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ──
  let body: { connectionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { connectionId } = body;
  if (!connectionId) {
    return NextResponse.json(
      { error: 'connectionId is required' },
      { status: 400 }
    );
  }

  // ── Fetch connection (use admin client to bypass RLS for update) ──
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: connection, error: connError } = await admin
    .from('bank_connections')
    .select('id, user_id, consent_token, yapily_consent_id, status, bank_name')
    .eq('id', connectionId)
    .single();

  if (connError || !connection) {
    return NextResponse.json(
      { error: 'Bank connection not found' },
      { status: 404 }
    );
  }

  // ── Verify ownership ──
  if (connection.user_id !== user.id) {
    return NextResponse.json(
      { error: 'Bank connection not found' },
      { status: 404 }
    );
  }

  // ── Check status is eligible for renewal ──
  if (!['expiring_soon', 'expired'].includes(connection.status)) {
    return NextResponse.json(
      {
        error: `Connection status is '${connection.status}'. Only connections with status 'expiring_soon' or 'expired' can be renewed.`,
      },
      { status: 400 }
    );
  }

  // ── Check consent identifiers exist ──
  // reconfirmConsent calls PUT /account-auth-requests/{consentId} — that's
  // the opaque Yapily consent identifier, NOT the consent_token (the
  // credential we attach to data calls). The pre-2026-04-27 callback stored
  // only consent_token, so legacy connections may have null yapily_consent_id;
  // in that case the user must full-reconnect, since we don't have the URL
  // path component the renew endpoint requires.
  if (!connection.yapily_consent_id) {
    return NextResponse.json(
      {
        error:
          'This bank connection predates our 90-day renewal flow. Please disconnect and reconnect to enable in-place renewal.',
      },
      { status: 400 }
    );
  }

  // ── Call Yapily reconfirmConsent ──
  try {
    await reconfirmConsent(connection.yapily_consent_id);

    // Success — extend consent by 90 days
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await admin
      .from('bank_connections')
      .update({
        status: 'active',
        consent_granted_at: now.toISOString(),
        consent_expires_at: expiresAt.toISOString(),
        // Threshold counter resets on renewal — the renewed consent is a
        // fresh credential, so any past sync failures are no longer
        // relevant.
        consent_failure_count: 0,
        consent_last_failure_at: null,
        updated_at: now.toISOString(),
      })
      .eq('id', connectionId);

    console.log(
      `Consent renewed: connection=${connectionId} user=${user.id} expires=${expiresAt.toISOString()}`
    );

    return NextResponse.json({
      ok: true,
      message: 'Bank consent renewed successfully',
      consent_expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('Consent renewal failed:', err);

    return NextResponse.json(
      {
        error:
          'Failed to renew consent. Please disconnect and reconnect your bank account.',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
