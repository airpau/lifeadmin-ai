import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Use service role for webhook handler (bypasses RLS)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const PRICE_ID_TO_TIER: Record<string, string> = {
  'price_1TD5440Vgfu778nlLrs7RXrS': 'essential', // essential monthly
  'price_1TD5440Vgfu778nlCozaO1Oz': 'essential', // essential yearly
  'price_1TD5440Vgfu778nlP3GzMuQG': 'pro',        // pro monthly
  'price_1TD5450Vgfu778nljBU1F1uN': 'pro',        // pro yearly
};

function getPlanTier(priceId: string): string {
  return PRICE_ID_TO_TIER[priceId] ?? 'essential';
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;

      if (!userId) break;

      // Retrieve subscription to get price ID
      let tier = 'essential';
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const priceId = subscription.items.data[0]?.price.id || '';
        tier = getPlanTier(priceId);
      }

      await supabase
        .from('profiles')
        .update({
          subscription_tier: tier,
          subscription_status: 'active',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const priceId = subscription.items.data[0]?.price.id || '';
      const tier = getPlanTier(priceId);

      const status = subscription.status === 'active' ? 'active'
        : subscription.status === 'canceled' ? 'canceled'
        : subscription.status === 'past_due' ? 'past_due'
        : subscription.status;

      await supabase
        .from('profiles')
        .update({
          subscription_tier: status === 'canceled' ? 'free' : tier,
          subscription_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);

      break;
    }

    case 'customer.subscription.created': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const userId = subscription.metadata?.user_id;

      if (subscription.status === 'trialing') {
        const priceId = subscription.items.data[0]?.price.id || '';
        const tier = getPlanTier(priceId);

        const updateQuery = supabase
          .from('profiles')
          .update({
            subscription_tier: tier,
            subscription_status: 'trialing',
            stripe_subscription_id: subscription.id,
            updated_at: new Date().toISOString(),
          });

        // Match by user_id metadata if available, otherwise by stripe_customer_id
        if (userId) {
          await updateQuery.eq('id', userId);
        } else {
          await updateQuery.eq('stripe_customer_id', customerId);
        }
      }

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      await supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);

      break;
    }

    case 'customer.subscription.paused': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Keep tier but mark paused — plan-limits will block access via Stripe verification
      await supabase
        .from('profiles')
        .update({
          subscription_status: 'paused',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      await supabase
        .from('profiles')
        .update({
          subscription_status: 'past_due',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_customer_id', customerId);

      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // Re-activate after past_due recovery (only for subscription invoices)
      if (invoice.billing_reason && invoice.billing_reason.startsWith('subscription')) {
        await supabase
          .from('profiles')
          .update({
            subscription_status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
      }

      break;
    }

    default:
      // Unhandled event type — ignore
      break;
  }

  return NextResponse.json({ received: true });
}
