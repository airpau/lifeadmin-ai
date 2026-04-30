// src/lib/subscriptions/active-count.ts
// Single source of truth for "how many active subscriptions does this user
// have." Before this helper existed, Money Hub, Dashboard Overview, and the
// Subscriptions page each counted differently (raw query vs client-dedup vs
// an unmigrated `get_subscription_total` RPC), so users saw three different
// numbers for the same thing.
//
// Rules:
//  - Only active, non-dismissed rows
//  - Exclude finance-category rows (mortgage / loan / credit card) — those
//    are liabilities, tracked separately on Money Hub
//  - Dedupe by normalised provider name + log-amount band so a Netflix row
//    that was imported twice doesn't inflate the count

import { cleanMerchantName } from '@/lib/merchant-utils';

export interface ActiveSubscriptionLike {
  provider_name?: string | null;
  amount?: number | string | null;
  status?: string | null;
  dismissed_at?: string | null;
  category?: string | null;
}

const DEBT_KEYWORDS = [
  'mortgage',
  'loan',
  'finance',
  'lendinvest',
  'skipton',
  'santander loan',
  'natwest loan',
  'novuna',
  'ca auto',
  'auto finance',
  'funding circle',
  'zopa',
];

const CREDIT_KEYWORDS = [
  'barclaycard',
  'mbna',
  'halifax credit',
  'hsbc bank visa',
  'virgin money',
  'capital one',
  'american express',
  'amex',
  'securepay',
  'credit card',
];

/**
 * True when the merchant name looks like a loan / mortgage / credit
 * card rather than a cancellable subscription. Reused by the admin
 * cancel-info uncovered-providers list and the Perplexity discovery
 * cron so we don't waste a call researching "how to cancel a Santander
 * loan" — that's a debt, not a subscription.
 */
export function isFinanceProvider(name: string | null | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return DEBT_KEYWORDS.some((k) => lower.includes(k)) || CREDIT_KEYWORDS.some((k) => lower.includes(k));
}

function amountBand(raw: number | string | null | undefined): number {
  const amt = Math.abs(parseFloat(String(raw ?? 0)) || 0);
  if (amt < 0.01) return 0;
  return Math.round(Math.log(amt) / Math.log(1.1));
}

/**
 * Filter a list of subscription rows down to the canonical "active
 * subscriptions" set: active status, not dismissed, finance stripped,
 * duplicates merged.
 */
export function filterActiveSubscriptions<T extends ActiveSubscriptionLike>(subs: T[]): T[] {
  const active = subs.filter(
    (s) => (s.status || 'active') === 'active' && !s.dismissed_at && !isFinanceProvider(s.provider_name),
  );

  const seen = new Map<string, boolean>();
  const deduped: T[] = [];
  for (const s of active) {
    const name = cleanMerchantName(s.provider_name || '').toLowerCase();
    if (!name) continue;
    const key = `${name}|${amountBand(s.amount)}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    deduped.push(s);
  }
  return deduped;
}

export function countActiveSubscriptions(subs: ActiveSubscriptionLike[]): number {
  return filterActiveSubscriptions(subs).length;
}
