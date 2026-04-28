/**
 * Stripe webhook handlers specific to the B2B API.
 *
 * Kept in lib/b2b so the main webhook route stays readable. These
 * handlers are dynamically imported only when a B2B-tagged event
 * fires, so the consumer billing path pays no extra cost.
 */

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateKey } from './auth';
import { resend } from '@/lib/resend';

const TIER_LIMITS: Record<string, number> = {
  starter: 1000,
  growth: 10_000,
  enterprise: 100_000,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function handleB2bCheckoutCompleted(
  supabase: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const tier = (session.metadata?.tier as string) || 'growth';
  const monthlyLimit = TIER_LIMITS[tier] ?? 10_000;
  const customerEmail =
    session.customer_email ||
    session.customer_details?.email ||
    '';
  const company = (session.metadata?.company as string) || '';
  const contactName = (session.metadata?.contact_name as string) || '';
  const subscriptionId = session.subscription as string | null;
  const customerId = session.customer as string | null;

  if (!customerEmail) {
    console.error('[b2b stripe] no email on session, cannot mint key');
    return;
  }

  // Mint key
  const minted = generateKey();
  const { error } = await supabase.from('b2b_api_keys').insert({
    name: company ? `${company} (${tier})` : `${customerEmail} (${tier})`,
    key_hash: minted.hash,
    key_prefix: minted.prefix,
    tier,
    monthly_limit: monthlyLimit,
    owner_email: customerEmail.toLowerCase(),
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    notes: `Stripe checkout · contact: ${contactName} · session: ${session.id}`,
  });
  if (error) {
    console.error('[b2b stripe] insert key failed:', error.message);
    return;
  }

  // Email plaintext to customer ONCE — sent from business@ so replies
  // route to the B2B inbox the founder watches separately.
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || 'Paybacker for Business <business@paybacker.co.uk>',
        to: customerEmail,
        replyTo: 'business@paybacker.co.uk',
        subject: `Your Paybacker API key (${tier} — ${monthlyLimit.toLocaleString()} calls/month)`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
            <p>Hi ${escapeHtml(contactName || 'there')},</p>
            <p>Your subscription is live — here is your API key:</p>
            <p style="background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:14px;word-break:break-all;">${minted.plaintext}</p>
            <p><strong>Save this now — it is only shown once.</strong> If you lose it, contact us at hello@paybacker.co.uk to revoke and re-issue.</p>
            <p>Tier: <strong>${tier}</strong> · Monthly cap: <strong>${monthlyLimit.toLocaleString()} calls</strong> · Resets on the 1st (UTC).</p>
            <p>Docs: <a href="https://paybacker.co.uk/for-business/docs">paybacker.co.uk/for-business/docs</a></p>
            <p>Manage your subscription: <a href="https://paybacker.co.uk/dashboard/api-keys">paybacker.co.uk/dashboard/api-keys</a></p>
            <p>— Paul, founder</p>
          </div>`,
      });
    } catch (e: any) {
      console.error('[b2b stripe] email failed:', e?.message);
    }
  }

  // Founder ping
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(tgChat),
          text: `💰 *B2B API sale*\n\n*${tier}* tier · ${customerEmail}\nCompany: ${company || '(not given)'}\nKey prefix: \`${minted.prefix}\``,
          parse_mode: 'Markdown',
        }),
      });
    } catch {}
  }
}

export async function handleB2bSubscriptionDeleted(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  const subId = subscription.id;
  const { error } = await supabase
    .from('b2b_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subId)
    .is('revoked_at', null);
  if (error) console.error('[b2b stripe] revoke on sub.deleted failed:', error.message);
  else console.log(`[b2b stripe] revoked key for subscription ${subId}`);
}
