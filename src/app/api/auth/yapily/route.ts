import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  createAccountAuthorisation,
  createHostedConsentRequest,
  getInstitutionFeatures,
  isHostedPagesEnabled,
} from '@/lib/yapily';
import { UPCOMING_FEATURE_SCOPES } from '@/lib/yapily/upcoming';
import { TIER_CONFIG, type BankTier } from '@/lib/bank-tier-config';
import { getEffectiveTier } from '@/lib/plan-limits';

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
  // Use getEffectiveTier, not the raw profile column: it applies the
  // onboarding-trial override, so a trial-Pro user isn't capped at the
  // Free limit while their trial is still running.
  const tier = (await getEffectiveTier(user.id)) as BankTier;
  const tierConfig = TIER_CONFIG[tier] ?? TIER_CONFIG.free;

  const { data: existingConnections } = await supabase
    .from('bank_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('deleted_at', null);

  const connectionCount = existingConnections?.length || 0;

  if (connectionCount >= tierConfig.maxConnections) {
    // Message comes from TIER_CONFIG so it can never drift from the real
    // caps again. The hardcoded copy here used to say "Free plan allows 1
    // bank connection. Upgrade to Essential for 2" — the actual limits
    // are Free 2, Essential 3, Pro unlimited.
    const upgradeMessage = tierConfig.upgradeMessage
      ? `You've connected ${connectionCount} of ${tierConfig.maxConnections} banks on the ${tier} plan. ${tierConfig.upgradeMessage}`
      : 'Connection limit reached.';

    return NextResponse.json(
      {
        error: upgradeMessage,
        upgradeRequired: true,
        upgradeUrl: '/pricing',
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
  // Encode user ID + institution ID + returnTo as state for CSRF protection
  // + post-callback redirect.
  const returnTo = searchParams.get('returnTo') || '/dashboard/money-hub';
  const state = Buffer.from(
    JSON.stringify({ userId: user.id, institutionId, returnTo })
  ).toString('base64');
  const redirectWithState = `${callbackUrl}?state=${encodeURIComponent(state)}`;

  // ── Scope intersection (Yapily build review step 10) ──
  //
  // Only request feature scopes the chosen institution actually
  // advertises. Asking a bank for ACCOUNT_DIRECT_DEBITS when it doesn't
  // support them can widen the consent screen the user sees for no
  // benefit, and guarantees downstream 4xx traffic against Yapily.
  //
  // getInstitutions() is cached for an hour, so this costs no extra API
  // call. Fail-open: an empty feature list means the lookup failed, and
  // we fall back to the full scope set rather than silently requesting a
  // narrower consent than the product needs.
  let requestedScopes: readonly string[] = UPCOMING_FEATURE_SCOPES;
  try {
    const institutionFeatures = await getInstitutionFeatures(institutionId);
    if (institutionFeatures.length > 0) {
      const intersected = UPCOMING_FEATURE_SCOPES.filter((s) =>
        institutionFeatures.includes(s),
      );
      if (intersected.length > 0) {
        requestedScopes = intersected;
        const dropped = UPCOMING_FEATURE_SCOPES.filter((s) => !intersected.includes(s));
        if (dropped.length > 0) {
          console.log(
            `[yapily.auth] institution=${institutionId} does not advertise ${dropped.join(', ')} — requesting ${intersected.length}/${UPCOMING_FEATURE_SCOPES.length} scopes`,
          );
        }
      }
    }
  } catch (err) {
    console.warn(
      `[yapily.auth] feature lookup failed for institution=${institutionId}, requesting full scope set:`,
      err instanceof Error ? err.message : err,
    );
  }

  try {
    if (isHostedPagesEnabled()) {
      // Hosted Pages flow (Migle's onboarding plan, 29 Apr 2026).
      // Yapily renders the bank-picker / consent / decoupled-auth
      // screens on its own domain; we get back a hostedUrl + a
      // consentRequestId we'll use in the callback to retrieve the
      // consentId + consentToken via GET /hosted/consent-requests/{id}.
      //
      // We DO set institutionId because our UI already picks the bank,
      // so Yapily skips its own picker (per HostedAccountRequest spec
      // — institutionIdentifiers + institutionId pre-selects).
      //
      // featureScope (resolved 29 Apr from the OpenAPI spec): passed
      // via the `accountRequest.featureScope` body field. Mirrors the
      // upcoming-payments scopes we already request on the legacy
      // /account-auth-requests path.
      const hosted = await createHostedConsentRequest({
        applicationUserId: user.id,
        redirectUrl: redirectWithState,
        institutionCountryCode: 'GB',
        institutionId,
        language: 'EN',
        location: 'GB',
        featureScope: requestedScopes,
      });

      // Track this in-flight request so the abandonment poller can
      // chase it if the user never returns. Best-effort: a failure to
      // record the pending row should not block the user from being
      // redirected to Yapily.
      try {
        const admin = createAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        await admin.from('yapily_pending_consent_requests').insert({
          user_id: user.id,
          consent_request_id: hosted.consentRequestId,
          institution_id: institutionId,
          redirect_url: redirectWithState,
          status: 'pending',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.error(`[yapily.auth] pending row insert failed (non-fatal): ${msg}`);
      }

      console.log(
        `Yapily auth (hosted): created hosted consent for user=${user.id} institution=${institutionId} consentRequestId=${hosted.consentRequestId}`
      );
      return NextResponse.json({
        // Frontend-facing URL — kept under both names so existing
        // consumers reading authorisationUrl don't break during the
        // cutover, and any new code can prefer hostedUrl.
        authorisationUrl: hosted.hostedUrl,
        hostedUrl: hosted.hostedUrl,
        consentRequestId: hosted.consentRequestId,
        // No consentId at this stage; we'll fetch it in the callback
        // alongside the consentToken.
      });
    }

    // Legacy flow — kept reachable behind the flag so we can roll back
    // by flipping one env var.
    const authData = await createAccountAuthorisation(
      institutionId,
      redirectWithState,
      user.id,
      requestedScopes,
    );
    console.log(
      `Yapily auth (legacy): created authorisation for user=${user.id} institution=${institutionId}`
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
