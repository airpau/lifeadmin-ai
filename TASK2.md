# TASK: Stripe Hardening + Tier Guardrails

## Context
A profile was found with subscription_tier='essential' and subscription_status='active' but NO stripe_customer_id and NO stripe_subscription_id. This means someone got paid features for free. We need to close this gap completely.

The database constraint allows: subscription_status = trialing | active | canceled | past_due | paused
The database constraint allows: subscription_tier = free | essential | pro

## Fix 1: Plan-limits must verify Stripe, not just DB tier

In src/lib/plan-limits.ts, the checkUsageLimit function fetches subscription_tier from profiles and trusts it. This is the vulnerability — if tier is set manually (or by a bug), users bypass payment.

**Add a Stripe verification layer:**

Update checkUsageLimit to also check:
- If tier is 'essential' or 'pro', verify that stripe_subscription_id is NOT null AND subscription_status = 'active' OR 'trialing'
- If stripe_subscription_id is null but tier is paid → treat as 'free' (downgrade silently in the check, do NOT update DB here — just return free limits)
- Log a warning to console when this mismatch is detected

```typescript
// After fetching profile, add:
const isPaid = tier !== 'free';
const hasActiveStripe = profile?.stripe_subscription_id && 
  ['active', 'trialing'].includes(profile?.subscription_status ?? '');

const effectiveTier: PlanTier = (isPaid && !hasActiveStripe) ? 'free' : tier;
// Use effectiveTier for all limit checks below
if (isPaid && !hasActiveStripe) {
  console.warn(`[plan-limits] User ${userId} has tier=${tier} but no active Stripe subscription. Treating as free.`);
}
```

## Fix 2: Stripe webhook — harden subscription lifecycle handling

In src/app/api/stripe/webhook/route.ts, ensure ALL subscription lifecycle events properly update the profile:

Check these events are handled (add if missing):
- `customer.subscription.deleted` → set subscription_tier='free', subscription_status='canceled', stripe_subscription_id=NULL
- `customer.subscription.paused` → set subscription_status='paused' (keep tier but block access via plan-limits check)
- `invoice.payment_failed` → set subscription_status='past_due'
- `invoice.payment_succeeded` → set subscription_status='active' (re-activates after past_due)

## Fix 3: Stripe Customer Portal — configure properly in code

In src/app/api/stripe/portal/route.ts, add the `configuration` parameter to the billing portal session to control what users can do:

```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: profile.stripe_customer_id,
  return_url: returnUrl,
  // Don't pass configuration — use the default configured in Stripe dashboard
});
```

Actually leave this as-is — configuration is done in the Stripe dashboard. But add a comment explaining this.

## Fix 4: Stripe Checkout — add trial period option

In src/app/api/stripe/checkout/route.ts, add support for a 7-day free trial:

```typescript
// In the checkout session creation, add:
subscription_data: {
  trial_period_days: 7,
  metadata: {
    user_id: user.id,
  },
},
```

And update the profiles.subscription_status to 'trialing' when a trial starts (handle in webhook: `customer.subscription.created` with status='trialing').

## Fix 5: Dashboard — show accurate plan status

In src/app/dashboard/profile/page.tsx, the plan status display should:
- Show "Free Plan" if tier=free OR if no active Stripe subscription
- Show "Essential — Active" only if stripe_subscription_id exists AND status=active
- Show "Essential — Trial (X days left)" if status=trialing
- Show "Essential — Payment overdue" if status=past_due (show in red)
- Show "Essential — Cancelled" if status=canceled (show in grey, explain access ends on [date])

Fetch the profile data from Supabase to get subscription_status alongside subscription_tier.

## Fix 6: API route — validate Stripe subscription status server-side

Create src/lib/get-user-plan.ts:
```typescript
// Single source of truth for a user's effective plan
export async function getUserPlan(userId: string): Promise<{
  tier: 'free' | 'essential' | 'pro';
  status: string;
  isActive: boolean; // true only if paid AND active/trialing
}> {
  // Fetch from profiles
  // Apply the same Stripe verification logic as plan-limits
  // Return effective tier
}
```

Import and use this in any route that needs to check plan access.

## NOTES
- TypeScript throughout
- Run `npm run build` when done
- Apply no DB changes — schema is fine as-is
- Commit with message: "fix: Stripe hardening — verify subscription server-side, handle all lifecycle events"

When completely finished, run: openclaw system event --text "Done: Stripe hardening and tier guardrails complete" --mode now
