/**
 * Tiered bank sync configuration.
 * Single source of truth for connection limits, sync schedules, and manual sync rules.
 */

export type SyncTrigger = 'cron' | 'manual' | 'initial';
export type SyncStatus = 'success' | 'failed' | 'skipped';
export type BankTier = 'free' | 'essential' | 'pro';

export const TIER_CONFIG = {
  free: {
    maxConnections: 1,
    dailyCron: true,
    weeklyCron: false,
    manualSyncAllowed: false,
    manualSyncCooldownHours: 0,
    manualSyncDailyLimit: 0,
    upgradeMessage: 'Upgrade to Essential for daily auto-sync.',
  },
  essential: {
    maxConnections: 2,
    dailyCron: true,
    weeklyCron: false,
    manualSyncAllowed: false,
    manualSyncCooldownHours: 0,
    manualSyncDailyLimit: 0,
    upgradeMessage: 'Upgrade to Pro for on-demand sync.',
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
 */
export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch {
    // Non-fatal
  }
}

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
    await sendTelegramAlert(
      `⚠️ *Open Banking API usage alert*\n\n` +
      `${newCount}/${GLOBAL_DAILY_API_CEILING} API calls used today ` +
      `(${Math.round((newCount / GLOBAL_DAILY_API_CEILING) * 100)}%).\n` +
      `Approaching daily ceiling — monitor closely.`
    );
  }
}
