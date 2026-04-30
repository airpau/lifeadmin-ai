import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { notifyAgents } from '@/lib/agent-notify';
import { trackSubscription } from '@/lib/meta-conversions';

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

const PRICE_ID_TO_TIER: Record<string, string> = {
  // Old test prices
  'price_1TDVvS7qw7mEWYpyN80zzAXM': 'essential',
  'price_1TDVvS7qw7mEWYpynfpI5x9M': 'essential',
  'price_1TDVvT7qw7mEWYpySmjZJTpG': 'pro',
  'price_1TDVvT7qw7mEWYpyrLHr6L45': 'pro',
  // Old live prices (archived)
  'price_1TDPoH8FbRNalJNU4KeEPNs7': 'essential',
  'price_1TDPoI8FbRNalJNUSVBFOpyA': 'essential',
  'price_1TDPoI8FbRNalJNUDAepvxYt': 'pro',
  'price_1TDPoI8FbRNalJNUEVzsBMvB': 'pro',
  // Founding member prices (test mode)
  'price_1TEdJN8FbRNalJNUQxTQpM8Y': 'essential',
  'price_1TEdJN8FbRNalJNUymPQdKvT': 'essential',
  'price_1TEdJN8FbRNalJNU0o6F4WZZ': 'pro',
  'price_1TEdJO8FbRNalJNUEb0U09ln': 'pro',
  // Founding member prices (live mode - current)
  'price_1TEsJe7qw7mEWYpyVIt4i2Iy': 'essential',
  'price_1TEsJf7qw7mEWYpysxw2lnL3': 'essential',
  'price_1TEsJf7qw7mEWYpy4alOarY6': 'pro',
  'price_1TEsJf7qw7mEWYpyJmrhcy8b': 'pro',
};

function getPlanTier(priceId: string): string {
  return PRICE_ID_TO_TIER[priceId] ?? 'essential';
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
        if (session.metadata?.product === 'b2b_api') {
          try {
            const { handleB2bCheckoutExpired } = await import('@/lib/b2b/stripe-webhook');
            await handleB2bCheckoutExpired(supabase as any, session);
          } catch (e: any) {
            console.error('[stripe webhook] b2b checkout.expired failed:', e?.message);
          }
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // B2B API checkouts have metadata.product='b2b_api' and skip the
        // consumer profile-update path entirely. Mint key, email plaintext.
        if (session.metadata?.product === 'b2b_api') {
          try {
            const { handleB2bCheckoutCompleted } = await import('@/lib/b2b/stripe-webhook');
            await handleB2bCheckoutCompleted(supabase as any, stripe, session);
          } catch (e: any) {
            console.error('[stripe webhook] b2b checkout failed:', e?.message);
          }
          break;
        }

        const userId = session.metadata?.user_id;
        console.log(`Webhook checkout.session.completed: userId=${userId} customer=${session.customer} subscription=${session.subscription}`);

        if (!userId) {
          console.error('Webhook: checkout.session.completed missing user_id in metadata');
          break;
        }

        let tier = 'essential';
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0]?.price.id || '';
          tier = getPlanTier(priceId);
          console.log(`Webhook: subscription priceId=${priceId} tier=${tier} status=${subscription.status}`);
        }

        const { error: updateError, data: updated } = await supabase
          .from('profiles')
          .update({
            subscription_tier: tier,
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

        // Awin server-to-server conversion tracking
        // Send actual sale amount (not commission) — commission group rate handles the percentage
        if (!updateError) {
          const awinAdvId = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID || '125502';
          const saleAmount = tier === 'pro' ? '9.99' : '4.99';
          const commissionGroup = tier === 'pro' ? 'PRO' : 'ESSENTIAL';
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

          // Meta Conversions API - server-side Purchase event
          if (userId) {
            const { data: profile } = await supabase.from('profiles').select('email, fbclid').eq('id', userId).single();
            trackSubscription({
              email: profile?.email || session.customer_details?.email || '',
              userId,
              tier,
              value: tier === 'pro' ? 9.99 : 4.99,
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
          const updateData = {
            subscription_tier: tier,
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
        const newTier = status === 'canceled' ? 'free' : tier;

        console.log(`Webhook subscription.updated: status=${status} customer=${customerId} tier=${tier}`);

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
            subscription_tier: newTier,
            subscription_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)
          .neq('founding_member', true);

        if (error) console.error('Webhook: subscription.updated FAILED:', error.message);
        else console.log('Webhook: subscription.updated OK');

        // Grace-period hook — fires when tier drops to a lower one.
        if (!error && existing?.id && existing.subscription_tier) {
          try {
            const { openDowngradeEvent } = await import('@/lib/plan-downgrade');
            await openDowngradeEvent(supabase as any, existing.id, existing.subscription_tier as any, newTier as any);
          } catch (e) {
            console.error('Webhook: openDowngradeEvent failed:', e);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        console.log(`Webhook subscription.deleted: customer=${customerId}`);

        // B2B API subscription cancellation → revoke the linked key.
        if (subscription.metadata?.product === 'b2b_api') {
          try {
            const { handleB2bSubscriptionDeleted } = await import('@/lib/b2b/stripe-webhook');
            await handleB2bSubscriptionDeleted(supabase as any, subscription);
          } catch (e: any) {
            console.error('[stripe webhook] b2b sub.deleted failed:', e?.message);
          }
          break;
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
