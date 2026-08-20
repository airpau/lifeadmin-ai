import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  discoverImapSettings,
  testImapConnection,
  encryptPassword,
  getProviderName,
} from '@/lib/imap-scanner';
import { PLAN_LIMITS, getEffectiveTier } from '@/lib/plan-limits';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { email, password, host, port } = body as {
      email?: string;
      password?: string;
      host?: string;
      port?: number;
    };

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Enforce tier email-connection cap (Free=1, Essential=3, Pro=∞),
    // mirroring /api/auth/google. Counts active email_connections across
    // Gmail + Outlook + IMAP. Re-authenticating an ALREADY connected
    // address (the upsert path below) is allowed — it does not add a
    // connection — so the existing row for this address is excluded.
    const tier = await getEffectiveTier(user.id);
    const maxEmails = PLAN_LIMITS[tier].maxEmails;
    if (maxEmails !== null) {
      const { data: existing } = await supabase
        .from('email_connections')
        .select('id, email_address')
        .eq('user_id', user.id)
        .eq('status', 'active');
      const count = (existing || []).filter(
        (c) => (c.email_address || '').toLowerCase() !== email.toLowerCase(),
      ).length;
      if (count >= maxEmails) {
        const errorCopy =
          tier === 'free'
            ? `Free plan allows ${maxEmails} email connection. Upgrade to Essential for 3, or Pro for unlimited.`
            : `Essential plan allows ${maxEmails} email connections. Upgrade to Pro for unlimited.`;
        return NextResponse.json(
          { error: errorCopy, upgradeRequired: true, tier, maxEmails },
          { status: 403 },
        );
      }
    }

    // Determine IMAP settings: explicit or auto-discovered
    let imapHost = host;
    let imapPort = port || 993;

    if (!imapHost) {
      const discovered = discoverImapSettings(email);
      if (!discovered) {
        return NextResponse.json(
          { error: 'Could not auto-detect IMAP settings for this email domain. Please provide host and port.' },
          { status: 400 },
        );
      }
      imapHost = discovered.host;
      imapPort = discovered.port;
    }

    // Test the connection
    const test = await testImapConnection(imapHost, imapPort, email, password);
    if (!test.success) {
      return NextResponse.json({ error: test.error || 'Connection failed' }, { status: 400 });
    }

    // Encrypt password
    const encryptedPassword = encryptPassword(password);
    const providerName = getProviderName(email);

    // Upsert into email_connections (columns must match DB schema)
    const { data, error } = await supabase
      .from('email_connections')
      .upsert(
        {
          user_id: user.id,
          email_address: email,
          provider_type: providerName,
          auth_method: 'imap',
          imap_host: imapHost,
          imap_port: imapPort,
          imap_password_encrypted: encryptedPassword,
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,email_address' },
      )
      .select('id, email_address, provider_type, status, created_at, last_scanned_at')
      .single();

    if (error) {
      console.error('[email/connect] DB error:', error);
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 });
    }

    return NextResponse.json({ connection: data });
  } catch (err: any) {
    console.error('[email/connect] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
