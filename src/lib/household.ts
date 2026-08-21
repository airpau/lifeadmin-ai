/**
 * Household plan — entitlement sharing WITHOUT data sharing.
 *
 * ===========================================================================
 * READ THIS BEFORE TOUCHING ANYTHING IN HERE
 * ===========================================================================
 *
 * The design constraint that shaped every line of this file: a household
 * member must NEVER be able to see another member's financial data. Not
 * their transactions, not their disputes, not their budgets, not their
 * balances. A household is four completely separate Paybacker accounts
 * that happen to share one Stripe subscription.
 *
 * Why that is safe here
 * ---------------------
 * The consumer schema is single-tenant-per-user throughout. Every
 * user-data table (`bank_connections`, `bank_transactions`,
 * `email_connections`, `disputes`, `correspondence`, `tasks`,
 * `money_hub_*`, `account_spaces`, `usage_logs`, …) carries
 * `user_id uuid REFERENCES auth.users(id)` with an `auth.uid() = user_id`
 * RLS policy, and every server route additionally filters
 * `.eq('user_id', …)` on the service-role client. So four household
 * members are already, structurally, four isolated tenants. There is
 * nothing to leak because there is no shared row anywhere.
 *
 * Consequently this module shares exactly ONE thing: the answer to "what
 * tier am I on". Nothing in here can widen a data query. There is
 * deliberately no "act as household member" switch, no shared Space, no
 * household-scoped read of any kind. If a future change needs one, that is
 * a new design conversation, not an extension of this file.
 *
 * Why the Stripe ids stay on the owner's profile row
 * --------------------------------------------------
 * `profiles.stripe_customer_id` and `profiles.stripe_subscription_id` are
 * both `UNIQUE` (supabase/migrations/20260101000000_initial_schema.sql).
 * Copying the owner's ids onto the other three profile rows would throw a
 * unique violation on rows 2-4. Worse, `/api/webhooks/stripe` updates
 * profiles `.eq('stripe_customer_id', customerId)` assuming exactly one
 * row per customer — four matching rows would make
 * `customer.subscription.deleted` wipe four tiers in one statement with no
 * record of which was the owner.
 *
 * So: subscription state lives on `household_plans`, seats live on
 * `household_members`, and member profiles keep `subscription_tier='free'`
 * with their entitlement resolved at read time by `resolveHouseholdTier`.
 * Cancel the plan and every member reverts to Free automatically on their
 * next tier read — no fan-out write, no orphaned entitlement.
 *
 * WHERE THE UI LIVES
 * ------------------
 * Owner-side seat management: `/dashboard/settings/household`.
 * Invitee-side acceptance:    `/household/join?token=…`.
 * API for both:               `/api/household`.
 *
 * Until 2026-08-21 there was no owner-side UI, so the plan was hidden
 * behind `NEXT_PUBLIC_HOUSEHOLD_PLAN_ENABLED` — selling seats a customer
 * cannot fill is worse than not selling them. The UI now exists and the
 * flag is gone. If the management page is ever removed, hide the plan
 * again rather than leaving owners with seats they cannot fill.
 *
 * PRICE: £19.99/mo, £199.99/yr as of 2026-08-21 (was £14.99/£149.99).
 * See src/lib/stripe.ts for why the Stripe price IDs are read from the
 * `STRIPE_DISPUTE_PRO_*` env vars.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, createHash } from 'crypto';
import type { PlanTier } from '@/lib/tier-rank';

/** Seats a Household plan grants, including the owner. */
export const HOUSEHOLD_SEATS = 4;

/** How long a seat invite stays valid. */
export const HOUSEHOLD_INVITE_TTL_HOURS = 14 * 24;

export interface HouseholdPlanRow {
  id: string;
  owner_user_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: 'active' | 'past_due' | 'canceled';
  seats: number;
}

export interface HouseholdMemberRow {
  id: string;
  household_id: string;
  user_id: string | null;
  invited_email: string;
  role: 'owner' | 'member';
  status: 'invited' | 'active' | 'removed';
  invited_at: string | null;
  accepted_at: string | null;
}

