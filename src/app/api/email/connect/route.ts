import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  discoverImapSettings,
  testImapConnection,
  encryptPassword,
  getProviderName,
} from '@/lib/imap-scanner';

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
