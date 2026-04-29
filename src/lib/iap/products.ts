/**
 * IAP product ID mapping.
 *
 * Apple App Store Connect and Google Play Console both let us define our
 * own product identifiers. We use the same identifier scheme on both so
 * the verify/sync logic doesn't have to special-case per platform.
 *
 * Convention: <app>.<tier>.<period>
 *
 *   paybacker.essential.monthly  → Essential, monthly billing
 *   paybacker.essential.annual   → Essential, annual billing
 *   paybacker.pro.monthly        → Pro, monthly billing
 *   paybacker.pro.annual         → Pro, annual billing
 *
 * These IDs need to be created in App Store Connect (task #50) and Play
 * Console (task #53) BEFORE we can test in sandbox. Prices match
 * src/lib/plan-limits.ts so the in-app display stays consistent with the
 * web pricing page.
 */

export type IapTier = 'essential' | 'pro';
export type IapPeriod = 'monthly' | 'annual';

export interface IapProduct {
  productId: string;
  tier: IapTier;
  period: IapPeriod;
  priceGbp: number;
}

export const IAP_PRODUCTS: readonly IapProduct[] = [
  { productId: 'paybacker.essential.monthly', tier: 'essential', period: 'monthly', priceGbp: 4.99 },
  { productId: 'paybacker.essential.annual',  tier: 'essential', period: 'annual',  priceGbp: 44.99 },
  { productId: 'paybacker.pro.monthly',       tier: 'pro',       period: 'monthly', priceGbp: 9.99 },
  { productId: 'paybacker.pro.annual',        tier: 'pro',       period: 'annual',  priceGbp: 94.99 },
] as const;

const PRODUCT_BY_ID: Record<string, IapProduct> = Object.fromEntries(
  IAP_PRODUCTS.map((p) => [p.productId, p]),
);

export function getIapProduct(productId: string): IapProduct | null {
  return PRODUCT_BY_ID[productId] ?? null;
}

const TIER_RANK: Record<string, number> = {
  free: 0,
  essential: 1,
  pro: 2,
};

export function tierRank(tier: string | null | undefined): number {
  return TIER_RANK[tier ?? 'free'] ?? 0;
}

export function maxTier(...tiers: Array<string | null | undefined>): string {
  let best = 'free';
  for (const t of tiers) {
    if (tierRank(t) > tierRank(best)) best = t ?? 'free';
  }
  return best;
}
