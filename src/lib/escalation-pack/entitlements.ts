/**
 * Ombudsman escalation pack — entitlement checks and grants.
 *
 * Two ways to hold the entitlement:
 *
 *   a) `PLAN_LIMITS[tier].ombudsmanPacksIncluded` — currently FALSE on
 *      every tier. The branch is kept so a future bundled plan is a
 *      one-line change, but nothing reaches it today.
 *   b) A row in `dispute_entitlements` with `status='active'` — bought as
 *      a £14.99 one-off. This is the ONLY live path. It works on every
 *      tier including Free, which is the whole point: pay-per-need
 *      without subscribing.
 *
 * Rule that must not be broken: buying a pack NEVER touches
 * `profiles.subscription_tier`. The webhook branches on
 * `metadata.product === 'escalation_pack'` before it reaches any tier
 * write. See src/app/api/webhooks/stripe/route.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { PLAN_LIMITS } from '@/lib/plan-limits';
import type { PlanTier } from '@/lib/tier-rank';

export type EntitlementSource = 'stripe_one_off' | 'included_in_tier' | 'founder_grant';

export interface EntitlementRow {
  id: string;
  user_id: string;
  dispute_id: string | null;
  status: 'active' | 'redeemed' | 'refunded' | 'expired';
  source: EntitlementSource;
  granted_at: string;
  redeemed_at: string | null;
}

export interface AccessResult {
  allowed: boolean;
  /** 'tier' when included with the plan, 'entitlement' when purchased. */
  via: 'tier' | 'entitlement' | null;
  /** The consumable entitlement row, when access came from a purchase. */
  entitlement: EntitlementRow | null;
  reason: string;
}

/**
 * Can this user generate an escalation pack for this dispute right now?
 *
 * Accepts an entitlement that is either bound to this dispute or unbound
 * (`dispute_id IS NULL`) — an unbound row is a credit the user paid for
 * but whose dispute id did not survive Stripe metadata. Redeeming binds it.
 */
export async function checkEscalationPackAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  disputeId: string,
  tier: PlanTier,
): Promise<AccessResult> {
  if (PLAN_LIMITS[tier]?.ombudsmanPacksIncluded) {
    return {
      allowed: true,
      via: 'tier',
      entitlement: null,
      reason: 'Included with your plan',
    };
  }

  const { data } = await supabase
    .from('dispute_entitlements')
    .select('id, user_id, dispute_id, status, source, granted_at, redeemed_at')
    .eq('user_id', userId)
    .eq('entitlement_kind', 'ombudsman_escalation_pack')
    .eq('status', 'active')
    .or(`dispute_id.eq.${disputeId},dispute_id.is.null`)
    // Prefer an entitlement already bound to THIS dispute over an unbound
    // credit, so a user holding both does not burn the flexible one first.
    .order('dispute_id', { ascending: true, nullsFirst: false })
    .order('granted_at', { ascending: true })
    .limit(1);

  const row = (data ?? [])[0] as EntitlementRow | undefined;
  if (row) {
    return {
      allowed: true,
      via: 'entitlement',
      entitlement: row,
      reason: row.dispute_id ? 'Escalation pack purchased for this dispute' : 'Unassigned escalation pack credit',
    };
  }

  return {
    allowed: false,
    via: null,
    entitlement: null,
    reason: 'No escalation pack entitlement for this dispute',
  };
}

/**
 * Grant a purchased entitlement. Idempotent on the Stripe checkout
 * session id — Stripe replays `checkout.session.completed`, and the
 * partial unique index `dispute_entitlements_stripe_session_uniq` turns a
 * replay into a no-op rather than a second £14.99 credit for one payment.
 *
 * Returns the entitlement id, or null on failure (never throws — the
 * webhook must always return 200).
 */
export async function grantEscalationPackEntitlement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  args: {
    userId: string;
    disputeId: string | null;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId?: string | null;
    amountGbp?: number | null;
    source?: EntitlementSource;
  },
): Promise<string | null> {
  try {
    // Idempotency check first so a replay does not even attempt a write.
    const { data: existing } = await supabase
      .from('dispute_entitlements')
      .select('id')
      .eq('stripe_checkout_session_id', args.stripeCheckoutSessionId)
      .maybeSingle();

    if (existing?.id) {
      console.log('[escalation-pack] entitlement already granted for session', args.stripeCheckoutSessionId);
      return existing.id as string;
    }

    const { data, error } = await supabase
      .from('dispute_entitlements')
      .insert({
        user_id: args.userId,
        dispute_id: args.disputeId,
        entitlement_kind: 'ombudsman_escalation_pack',
        source: args.source ?? 'stripe_one_off',
        status: 'active',
        stripe_checkout_session_id: args.stripeCheckoutSessionId,
        stripe_payment_intent_id: args.stripePaymentIntentId ?? null,
        amount_gbp: args.amountGbp ?? null,
      })
      .select('id')
      .single();

    if (error) {
      // A concurrent replay can lose the race to the unique index. That is
      // the index doing its job — re-read and return the winner.
      if (error.code === '23505') {
        const { data: raced } = await supabase
          .from('dispute_entitlements')
          .select('id')
          .eq('stripe_checkout_session_id', args.stripeCheckoutSessionId)
          .maybeSingle();
        return (raced?.id as string) ?? null;
      }
      console.error('[escalation-pack] entitlement insert failed:', error.message);
      return null;
    }

    return (data?.id as string) ?? null;
  } catch (e) {
    console.error('[escalation-pack] entitlement grant threw:', e);
    return null;
  }
}

/**
 * Consume an entitlement once its pack has been generated: bind it to the
 * dispute (if it was an unbound credit) and flip it to 'redeemed'.
 */
export async function redeemEntitlement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  entitlementId: string,
  disputeId: string,
): Promise<void> {
  await supabase
    .from('dispute_entitlements')
    .update({
      status: 'redeemed',
      dispute_id: disputeId,
      redeemed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', entitlementId)
    .eq('status', 'active');
}

/** Refund handling — void an entitlement when Stripe refunds the charge. */
export async function voidEntitlementForSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  match: { checkoutSessionId?: string | null; paymentIntentId?: string | null },
): Promise<void> {
  const patch = { status: 'refunded' as const, updated_at: new Date().toISOString() };
  if (match.checkoutSessionId) {
    await supabase.from('dispute_entitlements').update(patch)
      .eq('stripe_checkout_session_id', match.checkoutSessionId).eq('status', 'active');
    return;
  }
  if (match.paymentIntentId) {
    await supabase.from('dispute_entitlements').update(patch)
      .eq('stripe_payment_intent_id', match.paymentIntentId).eq('status', 'active');
  }
}
