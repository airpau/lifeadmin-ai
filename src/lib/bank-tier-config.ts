/**
 * Tiered bank sync configuration.
 * Single source of truth for connection limits, sync schedules, and manual sync rules.
 */

export type SyncTrigger = 'cron' | 'manual' | 'initial';
export type SyncStatus = 'success' | 'failed' | 'skipped';
import type { PlanTier } from '@/lib/tier-rank';
import { sendFounderAlert } from '@/lib/telegram/founder-alert';

/**
 * Bank config is keyed by the full PlanTier union so the compiler forces
 * an entry for every new tier. The previous local
 * `'free' | 'essential' | 'pro'` alias let `TIER_CONFIG[tier] ?? TIER_CONFIG.free`
 * in /api/auth/yapily silently apply Free's 2-bank cap to a higher tier.
 */
export type BankTier = PlanTier;

// Updated April 2026 to match PLAN_LIMITS (see src/lib/plan-limits.ts).
// Free now gets daily auto-sync and 2 banks (Emma-parity on Free so we don't
// lose the head-to-head at £0). Essential gets 3 banks. Pro unlimited.
// Manual on-demand sync stays Pro-only (cost protection).
export const TIER_CONFIG = {
  free: {
    maxConnections: 2,
    dailyCron: true,
    weeklyCron: false,
    manualSyncAllowed: false,
    manualSyncCooldownHours: 0,
    manualSyncDailyLimit: 0,
    upgradeMessage: 'Upgrade to Essential for 3 banks, or Pro for unlimited + on-demand sync.',
  },
  essential: {
    maxConnections: 3,
    dailyCron: true,
    weeklyCron: false,
    manualSyncAllowed: false,
    manualSyncCooldownHours: 0,
    manualSyncDailyLimit: 0,
    upgradeMessage: 'Upgrade to Pro for unlimited banks + on-demand sync.',
  },
  pro: {
    maxConnections: Infinity,
    dailyCron: true,
    weeklyCron: false,
    manualSyncAllowed: true,
    manualSyncCooldownHours: 1,
    manualSyncDailyLimit: 10,
    upgradeMessage: null,
  },
  // Household seats get the full Pro bank experience — each member's
  // connections are their own, counted against their own account.
  household: {
    maxConnections: Infinity,
    dailyCron: true,
    weeklyCron: false,
    manualSyncAllowed: true,
    manualSyncCooldownHours: 1,
    manualSyncDailyLimit: 10,
    upgradeMessage: null,
  },
} as const satisfies Record<BankTier, {
  maxConnections: number;
  dailyCron: boolean;
  weeklyCron: boolean;
  manualSyncAllowed: boolean;
  manualSyncCooldownHours: number;
  manualSyncDailyLimit: number;
  upgradeMessage: string | null;
}>;

/** Global Open Banking (Yapily) cost protection */
export const GLOBAL_DAILY_API_CEILING = 500;
export const API_CEILING_ALERT_PCT = 0.8; // Send Telegram alert at 80%

/**
 * Returns how many API calls have been made today across all users.
 * Used to enforce the global ceiling before running syncs.
 */
export async function getTodayApiCallCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('bank_sync_log')
    .select('api_calls_made')
    .gte('created_at', todayStart.toISOString());

  return (data || []).reduce((sum: number, r: { api_calls_made: number }) => sum + (r.api_calls_made || 0), 0);
}

/**
 * Sends a Telegram message to the founder's chat.
 * Non-fatal — errors are swallowed.
 *
 * The implementation now lives in src/lib/telegram/founder-alert.ts
 * (sendFounderAlert) so non-bank code can use it too. Re-exported here
 * under the original name so the existing bank-sync callers
 * (/api/cron/bank-sync, /api/bank/sync-now) keep working unchanged.
 */
export { sendFounderAlert as sendTelegramAlert } from '@/lib/telegram/founder-alert';

/**
 * Checks current API usage and fires a Telegram alert if we just crossed 80%.
 * Call this after recording new calls to the log.
 */
export async function checkAndAlertCeiling(
  previousCount: number,
  newCount: number
): Promise<void> {
  const alertThreshold = GLOBAL_DAILY_API_CEILING * API_CEILING_ALERT_PCT;

  // Only fire once — when we first cross the threshold
  if (previousCount < alertThreshold && newCount >= alertThreshold) {
    await sendFounderAlert(
      `⚠️ *Open Banking API usage alert*\n\n` +
      `${newCount}/${GLOBAL_DAILY_API_CEILING} API calls used today ` +
      `(${Math.round((newCount / GLOBAL_DAILY_API_CEILING) * 100)}%).\n` +
      `Approaching daily ceiling — monitor closely.`
    );
  }
}
