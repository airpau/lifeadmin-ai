import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  createAccountAuthorisation,
  createHostedConsentRequest,
  isHostedPagesEnabled,
} from '@/lib/yapily';
import { TIER_CONFIG, type BankTier } from '@/lib/bank-tier-config';
import { getEffectiveTier } from '@/lib/plan-limits';
import { isPlanTier } from '@/lib/tier-rank';

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

  // ── institutionId is now OPTIONAL ──
  //
  // Changed 2026-08-21. On Hosted Pages, omitting institutionId makes
  // Yapily render its own bank picker — which is the journey we cut
  // over to, so the normal case is now NO institutionId at all.
  // Migle's note: "you don't need to create your own bank list … The
  // Hosted pages can display a bank list for you if you remove the
  // institutionId from the payload."
  //
  // We still accept one, for two reasons worth keeping:
  //   • the legacy /account-auth-requests path genuinely requires it,
  //     so the kill switch has to keep working;
  //   • deep links (a "reconnect your Barclays" email, support
  //     tooling) can pre-select the bank and skip a step.
  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get('institutionId') || undefined;
  const hostedPages = isHostedPagesEnabled();

  if (!institutionId && !hostedPages) {
    // Only reachable via the kill switch. Yapily has no bank-picker of
    // its own on the legacy path, so without an institution there is
    // nothing to authorise against.
    return NextResponse.json(
      { error: 'institutionId query parameter is required on the legacy consent flow' },
      { status: 400 }
    );
  }

  // ── Check tier-based connection limits ──
  // Use getEffectiveTier, not the raw profile column: it applies the
  // onboarding-trial override, so a trial-Pro user isn't capped at the
  // Free limit while their trial is still running.
  //
  // The `?? TIER_CONFIG.free` fallback is kept as a safety net but must not
  // be silent: it applies the Free 2-bank cap, so a paid subscriber on a
  // tier missing from TIER_CONFIG would be blocked at 2 banks with no trace
  // of why. Log it so the missing entry is findable.
  const tier = (await getEffectiveTier(user.id)) as BankTier;
  if (!isPlanTier(tier)) {
    console.error(
      `[auth/yapily] unknown tier "${tier}" for user ${user.id} has no TIER_CONFIG entry — applying the Free bank cap. Add it to TIER_CONFIG in src/lib/bank-tier-config.ts.`,
    );
  }
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

  // ── No featureScope: request an unrestricted consent ──
  //
  // Removed 2026-08-21 on Migle Ivanauskaite's (Yapily) explicit
  // instruction during the pre-launch review.
  //
  // What used to happen: we sent an explicit featureScope array,
  // intersected against the institution's advertised feature list.
  // That looked tidy but was actively harmful. Naming a scope makes it
  // a HARD REQUIREMENT of the consent — if the bank doesn't implement
  // exactly that feature, or reports its capabilities differently to
  // how it behaves, the authorisation itself fails rather than simply
  // omitting the feature. We were narrowing a consent we had no
  // reliable basis to narrow, and eating bank-specific errors for it.
  //
  // Omitting featureScope entirely makes Yapily grant every feature the
  // institution actually supports. That is a superset of what the
  // intersection produced, so nothing downstream loses access; the
  // upcoming-payments endpoints simply become available on more banks.
  //
  // Do NOT reintroduce a featureScope array here to "be explicit". The
  // capability check belongs at CALL time (see sync-upcoming, which
  // gates on the consent's granted featureScope), not at CONSENT time.
  try {
    if (hostedPages) {
      // Hosted Pages flow — canonical since 2026-08-21.
      //
      // Yapily renders the bank picker, the consent screen and any
      // decoupled-auth / QR flows on its own domain; we get back a
      // hostedUrl + a consentRequestId we use in the callback to
      // retrieve the consentId + consentToken via
      // GET /hosted/consent-requests/{id}.
      //
      // institutionId is now normally UNDEFINED, and that is the point.
      // Passing it pre-selects a bank and skips Yapily's picker; omitting
      // it makes Yapily show its own list, filtered to
      // institutionCountryCode. That is the behaviour we want — it
      // retires our hand-rolled institution list, and with it a class of
      // bug where our cached list disagreed with what Yapily would
      // actually accept.
      //
      // No featureScope — see the note above.
      const hosted = await createHostedConsentRequest({
        applicationUserId: user.id,
        redirectUrl: redirectWithState,
        institutionCountryCode: 'GB',
        // Only ever set on a deep link that named a bank.
        institutionId,
        language: 'EN',
        location: 'GB',
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
          // institution_id is NOT NULL on this table, and with Yapily's
          // picker we genuinely don't know the bank yet — the user
          // hasn't chosen. A sentinel keeps the abandonment poller
          // working and reads honestly in the admin view; the callback
          // backfills the real institution once we learn it.
          institution_id: institutionId ?? 'hosted-picker-pending',
          redirect_url: redirectWithState,
          status: 'pending',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.error(`[yapily.auth] pending row insert failed (non-fatal): ${msg}`);
      }

      console.log(
        `Yapily auth (hosted): created hosted consent for user=${user.id} institution=${institutionId ?? 'yapily-picker'} consentRequestId=${hosted.consentRequestId}`
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

    // Legacy flow — reachable only via the YAPILY_HOSTED_PAGES_ENABLED
    // kill switch. institutionId is guaranteed present here by the
    // guard at the top of this handler.
    // No featureScope argument — see the note above.
    const authData = await createAccountAuthorisation(
      institutionId!,
      redirectWithState,
      user.id,
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
