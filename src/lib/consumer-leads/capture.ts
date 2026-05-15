/**
 * Consumer-lead capture helper.
 *
 * Used by both the Stripe webhook (checkout.session.expired) and the
 * /api/leads/capture endpoint (pricing-page subscribe click). Centralises
 * the upsert logic + unsubscribe-token generation + PostHog ping so the
 * two capture paths stay consistent.
 *
 * B2C ONLY. Callers must pre-filter B2B sessions (metadata.product='b2b_api')
 * before invoking this — we don't want to pollute the consumer funnel with
 * API customers who already have a direct-contact founder path.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { captureServer } from '@/lib/posthog-server';

export type ConsumerLeadSource =
  | 'signup_form'
  | 'stripe_checkout_abandoned'
  | 'pricing_page_exit'
  | 'onboarding_dropoff';

export interface CaptureInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  source: ConsumerLeadSource;
  stripeCheckoutSessionId?: string | null;
  stripeCustomerId?: string | null;
  stripeRecoveryUrl?: string | null;
  intendedTier?: 'essential' | 'pro' | null;
  intendedBillingInterval?: 'monthly' | 'yearly' | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export interface CaptureResult {
  ok: boolean;
  leadId?: string;
  created: boolean;
  reason?: string;
}

function getAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function generateUnsubToken(): string {
  // 32 random bytes, base64url — 43 chars, URL-safe, unguessable.
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Capture or refresh a consumer lead.
 *
 * Idempotency rules:
 *   - If a stripe_checkout_session_id is provided and already exists,
 *     we update the existing row (don't duplicate). Sessions can fire
 *     `expired` once per session; this is a defensive net.
 *   - Otherwise, dedupe on lower(email) within the last 14 days +
 *     not-yet-converted/unsubscribed. Refresh source/tier on hit.
 *   - If matching row is `unsubscribed`, do NOT re-capture — respect the
 *     opt-out.
 */
export async function captureConsumerLead(input: CaptureInput): Promise<CaptureResult> {
  const supabase = getAdminClient();
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false, created: false, reason: 'invalid_email' };
  }

  // 1. Stripe-session dedupe path
  if (input.stripeCheckoutSessionId) {
    const { data: bySession } = await supabase
      .from('consumer_leads')
      .select('id, funnel_stage')
      .eq('stripe_checkout_session_id', input.stripeCheckoutSessionId)
      .maybeSingle();
    if (bySession) {
      return { ok: true, leadId: bySession.id, created: false, reason: 'session_already_captured' };
    }
  }

  // 2. Email dedupe path — only collapse onto a non-terminal row from
  //    the last 14 days. After that, treat as a new lead so the funnel
  //    can re-engage them.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('consumer_leads')
    .select('id, funnel_stage, unsubscribed_at')
    .ilike('email', email)
    .gte('captured_at', fourteenDaysAgo)
    .order('captured_at', { ascending: false })
    .limit(1);

  const existing = recent?.[0];
  if (existing) {
    if (existing.unsubscribed_at || existing.funnel_stage === 'unsubscribed') {
      return { ok: true, leadId: existing.id, created: false, reason: 'previously_unsubscribed' };
    }
    // Refresh source/tier on existing — useful when a user clicked
    // pricing first then started Stripe checkout.
    const { error: updateErr } = await supabase
      .from('consumer_leads')
      .update({
        source: input.source,
        stripe_checkout_session_id: input.stripeCheckoutSessionId ?? undefined,
        stripe_customer_id: input.stripeCustomerId ?? undefined,
        stripe_recovery_url: input.stripeRecoveryUrl ?? undefined,
        intended_tier: input.intendedTier ?? undefined,
        intended_billing_interval: input.intendedBillingInterval ?? undefined,
        name: input.name ?? undefined,
      })
      .eq('id', existing.id);
    if (updateErr) {
      return { ok: false, created: false, reason: updateErr.message };
    }
    return { ok: true, leadId: existing.id, created: false, reason: 'refreshed_existing' };
  }

  // 3. Insert fresh row
  const { data: inserted, error: insertErr } = await supabase
    .from('consumer_leads')
    .insert({
      email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      source: input.source,
      stripe_checkout_session_id: input.stripeCheckoutSessionId ?? null,
      stripe_customer_id: input.stripeCustomerId ?? null,
      stripe_recovery_url: input.stripeRecoveryUrl ?? null,
      intended_tier: input.intendedTier ?? null,
      intended_billing_interval: input.intendedBillingInterval ?? null,
      funnel_stage: 'new',
      unsubscribe_token: generateUnsubToken(),
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { ok: false, created: false, reason: insertErr?.message };
  }

  captureServer('lead_captured', `consumer_lead:${inserted.id}`, {
    source: input.source,
    intended_tier: input.intendedTier,
    intended_billing_interval: input.intendedBillingInterval,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
  });

  return { ok: true, leadId: inserted.id, created: true };
}
