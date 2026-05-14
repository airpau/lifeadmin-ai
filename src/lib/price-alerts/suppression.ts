import type { SupabaseClient } from '@supabase/supabase-js';

// Window we honour a dismissed/actioned alert as "the same alert the user
// already dealt with". After 30 days we let the cron re-raise it in case
// the price changes again or the user changes their mind.
const DISMISSED_SUPPRESSION_DAYS = 30;

export interface SuppressionFingerprint {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
}

/**
 * Build a suppression checker for price-increase alerts.
 *
 * Suppresses a candidate (merchant, oldAmount, newAmount) when EITHER:
 *  - the user already has an ACTIVE alert for the same merchant (any amounts), OR
 *  - the user dismissed/actioned an alert for the same merchant AND same rounded
 *    amounts within the last {@link DISMISSED_SUPPRESSION_DAYS} days.
 *
 * The dismissed-history check is what the cron was missing: before this, a
 * dismissed row never produced a fingerprint match, so the next daily run
 * recreated the identical alert (B/Card Plat Visa, Onestream, Bank Of Scotland
 * all accumulated multiple rows in production).
 *
 * Note on the 30-day window: `price_increase_alerts` only stores `created_at`,
 * not a separate `dismissed_at`. We use `created_at` as the window anchor —
 * accurate enough because the cron runs daily so any dismiss decision sits at
 * most 1 day after creation. After 30 days we deliberately let a fresh alert
 * through so genuinely new price moves are not suppressed forever.
 */
export async function buildPriceAlertSuppressor(
  supabase: SupabaseClient,
  userId: string,
): Promise<(candidate: SuppressionFingerprint) => boolean> {
  const sinceIso = new Date(
    Date.now() - DISMISSED_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: existing } = await supabase
    .from('price_increase_alerts')
    .select('merchant_normalized, old_amount, new_amount, status, created_at')
    .eq('user_id', userId)
    .in('status', ['active', 'dismissed', 'actioned']);

  const activeMerchants = new Set<string>();
  const recentFingerprints = new Set<string>();

  for (const row of existing ?? []) {
    const merchant = String(row.merchant_normalized ?? '').toLowerCase().trim();
    if (!merchant) continue;
    if (row.status === 'active') {
      activeMerchants.add(merchant);
      continue;
    }
    // dismissed / actioned: only suppress while still inside the window
    if (!row.created_at || row.created_at < sinceIso) continue;
    recentFingerprints.add(
      fingerprintKey(merchant, Number(row.old_amount), Number(row.new_amount)),
    );
  }

  return (candidate: SuppressionFingerprint) => {
    const merchant = candidate.merchantNormalized.toLowerCase().trim();
    if (!merchant) return false;
    if (activeMerchants.has(merchant)) return true;
    return recentFingerprints.has(
      fingerprintKey(merchant, candidate.oldAmount, candidate.newAmount),
    );
  };
}

/**
 * Fingerprint amounts to the nearest pound. The detector's average-based
 * `oldAmount` can drift by pence between runs (sliding 6-month window), so
 * sub-pound resolution would produce false negatives. New amount comes from
 * a real transaction and is stable, but we round both for symmetry.
 */
function fingerprintKey(merchantLower: string, oldAmount: number, newAmount: number): string {
  return `${merchantLower}|${Math.round(oldAmount)}|${Math.round(newAmount)}`;
}
