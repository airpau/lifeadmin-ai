import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { notifyAgents } from '@/lib/agent-notify';
import { trackSubscription } from '@/lib/meta-conversions';
import { captureServer } from '@/lib/posthog-server';
import { priceIdToTier, STRIPE_PRODUCT_TAG } from '@/lib/stripe';
import { TIER_RANK, TIER_PRICE_GBP, isPlanTier, type PlanTier } from '@/lib/tier-rank';

export const runtime = 'nodejs';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { typescript: true });
}

// Tier resolution lives in the canonical `priceIdToTier` in @/lib/stripe
// (2026-08). This route used to carry its own hardcoded price→tier map
// that defaulted an unknown price ID to 'essential' — one stale env var
// would have written every Pro subscriber down to Essential. Unknown
// price IDs now return null and every call site SKIPS the tier write
// rather than guessing.
function getPlanTier(priceId: string): PlanTier | null {
  const tier = priceIdToTier(priceId);
  if (!tier) {
    console.error('[stripe webhook] unrecognised price ID — tier write skipped', { priceId });
  }
  return tier;
}

/**
 * Amount in GBP for analytics / Awin, derived from the canonical price
 * table rather than a `tier === 'pro' ? 9.99 : 4.99` ternary. That ternary
 * priced every non-Pro tier at £4.99, so a £19.99 Household sale would
 * have been reported to PostHog, Meta and Awin as an Essential sale.
 */
function amountForTier(tier: PlanTier | null, interval: 'month' | 'year'): number {
  const t: PlanTier = tier && isPlanTier(tier) ? tier : 'essential';
  return interval === 'year' ? TIER_PRICE_GBP[t].yearly : TIER_PRICE_GBP[t].monthly;
}

/**
 * Awin commission group. Unknown tiers fall back to ESSENTIAL, matching
 * the pre-existing behaviour, but the new tiers now get their own groups
 * so the founder can set distinct commission rates per product.
 */
function awinCommissionGroup(tier: PlanTier | null): string {
  switch (tier) {
    case 'household': return 'HOUSEHOLD';
    case 'pro': return 'PRO';
    default: return 'ESSENTIAL';
  }
}

async function scheduleLegacySubscriptionsForCancellation(
  stripe: Stripe,
  customerId: string,
  currentSubscriptionId: string
) {
  const [activeSubs, trialingSubs] = await Promise.all([
    stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 }),
    stripe.subscriptions.list({ customer: customerId, status: 'trialing', limit: 10 }),
  ]);

  const legacySubs = [...activeSubs.data, ...trialingSubs.data].filter(
    (sub) => sub.id !== currentSubscriptionId && !sub.cancel_at_period_end
  );

  for (const sub of legacySubs) {
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    console.log(`Webhook: scheduled legacy subscription ${sub.id} for cancellation at period end`);
  }
}

