/**
 * Stripe coupon helper for consumer abandonment nurture.
 *
 * Creates a one-off, single-redemption, time-bounded coupon and an
 * accompanying human-readable promotion code. The user pastes the
 * promotion code on Stripe Checkout to redeem.
 *
 * Naming pattern: WELCOME10-XXXXXX where XXXXXX is 6 random base32-ish
 * characters (uppercase A-Z + digits, ambiguous chars excluded so it
 * reads cleanly aloud / in printed copy).
 */

import Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';

const FRIENDLY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

function randomFriendlyCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += FRIENDLY_ALPHABET[Math.floor(Math.random() * FRIENDLY_ALPHABET.length)];
  }
  return out;
}

export interface CreatedDiscount {
  coupon_id: string;
  promo_code: string;
  expires_at: Date;
}

/**
 * Create a one-off discount coupon + promo code for abandonment recovery.
 *
 * @param email          customer email — stored in metadata for audit
 * @param percentOff     defaults to 10
 * @param durationDays   defaults to 7 — Stripe `redeem_by` & promo `expires_at`
 */
export async function createOneOffDiscountCoupon(
  email: string,
  percentOff: number = 10,
  durationDays: number = 7,
): Promise<CreatedDiscount> {
  const stripe: Stripe = getStripeClient();

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const redeemByUnix = Math.floor(expiresAt.getTime() / 1000);

  const coupon = await stripe.coupons.create({
    percent_off: percentOff,
    duration: 'once',
    max_redemptions: 1,
    redeem_by: redeemByUnix,
    name: `LifeAdmin abandonment recovery ${percentOff}%`,
    metadata: {
      lead_email: email,
      purpose: 'consumer_abandonment_nurture',
      generated_at: new Date().toISOString(),
    },
  });

  // Loop on collisions (vanishingly rare — 32^6 = 1bn possibilities)
  let promoCode: Stripe.PromotionCode | null = null;
  let attempt = 0;
  while (!promoCode && attempt < 5) {
    const candidate = `WELCOME10-${randomFriendlyCode(6)}`;
    try {
      promoCode = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: candidate,
        max_redemptions: 1,
        expires_at: redeemByUnix,
        metadata: {
          lead_email: email,
          purpose: 'consumer_abandonment_nurture',
        },
      });
    } catch (err) {
      attempt += 1;
      if (attempt >= 5) throw err;
    }
  }

  if (!promoCode) {
    throw new Error('Failed to create promotion code after 5 attempts');
  }

  return {
    coupon_id: coupon.id,
    promo_code: promoCode.code,
    expires_at: expiresAt,
  };
}
