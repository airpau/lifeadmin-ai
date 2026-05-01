import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createHostedConsentRequest, YapilyError } from '@/lib/yapily';
import { UPCOMING_FEATURE_SCOPES } from '@/lib/yapily/upcoming';
import { TIER_CONFIG, type BankTier } from '@/lib/bank-tier-config';

/**
 * GET /api/auth/yapily?institutionId=xxx&returnTo=/dashboard/money-hub
 *
 * Starts the Yapily Hosted-Pages consent flow (Migle's expected build-review
 * path — see docs/YAPILY_BUILD_REVIEW_PLAN.md, T1).
 *
 * Steps:
 * 1. Authenticate the user
 * 2. Enforce tier-based connection limits
 * 3. POST /hosted/consent-requests
 * 4. Persist the hostedConsentId on a new bank_connections row in
 *    consent_status='pending' so the fallback poll cron (T4) can take over
 *    if the redirect callback doesn't arrive within 3 minutes
 * 5. Return the hosted-page redirect URL for the frontend to navigate to
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
    .eq('status', 'active')
    .is('deleted_at', null);

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

  // ── Create hosted consent request ──
  try {
    // Encode user ID + institution ID + returnTo as state for CSRF protection
    // + post-callback redirect target.
    const returnTo = searchParams.get('returnTo') || '/dashboard/money-hub';
    const state = Buffer.from(
      JSON.stringify({ userId: user.id, institutionId, returnTo })
    ).toString('base64');

    const hosted = await createHostedConsentRequest(
      institutionId,
      `${callbackUrl}?state=${encodeURIComponent(state)}`,
      user.id,
      UPCOMING_FEATURE_SCOPES,
    );

    // Persist a "pending" connection row so the fallback poll cron (T4)
    // can pick it up if the user closes their tab mid-flow.
    const { error: insertErr } = await supabase
      .from('bank_connections')
      .insert({
        user_id: user.id,
        institution_id: institutionId,
        provider: 'yapily',
        status: 'pending',
        consent_status: 'pending',
        hosted_consent_id: hosted.hostedConsentId,
        pending_started_at: new Date().toISOString(),
      });

    if (insertErr) {
      // Don't fail the redirect — the user can still complete the flow,
      // and on callback we'll upsert by hosted_consent_id. Just log loudly.
      console.error('[yapily.auth] failed to seed pending connection row:', insertErr);
    }

    console.log(
      `Yapily auth: hosted consent created user=${user.id} institution=${institutionId} hostedConsentId=${hosted.hostedConsentId}`
    );

    return NextResponse.json({
      // Field name kept as `authorisationUrl` for frontend back-compat —
      // the hosted page is conceptually the same destination.
      authorisationUrl: hosted.redirectUrl,
      hostedConsentId: hosted.hostedConsentId,
    });
  } catch (err) {
    const status = err instanceof YapilyError ? err.status : 500;
    console.error('Yapily hosted consent failed:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to create bank authorisation',
      },
      { status: status >= 500 ? 500 : 502 }
    );
  }
}
