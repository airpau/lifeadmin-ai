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

export async function handleB2bCheckoutExpired(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const email = session.customer_email || session.customer_details?.email || '';
  if (!email) return;
  const lower = email.toLowerCase();
  // Only mark abandoned if still in checkout_started — don't clobber a converted row.
  await supabase
    .from('b2b_waitlist')
    .update({ status: 'checkout_abandoned', reviewed_at: new Date().toISOString() })
    .eq('work_email', lower)
    .eq('status', 'checkout_started');

  const tier = (session.metadata?.tier as string) || 'unknown';
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(tgChat),
          text: `🛒💀 *Checkout abandoned*\n\n${lower}\nTier: ${tier}\n\n_Chase candidate. Personal email + offer the Starter free pilot to keep them warm._`,
          parse_mode: 'Markdown',
        }),
      });
    } catch {}
  }
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
        to: process.env.FOUNDER_EMAIL || 'business@paybacker.co.uk',
        replyTo: lower,
        subject: `🛒💀 B2B abandoned — ${lower} (${tier})`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
          <h2 style="margin:0 0 6px;">B2B checkout abandoned</h2>
          <p>${escapeHtml(lower)} started a <strong>${escapeHtml(tier)}</strong> checkout but did not complete.</p>
          <p style="background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 14px;color:#991b1b;border-radius:6px;">Personal email recommended. Offer the free Starter pilot as a softer entry point.</p>
          <p><a href="https://paybacker.co.uk/dashboard/admin/b2b" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Open admin</a></p>
        </div>`,
      });
    } catch {}
  }
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
    throw new Error('[b2b stripe] no email on checkout session — cannot mint key');
  }

  // Idempotency: Stripe can replay checkout.session.completed. If a
  // non-revoked key already exists for this subscription, no-op so we
  // don't mint duplicates and email conflicting credentials.
  if (subscriptionId) {
    const { data: dupe } = await supabase
      .from('b2b_api_keys')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .is('revoked_at', null)
      .maybeSingle();
    if (dupe) {
      console.log(`[b2b stripe] idempotent skip — key already exists for sub ${subscriptionId}`);
      return;
    }
  }

  // Mark waitlist row converted (if any).
  await supabase
    .from('b2b_waitlist')
    .update({ status: 'converted', reviewed_at: new Date().toISOString() })
    .eq('work_email', customerEmail.toLowerCase());

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
    // Throw so the webhook returns 500 and Stripe retries delivery —
    // a transient Supabase failure must not leave a paid customer
    // without a provisioned key.
    throw new Error(`[b2b stripe] key insert failed: ${error.message}`);
  }

  // Email plaintext to customer ONCE — sent from business@ so replies
  // route to the B2B inbox the founder watches separately.
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
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

  // Founder ping — Telegram + email on every sale (free pilots ping
  // separately from /api/v1/free-pilot).
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
  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>',
        to: process.env.FOUNDER_EMAIL || 'business@paybacker.co.uk',
        replyTo: customerEmail,
        subject: `💰 B2B sale — ${company || customerEmail} (${tier})`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:auto;color:#0f172a;">
          <h2 style="margin:0 0 6px;">B2B API sale</h2>
          <p style="margin:0 0 4px;"><strong>${escapeHtml(company || '(not given)')}</strong> — ${escapeHtml(tier)}</p>
          <p style="margin:0 0 4px;">Contact: ${escapeHtml(contactName || '—')} · <a href="mailto:${escapeHtml(customerEmail)}">${escapeHtml(customerEmail)}</a></p>
          <p style="margin:0 0 12px;">Key prefix: <code>${minted.prefix}</code> · Subscription: <code>${escapeHtml(subscriptionId || '—')}</code></p>
          <p style="background:#ecfdf5;border-left:3px solid #047857;padding:10px 14px;color:#065f46;border-radius:6px;font-size:14px;">Customer has been emailed their plaintext key once. Send a personal welcome reply within 24h to land the relationship.</p>
          <p><a href="https://paybacker.co.uk/dashboard/admin/b2b" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Open admin</a></p>
        </div>`,
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
