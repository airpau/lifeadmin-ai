import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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
  'price_1TDVvS7qw7mEWYpyN80zzAXM': 'essential',
  'price_1TDVvS7qw7mEWYpynfpI5x9M': 'essential',
  'price_1TDVvT7qw7mEWYpySmjZJTpG': 'pro',
  'price_1TDVvT7qw7mEWYpyrLHr6L45': 'pro',
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

        // Awin server-to-server conversion tracking (full spec)
        if (!updateError) {
          const amount = tier === 'pro' ? '19.99' : '9.99';
          const commissionGroup = tier === 'pro' ? 'PRO' : 'ESSENTIAL';
          const productName = tier === 'pro' ? 'Paybacker+Pro' : 'Paybacker+Essential';
          const orderRef = encodeURIComponent(`sub-${session.subscription || session.id}`);
          const awc = encodeURIComponent(session.metadata?.awc || '');
          const sku = tier === 'pro' ? 'pro-monthly' : 'essential-monthly';
          const productLevel = `AW:P|125502|${orderRef}|${tier}|${productName}|${amount}|1|${sku}|${commissionGroup}|Subscription`;
          const awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=125502&amount=${amount}&ch=aw&parts=${commissionGroup}:${amount}&vc=&cr=GBP&ref=${orderRef}&cks=${awc}&customeracquisition=NEW&bd[0]=${encodeURIComponent(productLevel)}`;
          fetch(awinUrl).catch(err => console.error('Awin S2S tracking failed:', err.message));
          console.log(`Awin S2S fired: tier=${tier} amount=${amount} awc=${awc ? 'present' : 'none'}`);
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