export async function POST(request: NextRequest) {
  console.log('=== WEBHOOK HIT at /api/webhooks/stripe ===');

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  console.log(`Webhook: signature present=${!!signature} body length=${body.length}`);

  if (!signature) {
    console.error('Webhook: missing stripe-signature header');
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Webhook: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log(`Webhook: signature verified OK, event=${event.type} id=${event.id}`);
  } catch (err: any) {
    console.error('Webhook: signature verification FAILED:', err.message);
    console.error('Webhook: secret prefix:', process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10));
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.product === STRIPE_PRODUCT_TAG.b2bApi) {
          try {
            const { handleB2bCheckoutExpired } = await import('@/lib/b2b/stripe-webhook');
            await handleB2bCheckoutExpired(supabase as any, session);
          } catch (e: any) {
            console.error('[stripe webhook] b2b checkout.expired failed:', e?.message);
          }
          break;
        }

        // An abandoned one-off escalation-pack checkout is not a
        // subscription lead. Feeding it into the consumer nurture funnel
        // would email a "finish setting up your subscription" sequence to
        // someone who was buying a £14.99 product, and to existing paying
        // subscribers. Skip it.
        if (session.metadata?.product === STRIPE_PRODUCT_TAG.escalationPack) {
          console.log('[stripe webhook] escalation_pack checkout expired — no nurture capture', session.id);
          break;
        }

        // B2C abandonment capture — feed the consumer nurture funnel.
        // The B2B path above intentionally returns first; we only land
        // here for consumer checkouts. Best-effort — never throw out
        // of the webhook handler.
        try {
          const { captureConsumerLead } = await import('@/lib/consumer-leads/capture');
          const email = session.customer_details?.email || session.customer_email || null;
          if (email) {
            // Pull intended tier off the line items if we can.
            let intendedTier: Exclude<PlanTier, 'free'> | null = null;
            let intendedInterval: 'monthly' | 'yearly' | null = null;
            try {
              const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1, expand: ['data.price'] });
              const priceId = lineItems.data[0]?.price?.id;
              intendedTier = priceIdToTier(priceId);
              const recurring = lineItems.data[0]?.price?.recurring?.interval;
              if (recurring === 'month') intendedInterval = 'monthly';
              if (recurring === 'year') intendedInterval = 'yearly';
            } catch (e: any) {
              console.warn('[stripe webhook] expired session line-items lookup failed:', e?.message);
            }
            const recoveryUrl = session.after_expiration?.recovery?.url ?? null;
            await captureConsumerLead({
              email,
              name: session.customer_details?.name ?? null,
              source: 'stripe_checkout_abandoned',
              stripeCheckoutSessionId: session.id,
              stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
              stripeRecoveryUrl: recoveryUrl,
              intendedTier,
              intendedBillingInterval: intendedInterval,
            });
          }
        } catch (e: any) {
          console.error('[stripe webhook] consumer abandonment capture failed:', e?.message);
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // B2B API checkouts have metadata.product='b2b_api' and skip the
        // consumer profile-update path entirely. Mint key, email plaintext.
        if (session.metadata?.product === STRIPE_PRODUCT_TAG.b2bApi) {
          try {
            const { handleB2bCheckoutCompleted } = await import('@/lib/b2b/stripe-webhook');
            await handleB2bCheckoutCompleted(supabase as any, stripe, session);
          } catch (e: any) {
            console.error('[stripe webhook] b2b checkout failed:', e?.message);
          }
          break;
        }

        // ------------------------------------------------------------------
        // ONE-OFF: Ombudsman escalation pack (£14.99).
        //
        // This branch MUST come before any code that touches
        // `subscription_tier`. A one-off purchase grants an entitlement
        // row and nothing else — a Free user who buys a pack stays Free,
        // and a Pro user who buys one stays Pro. There is deliberately no
        // profile update anywhere in this block.
        //
        // Idempotent: `grantEscalationPackEntitlement` is keyed on the
        // checkout session id via a unique index, so Stripe's replays are
        // no-ops rather than duplicate £14.99 credits.
        // ------------------------------------------------------------------
        if (session.metadata?.product === STRIPE_PRODUCT_TAG.escalationPack) {
          try {
            const { grantEscalationPackEntitlement } = await import('@/lib/escalation-pack/entitlements');
            const packUserId = session.metadata?.user_id;
            const packDisputeId = session.metadata?.dispute_id ?? null;

            if (!packUserId) {
              console.error('[stripe webhook] escalation_pack session missing user_id metadata', session.id);
              break;
            }
            if (session.payment_status !== 'paid') {
              console.warn('[stripe webhook] escalation_pack session not paid — no grant', {
                sessionId: session.id, payment_status: session.payment_status,
              });
              break;
            }

            const entitlementId = await grantEscalationPackEntitlement(supabase as any, {
              userId: packUserId,
              disputeId: packDisputeId,
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
              amountGbp: session.amount_total != null ? session.amount_total / 100 : null,
            });

            console.log('[stripe webhook] escalation pack entitlement granted', {
              entitlementId, userId: packUserId, disputeId: packDisputeId,
            });

            captureServer('escalation_pack_purchased', packUserId, {
              dispute_id: packDisputeId,
              amount_gbp: session.amount_total != null ? session.amount_total / 100 : null,
            });
          } catch (e: any) {
            console.error('[stripe webhook] escalation_pack grant failed:', e?.message);
          }
          // Explicit break — never fall through to the subscription path.
          break;
        }

        const userId = session.metadata?.user_id;
        console.log(`Webhook checkout.session.completed: userId=${userId} customer=${session.customer} subscription=${session.subscription}`);

        if (!userId) {
          console.error('Webhook: checkout.session.completed missing user_id in metadata');
          break;
        }

        // `resolvedTier` is null when the price ID is unrecognised. In
        // that case we still record the customer/subscription ids and
        // status, but we do NOT write a guessed subscription_tier — the
        // old `?? 'essential'` default could demote a Pro subscriber.
        let resolvedTier: PlanTier | null = null;
        let billingInterval: 'month' | 'year' = 'month';
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0]?.price.id || '';
          resolvedTier = getPlanTier(priceId);
          billingInterval = subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'year' : 'month';
          console.log(`Webhook: subscription priceId=${priceId} tier=${resolvedTier ?? 'UNKNOWN'} status=${subscription.status}`);
        }
        // Label used for analytics / Awin only — never written to the DB.
        const tier: PlanTier = resolvedTier ?? 'essential';

        const { error: updateError, data: updated } = await supabase
          .from('profiles')
          .update({
            ...(resolvedTier ? { subscription_tier: resolvedTier } : {}),
            subscription_status: 'active',
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            trial_converted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id, subscription_tier')
          .single();

        if (!updateError && session.customer && session.subscription) {
          await scheduleLegacySubscriptionsForCancellation(
            stripe,
            session.customer as string,
            session.subscription as string
          );
        }

        // Household: provision the plan row and seat the owner. Runs only
        // once the profile write succeeded, and is idempotent on
        // owner_user_id so Stripe replays cannot create a second plan.
        //
        // Note we deliberately do NOT copy stripe_customer_id /
        // stripe_subscription_id onto member profiles — both columns are
        // UNIQUE on `profiles`, and this webhook updates profiles by
        // `.eq('stripe_customer_id', …)` assuming one row per customer.
        // Member entitlement is derived at read time instead. See
        // src/lib/household.ts for the full reasoning.
        if (!updateError && resolvedTier === 'household') {
          try {
            const { ensureHouseholdPlan } = await import('@/lib/household');
            const { data: ownerProfile } = await supabase
              .from('profiles').select('email').eq('id', userId).single();
            const ownerEmail =
              (ownerProfile?.email as string)
              || session.customer_details?.email
              || session.customer_email
              || '';
            if (ownerEmail) {
              await ensureHouseholdPlan(supabase as any, {
                ownerUserId: userId,
                ownerEmail,
                stripeSubscriptionId: (session.subscription as string) ?? null,
                stripeCustomerId: (session.customer as string) ?? null,
              });
              console.log('[stripe webhook] household plan provisioned for', userId);
            } else {
              console.error('[stripe webhook] household checkout has no owner email — plan not provisioned', userId);
            }
          } catch (e: any) {
            console.error('[stripe webhook] household provisioning failed:', e?.message);
          }
        }

        // Mark any matching consumer_leads row as converted_paid so the
        // nurture funnel stops emailing this user. Best-effort, B2C only —
        // the `metadata.product==='b2b_api'` branch above already returned.
        try {
          const conversionEmail = (session.customer_details?.email || session.customer_email || '').toLowerCase();
          if (conversionEmail) {
            const { captureServer } = await import('@/lib/posthog-server');
            const { data: matchingLeads } = await supabase
              .from('consumer_leads')
              .select('id, funnel_stage')
              .ilike('email', conversionEmail)
              .not('funnel_stage', 'in', '("converted_paid","unsubscribed","expired")')
              .order('captured_at', { ascending: false })
              .limit(5);
            for (const lead of matchingLeads ?? []) {
              await supabase
                .from('consumer_leads')
                .update({
                  funnel_stage: 'converted_paid',
                  converted_at: new Date().toISOString(),
                  converted_user_id: userId,
                })
                .eq('id', lead.id);
              captureServer('lead_converted', `consumer_lead:${lead.id}`, {
                tier,
                from_stage: lead.funnel_stage,
              });
            }
          }
        } catch (e: any) {
          console.error('[stripe webhook] consumer-lead conversion mark failed:', e?.message);
        }

        // Awin server-to-server conversion tracking
        // Send actual sale amount (not commission) — commission group rate handles the percentage
        if (!updateError) {
          const awinAdvId = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID || '125502';
          // Was `tier === 'pro' ? '9.99' : '4.99'`, which would have
          // reported a £19.99 Household sale as £4.99 to Awin.
          const saleAmount = amountForTier(resolvedTier, billingInterval).toFixed(2);
          const commissionGroup = awinCommissionGroup(resolvedTier);
          const orderRef = encodeURIComponent(`sub-${session.subscription || session.id}`);
          const awcRaw = session.metadata?.awc;
          let awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=${awinAdvId}` +
            `&amount=${saleAmount}&ch=aw&parts=${commissionGroup}:${saleAmount}` +
            `&vc=&cr=GBP&ref=${orderRef}&customeracquisition=NEW`;
          if (awcRaw) {
            awinUrl += `&cks=${encodeURIComponent(awcRaw)}`;
          }
          try {
            const awinRes = await fetch(awinUrl);
            console.log(`[awin] Conversion S2S: tier=${tier} amount=£${saleAmount} awc=${awcRaw || 'none'} ref=${orderRef} status=${awinRes.status}`);
          } catch (err: any) {
            console.error('[awin] S2S tracking failed:', err.message);
          }
        }

        // Notify agents about subscription change
        if (!updateError) {
          notifyAgents('subscription_change', `New ${tier} subscription`, `User ${userId} subscribed to ${tier} plan. Stripe sub: ${session.subscription}`, 'stripe').catch(() => {});

          // PostHog server-side conversion. Amounts come from the single
          // TIER_PRICE_GBP table so a new tier can never be mispriced in
          // analytics (Essential £4.99/£44.99 · Pro £9.99/£94.99 ·
          // Household £19.99/£199.99).
          const amountGbp = amountForTier(resolvedTier, billingInterval);
          captureServer('subscription_created', userId, {
            plan: tier,
            amount_gbp: amountGbp,
            interval: billingInterval,
          });

          // Meta Conversions API - server-side Purchase event
          if (userId) {
            const { data: profile } = await supabase.from('profiles').select('email, fbclid').eq('id', userId).single();
            trackSubscription({
              email: profile?.email || session.customer_details?.email || '',
              userId,
              tier,
              value: amountForTier(resolvedTier, 'month'),
              fbclid: profile?.fbclid || session.metadata?.fbclid || undefined,
            }).catch(() => {});
          }
        }

        // Process referral subscription reward
        if (!updateError && userId) {
          import('@/lib/referrals').then(({ processReferralSubscription }) => {
            processReferralSubscription(userId);
          }).catch(() => {});
        }

        if (updateError) {
          console.error('Webhook: profile update FAILED:', updateError.message);
        } else {
          console.log(`Webhook: profile updated OK:`, JSON.stringify(updated));
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const userId = subscription.metadata?.user_id;
        const priceId = subscription.items.data[0]?.price.id || '';
        const tier = getPlanTier(priceId);

        console.log(`Webhook subscription.created: status=${subscription.status} customer=${customerId} userId=${userId} tier=${tier}`);

        if (subscription.status === 'trialing' || subscription.status === 'active') {
          // Unknown price ID → skip the tier write rather than default it.
          const updateData = {
            ...(tier ? { subscription_tier: tier } : {}),
            subscription_status: subscription.status,
            stripe_subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          };

          const { error } = userId
            ? await supabase.from('profiles').update(updateData).eq('id', userId)
            : await supabase.from('profiles').update(updateData).eq('stripe_customer_id', customerId);

          if (error) console.error('Webhook: subscription.created update FAILED:', error.message);
          else console.log('Webhook: subscription.created profile updated OK');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id || '';
        const tier = getPlanTier(priceId);
        const status = subscription.status;
        // 'free' on cancellation is an explicit demotion signal, not a
        // price lookup. Otherwise: null (unknown price) means skip.
        const newTier: PlanTier | null = status === 'canceled' ? 'free' : tier;

        // Keep the household plan's status in step with the subscription
        // so members lose entitlement the moment the owner's plan ends,
        // and regain it if a past_due card recovers. Runs before the
        // profile write so a failure here still leaves the owner correct.
        try {
          const { cancelHouseholdPlan, ensureHouseholdPlan } = await import('@/lib/household');
          if (status === 'canceled' || status === 'incomplete_expired' || status === 'unpaid') {
            await cancelHouseholdPlan(supabase as any, { stripeSubscriptionId: subscription.id });
          } else if (newTier === 'household') {
            // ensureHouseholdPlan (an upsert on owner_user_id), NOT a bare
            // UPDATE matched on stripe_subscription_id.
            //
            // Why this matters: an existing Pro subscriber who moves to
            // Household through /upgrade is prorated onto the new price by
            // updating their EXISTING subscription. No new Checkout Session
            // is created, so `checkout.session.completed` never fires and
            // the provisioning block above never runs — this event is the
            // only signal we get. The previous UPDATE matched zero rows for
            // that customer, so they were billed £19.99, got the tier, and
            // then hit "You do not have a Household plan" the moment they
            // tried to invite anyone. The upsert is idempotent, so it is
            // also safe on the ordinary path where the plan already exists.
            const { data: owner } = await supabase
              .from('profiles')
              .select('id, email')
              .eq('stripe_customer_id', customerId)
              .maybeSingle();

            if (owner?.id && owner?.email) {
              await ensureHouseholdPlan(supabase as any, {
                ownerUserId: owner.id as string,
                ownerEmail: owner.email as string,
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: customerId,
              });
            } else {
              console.error('[stripe webhook] household sub update: no profile for customer', customerId);
            }

            // past_due is a retry state, not a termination — the seat stays
            // live (same rule as the single-user tiers). ensureHouseholdPlan
            // always writes 'active', so correct it here.
            if (status === 'past_due') {
              await supabase
                .from('household_plans')
                .update({ status: 'past_due', updated_at: new Date().toISOString() })
                .eq('stripe_subscription_id', subscription.id);
            }
          } else if (newTier !== null) {
            // Owner moved OFF Household onto another known tier (e.g.
            // Household → Pro). Their seats have to stop entitling anyone,
            // or three people keep Pro for free indefinitely. Guarded on
            // `newTier !== null` so an unrecognised price ID — which every
            // other call site treats as "skip the write" — cannot revoke a
            // paying household's seats.
            await cancelHouseholdPlan(supabase as any, { stripeSubscriptionId: subscription.id });
          }
        } catch (e: any) {
          console.error('[stripe webhook] household status sync failed:', e?.message);
        }

        console.log(`Webhook subscription.updated: status=${status} customer=${customerId} tier=${newTier ?? 'UNKNOWN — tier write skipped'}`);

        // Read the old tier so we can decide whether this is a downgrade.
        const { data: existing } = await supabase
          .from('profiles')
          .select('id, subscription_tier')
          .eq('stripe_customer_id', customerId)
          .neq('founding_member', true)
          .maybeSingle();

        const { error } = await supabase
          .from('profiles')
          .update({
            ...(newTier ? { subscription_tier: newTier } : {}),
            subscription_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)
          .neq('founding_member', true);

        if (error) console.error('Webhook: subscription.updated FAILED:', error.message);
        else console.log('Webhook: subscription.updated OK');

        // Grace-period hook — fires when tier drops to a lower one.
        if (!error && newTier && existing?.id && existing.subscription_tier) {
          try {
            const { openDowngradeEvent } = await import('@/lib/plan-downgrade');
            await openDowngradeEvent(supabase as any, existing.id, existing.subscription_tier as any, newTier as any);
          } catch (e) {
            console.error('Webhook: openDowngradeEvent failed:', e);
          }

          // PostHog server-side funnel — distinguish an upgrade from a
          // downgrade by comparing tier rank. Uses the canonical TIER_RANK
          // from @/lib/tier-rank rather than a private map that hardcoded
          // Pro as the ceiling (an unknown tier's `?? 0` fallback would
          // have ranked them below Free).
          const oldRank = TIER_RANK[existing.subscription_tier as PlanTier] ?? 0;
          const newRank = TIER_RANK[newTier] ?? 0;
          if (newRank > oldRank) {
            captureServer('plan_upgraded', existing.id, {
              from_plan: existing.subscription_tier,
              to_plan: newTier,
            });
          } else if (newRank < oldRank) {
            captureServer('plan_downgraded', existing.id, {
              from_plan: existing.subscription_tier,
              to_plan: newTier,
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        console.log(`Webhook subscription.deleted: customer=${customerId}`);

        // B2B API subscription cancellation → revoke the linked key.
        if (subscription.metadata?.product === STRIPE_PRODUCT_TAG.b2bApi) {
          try {
            const { handleB2bSubscriptionDeleted } = await import('@/lib/b2b/stripe-webhook');
            await handleB2bSubscriptionDeleted(supabase as any, subscription);
          } catch (e: any) {
            console.error('[stripe webhook] b2b sub.deleted failed:', e?.message);
          }
          break;
        }

        // Household cancellation. Marking the PLAN canceled is what
        // revokes every member's entitlement — there is no fan-out write
        // to member profiles, so no member can be left on a stale tier.
        try {
          const { cancelHouseholdPlan } = await import('@/lib/household');
          await cancelHouseholdPlan(supabase as any, {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customerId,
          });
        } catch (e: any) {
          console.error('[stripe webhook] household cancel failed:', e?.message);
        }

        const { data: existing } = await supabase
          .from('profiles')
          .select('id, subscription_tier')
          .eq('stripe_customer_id', customerId)
          .neq('founding_member', true)
          .maybeSingle();

        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)
          .neq('founding_member', true);

        if (error) console.error('Webhook: subscription.deleted FAILED:', error.message);
        else console.log('Webhook: subscription.deleted — downgraded to free');

        if (!error && existing?.id && existing.subscription_tier) {
          try {
            const { openDowngradeEvent } = await import('@/lib/plan-downgrade');
            await openDowngradeEvent(supabase as any, existing.id, existing.subscription_tier as any, 'free' as any);
          } catch (e) {
            console.error('Webhook: openDowngradeEvent failed:', e);
          }

          // PostHog server-side funnel — a full cancellation is a downgrade
          // to free. Only emit when the user was actually on a paid tier.
          if (existing.subscription_tier !== 'free') {
            captureServer('plan_downgraded', existing.id, {
              from_plan: existing.subscription_tier,
              to_plan: 'free',
              reason: 'subscription_deleted',
            });
          }

          // Phase 3 — churn capture. Emit a churn_prompted event so we
          // can attribute the user's reply (one-tap reason via
          // /api/churn-reason). Also fire-and-forget an email + WhatsApp
          // prompt asking why they cancelled. Each path is wrapped in
          // try/catch — webhook completion always wins over telemetry.
          try {
            const { recordAction } = await import('@/lib/intelligence');
            const { dispatchChurnPrompt } = await import('@/lib/intelligence/churn-prompt');
            await recordAction({
              userId: existing.id,
              actor: 'system',
              actionKind: 'churn_prompted',
              subjectKind: 'churn',
              subjectId: existing.id,
              predicted: {
                from_tier: existing.subscription_tier,
                stripe_customer_id: customerId,
                stripe_subscription_id: (subscription as Stripe.Subscription).id,
              },
            });
            void dispatchChurnPrompt(supabase as any, existing.id);
          } catch (e) {
            console.warn('[stripe webhook] churn-capture step failed:', e);
          }
        }
        break;
      }

      // Refund of a one-off escalation pack → void the entitlement so the
      // user cannot generate a pack they no longer paid for. Only touches
      // rows tagged with this payment intent; subscriptions are unaffected.
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (charge.metadata?.product !== STRIPE_PRODUCT_TAG.escalationPack) break;
        try {
          const { voidEntitlementForSession } = await import('@/lib/escalation-pack/entitlements');
          await voidEntitlementForSession(supabase as any, {
            paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : null,
          });
          console.log('[stripe webhook] escalation pack entitlement voided on refund', charge.payment_intent);
        } catch (e: any) {
          console.error('[stripe webhook] escalation_pack refund handling failed:', e?.message);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        console.log(`Webhook invoice.payment_failed: customer=${customerId}`);

        await supabase
          .from('profiles')
          .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', customerId);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        console.log(`Webhook invoice.payment_succeeded: customer=${customerId} reason=${invoice.billing_reason}`);

        if (invoice.billing_reason && invoice.billing_reason.startsWith('subscription')) {
          await supabase
            .from('profiles')
            .update({ subscription_status: 'active', updated_at: new Date().toISOString() })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      default:
        console.log(`Webhook: unhandled event type ${event.type}`);
        break;
    }
  } catch (err: any) {
    console.error(`Webhook: error handling ${event.type}:`, err.message);
  }

  return NextResponse.json({ received: true });
}

