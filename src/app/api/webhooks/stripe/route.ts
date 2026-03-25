import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { notifyAgents } from '@/lib/agent-notify';

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
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
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
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .select('id, subscription_tier')
          .single();

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

        console.log(`Webhook subscription.updated: status=${status} customer=${customerId} tier=${tier}`);

        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: status === 'canceled' ? 'free' : tier,
            subscription_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        if (error) console.error('Webhook: subscription.updated FAILED:', error.message);
        else console.log('Webhook: subscription.updated OK');
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        console.log(`Webhook subscription.deleted: customer=${customerId}`);

        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        if (error) console.error('Webhook: subscription.deleted FAILED:', error.message);
        else console.log('Webhook: subscription.deleted — downgraded to free');
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