/**
 * Resolve a Free-tier user's entitlement from an accepted household seat.
 *
 * Returns 'household' when the user holds an active seat on an active
 * plan, otherwise 'free'. Never returns anything else — a household seat
 * grants Pro-equivalent entitlement and nothing more.
 *
 * Callers (getEffectiveTier, getUserPlan) only reach this when the stored
 * tier is already 'free', so a paying user never pays the extra query.
 * Any error resolves to 'free': failing closed on an entitlement lookup is
 * the correct direction.
 */
export async function resolveHouseholdTier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<PlanTier> {
  try {
    const { data } = await supabase
      .from('household_members')
      .select('id, household_id, status, household_plans!inner(status)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);

    const row = (data ?? [])[0] as { household_plans?: { status?: string } | { status?: string }[] } | undefined;
    if (!row) return 'free';

    // PostgREST returns an object for a to-one embed and an array when it
    // cannot prove cardinality. Handle both rather than assume.
    const plan = Array.isArray(row.household_plans) ? row.household_plans[0] : row.household_plans;
    const planStatus = plan?.status;

    // 'past_due' keeps the seat alive — same policy as the single-user
    // tiers, where a retrying card does not demote anyone. Only an
    // explicit 'canceled' revokes.
    if (planStatus === 'active' || planStatus === 'past_due') return 'household';
    return 'free';
  } catch {
    return 'free';
  }
}

/** The household this user OWNS, if any. */
export async function getOwnedHousehold(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ownerUserId: string,
): Promise<HouseholdPlanRow | null> {
  const { data } = await supabase
    .from('household_plans')
    .select('id, owner_user_id, stripe_subscription_id, stripe_customer_id, status, seats')
    .eq('owner_user_id', ownerUserId)
    .neq('status', 'canceled')
    .maybeSingle();
  return (data as HouseholdPlanRow | null) ?? null;
}

/** Seats currently consumed (owner + invited + active, excluding removed). */
export async function countOccupiedSeats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  householdId: string,
): Promise<number> {
  const { count } = await supabase
    .from('household_members')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .in('status', ['invited', 'active']);
  return count ?? 0;
}

/**
 * Create (or reactivate) a household plan for an owner and seat them.
 *
 * Idempotent on `owner_user_id` — Stripe replays
 * `checkout.session.completed`, so this must be safe to call twice with
 * the same session.
 */
export async function ensureHouseholdPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  args: {
    ownerUserId: string;
    ownerEmail: string;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
  },
): Promise<HouseholdPlanRow | null> {
  const { data: plan, error } = await supabase
    .from('household_plans')
    .upsert(
      {
        owner_user_id: args.ownerUserId,
        stripe_subscription_id: args.stripeSubscriptionId,
        stripe_customer_id: args.stripeCustomerId,
        status: 'active',
        seats: HOUSEHOLD_SEATS,
        canceled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_user_id' },
    )
    .select('id, owner_user_id, stripe_subscription_id, stripe_customer_id, status, seats')
    .single();

  if (error || !plan) {
    console.error('[household] ensureHouseholdPlan failed:', error?.message);
    return null;
  }

  // Seat the owner. `onConflict` on (household_id, invited_email) makes
  // the webhook replay a no-op rather than a duplicate seat.
  const { error: seatError } = await supabase
    .from('household_members')
    .upsert(
      {
        household_id: (plan as HouseholdPlanRow).id,
        user_id: args.ownerUserId,
        invited_email: args.ownerEmail.toLowerCase(),
        role: 'owner',
        status: 'active',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,invited_email' },
    );

  if (seatError) console.error('[household] owner seat upsert failed:', seatError.message);

  return plan as HouseholdPlanRow;
}

/**
 * Mark a household plan canceled. Members revert to Free on their next
 * tier read — no fan-out write, so there is no window where a member's
 * profile disagrees with their entitlement.
 */
export async function cancelHouseholdPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  match: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null },
): Promise<void> {
  const patch = {
    status: 'canceled' as const,
    canceled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (match.stripeSubscriptionId) {
    await supabase.from('household_plans').update(patch).eq('stripe_subscription_id', match.stripeSubscriptionId);
    return;
  }
  if (match.stripeCustomerId) {
    await supabase.from('household_plans').update(patch).eq('stripe_customer_id', match.stripeCustomerId);
  }
}

/** Generate an invite token. Plaintext is emailed; only the hash is stored. */
export function mintInviteToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(24).toString('hex');
  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(Date.now() + HOUSEHOLD_INVITE_TTL_HOURS * 3600 * 1000).toISOString(),
  };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
