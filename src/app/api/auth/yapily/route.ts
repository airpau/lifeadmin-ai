import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAccountAuthorisation } from '@/lib/yapily';
import { TIER_CONFIG, type BankTier } from '@/lib/bank-tier-config';

/**
 * GET /api/auth/yapily?institutionId=xxx
 *
 * Starts the Yapily Open Banking consent flow.
 * 1. Checks user authentication
 * 2. Enforces tier-based connection limits
 * 3. Creates an account authorisation request with Yapily
 * 4. Returns the bank's authorisation URL for the frontend to redirect to
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Validate institutionId query param ──
  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get('institutionId');

  if (!institutionId) {
    return NextResponse.json(
      { error: 'institutionId query parameter is required' },
      { status: 400 }
    );
  }

  // ── Check tier-based connection limits ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  const tier = (profile?.subscription_tier || 'free') as BankTier;
  const tierConfig = TIER_CONFIG[tier];

  const { data: existingConnections } = await supabase
    .from('bank_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active');

  const connectionCount = existingConnections?.length || 0;

  if (connectionCount >= tierConfig.maxConnections) {
    const upgradeMessage =
      tier === 'free'
        ? 'Free plan allows 1 bank connection. Upgrade to Essential for 2, or Pro for unlimited.'
        : tier === 'essential'
          ? 'Essential plan allows 2 bank connections. Upgrade to Pro for unlimited banks.'
          : 'Connection limit reached.';

    return NextResponse.json(
      {
        error: upgradeMessage,
        upgradeRequired: true,
        tier,
        maxConnections: tierConfig.maxConnections,
      },
      { status: 403 }
    );
  }

  // ── Check env vars ──
  if (
    !process.env.YAPILY_APPLICATION_UUID ||
    !process.env.YAPILY_APPLICATION_SECRET
  ) {
    return NextResponse.json(
      { error: 'Yapily not configured' },
      { status: 500 }
    );
  }

  const callbackUrl =
    process.env.NEXT_PUBLIC_YAPILY_REDIRECT_URI ||
    'https://paybacker.co.uk/api/yapily/callback';

  // ── Create authorisation request ──
  try {
    // Encode user ID + institution ID + returnTo as state for CSRF protection + post-callback redirect
    const returnTo = searchParams.get('returnTo') || '/dashboard/money-hub';
    const state = Buffer.from(
      JSON.stringify({ userId: user.id, institutionId, returnTo })
    ).toString('base64');

    const authData = await createAccountAuthorisation(
      institutionId,
      `${callbackUrl}?state=${encodeURIComponent(state)}`,
      user.id
    );

    console.log(
      `Yapily auth: created authorisation for user=${user.id} institution=${institutionId}`
    );

    return NextResponse.json({
      authorisationUrl: authData.authorisationUrl,
      consentId: authData.id,
    });
  } catch (err) {
    console.error('Yapily authorisation failed:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to create bank authorisation',
      },
      { status: 500 }
    );
  }
}
