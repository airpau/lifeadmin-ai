import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// GET — check current Telegram link status for the logged-in user
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  const [sessionResult, pendingCodeResult] = await Promise.all([
    admin
      .from('telegram_sessions')
      .select('telegram_username, linked_at, last_message_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    admin
      .from('telegram_link_codes')
      .select('code, expires_at, created_at')
      .eq('user_id', user.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  return NextResponse.json({
    linked: !!sessionResult.data,
    session: sessionResult.data ?? null,
    pendingCode: pendingCodeResult.data ?? null,
  });
}

// POST — generate a new link code
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // Check user is on Pro plan
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at')
    .eq('id', user.id)
    .single();

  const tier = profile?.subscription_tier;
  const status = profile?.subscription_status;
  const hasStripe = !!profile?.stripe_subscription_id;
  const isPro =
    tier === 'pro' &&
    (hasStripe ? ['active', 'trialing'].includes(status ?? '') : status === 'trialing');

  if (!isPro) {
    return NextResponse.json(
      { error: 'Pro subscription required to use the Telegram bot' },
      { status: 403 },
    );
  }

  // Invalidate any unused, unexpired codes for this user
  await admin
    .from('telegram_link_codes')
    .update({ used: true })
    .eq('user_id', user.id)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString());

  // Generate a unique code
  let code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await admin
      .from('telegram_link_codes')
      .select('id')
      .eq('code', code)
      .single();
    if (!existing) break;
    code = generateCode();
    attempts++;
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const { data, error } = await admin
    .from('telegram_link_codes')
    .insert({
      user_id: user.id,
      code,
      expires_at: expiresAt.toISOString(),
    })
    .select('code, expires_at')
    .single();

  if (error) {
    console.error('[link-code] Error creating code:', error);
    return NextResponse.json({ error: 'Failed to generate code' }, { status: 500 });
  }

  return NextResponse.json({ code: data.code, expires_at: data.expires_at });
}

// DELETE — unlink Telegram account
export async function DELETE() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  await admin
    .from('telegram_sessions')
    .update({ is_active: false })
    .eq('user_id', user.id);

  return NextResponse.json({ ok: true });
}
