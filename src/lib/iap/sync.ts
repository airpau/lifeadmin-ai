/**
 * IAP → database sync logic.
 *
 * Single entry point — `syncAppleSubscription()` — that takes a verified
 * Apple JWS payload and updates both the `subscriptions` row AND
 * `profiles.subscription_tier` if appropriate.
 *
 * Why both: legacy code reads `profiles.subscription_tier` everywhere
 * (see CLAUDE.md — "getEffectiveTier trusts profile.subscription_tier
 * as source of truth"). We keep that pattern. The `subscriptions`
 * table grows the source-of-record for what each billing system says,
 * and profile.subscription_tier reflects the MAX tier across sources.
 *
 * Idempotent: same Apple originalTransactionId processed twice writes
 * the same row state both times. Safe to call from webhook retries.
 */

import { createClient } from '@supabase/supabase-js';
import { getIapProduct, type IapTier, type IapPeriod, maxTier } from './products';
import type { JwsTransactionPayload } from './apple';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface SyncResult {
  ok: boolean;
  userId?: string;
  productId: string;
  tier: IapTier;
  period: IapPeriod;
  status: 'active' | 'expired' | 'refunded';
  effectiveTierBefore: string;
  effectiveTierAfter: string;
  reason?: string;
}

async function resolveUserId(
  originalTransactionId: string,
  fallbackUserId?: string,
): Promise<string | null> {
  if (fallbackUserId) return fallbackUserId;

  const admin = getAdmin();
  const { data } = await admin
    .from('subscriptions')
    .select('user_id')
    .eq('apple_original_transaction_id', originalTransactionId)
    .maybeSingle();

  return (data?.user_id as string) ?? null;
}

export async function syncAppleSubscription(
  payload: JwsTransactionPayload,
  userId?: string,
): Promise<SyncResult> {
  const product = getIapProduct(payload.productId);
  if (!product) {
    return {
      ok: false,
      productId: payload.productId,
      tier: 'essential',
      period: 'monthly',
      status: 'active',
      effectiveTierBefore: 'free',
      effectiveTierAfter: 'free',
      reason: `unknown productId: ${payload.productId}`,
    };
  }

  const resolvedUserId = await resolveUserId(payload.originalTransactionId, userId);
  if (!resolvedUserId) {
    return {
      ok: false,
      productId: payload.productId,
      tier: product.tier,
      period: product.period,
      status: 'active',
      effectiveTierBefore: 'free',
      effectiveTierAfter: 'free',
      reason: `no user linked to originalTransactionId ${payload.originalTransactionId} — verify must run first`,
    };
  }

  const admin = getAdmin();

  const now = Date.now();
  const expired = payload.expiresDate != null && payload.expiresDate < now;
  const refunded = payload.revocationDate != null;
  const status: 'active' | 'expired' | 'refunded' = refunded
    ? 'refunded'
    : expired
      ? 'expired'
      : 'active';

  const { data: beforeProfile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_source')
    .eq('id', resolvedUserId)
    .single();
  const effectiveTierBefore = (beforeProfile?.subscription_tier as string) ?? 'free';

  const subRow = {
    user_id: resolvedUserId,
    source: 'apple_iap' as const,
    product_id: payload.productId,
    apple_original_transaction_id: payload.originalTransactionId,
    expires_at: payload.expiresDate ? new Date(payload.expiresDate).toISOString() : null,
    auto_renew: !refunded && !expired,
    status,
    tier: product.tier,
    billing_period: product.period,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await admin
    .from('subscriptions')
    .upsert(subRow, { onConflict: 'apple_original_transaction_id' });

  if (upsertErr) {
    return {
      ok: false,
      userId: resolvedUserId,
      productId: payload.productId,
      tier: product.tier,
      period: product.period,
      status,
      effectiveTierBefore,
      effectiveTierAfter: effectiveTierBefore,
      reason: `subscriptions upsert failed: ${upsertErr.message}`,
    };
  }

  const { data: activeRows } = await admin
    .from('subscriptions')
    .select('tier, source, status, expires_at')
    .eq('user_id', resolvedUserId)
    .in('status', ['active', 'trialing']);

  const tiersFromActive = (activeRows ?? [])
    .filter((r: { expires_at: string | null }) => !r.expires_at || new Date(r.expires_at) > new Date())
    .map((r: { tier: string }) => r.tier);

  const newEffective = maxTier(...tiersFromActive);

  let effectiveTierAfter = effectiveTierBefore;
  if (newEffective !== effectiveTierBefore) {
    const winningSource = (activeRows ?? []).find(
      (r: { tier: string; source: string }) => r.tier === newEffective,
    )?.source ?? 'apple_iap';

    const { error: profErr } = await admin
      .from('profiles')
      .update({
        subscription_tier: newEffective,
        subscription_source: winningSource,
      })
      .eq('id', resolvedUserId);

    if (!profErr) {
      effectiveTierAfter = newEffective;
    }
  }

  // Cross-source overlap log for support visibility
  const sources = new Set((activeRows ?? []).map((r: { source: string }) => r.source));
  if (sources.size > 1) {
    try {
      await admin.from('business_log').insert({
        category: 'iap_overlap',
        title: 'User has active subs on multiple sources',
        content: JSON.stringify({
          userId: resolvedUserId,
          sources: Array.from(sources),
          tiers: tiersFromActive,
          effectiveTier: effectiveTierAfter,
        }),
        created_by: 'iap-sync',
      });
    } catch {
      // business_log may not be present in dev — fail open
    }
  }

  return {
    ok: true,
    userId: resolvedUserId,
    productId: payload.productId,
    tier: product.tier,
    period: product.period,
    status,
    effectiveTierBefore,
    effectiveTierAfter,
  };
}
