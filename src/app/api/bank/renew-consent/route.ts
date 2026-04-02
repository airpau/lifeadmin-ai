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
    .select('id, user_id, consent_token, status, bank_name')
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

  // ── Check consent token exists ──
  if (!connection.consent_token) {
    return NextResponse.json(
      {
        error:
          'No consent token found. Please disconnect and reconnect your bank account.',
      },
      { status: 400 }
    );
  }

  // ── Call Yapily reconfirmConsent ──
  try {
    await reconfirmConsent(connection.consent_token);

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
