/**
 * User-facing alert dedup helper.
 *
 * Policy (2026-05-17): WhatsApp is the only user-facing Pocket Agent
 * channel. Telegram is reserved for admin/founder system messages
 * (signups, audit digests, cron health). The user was getting every
 * Pocket Agent alert twice — once on each channel — because the
 * legacy `telegram-*` user-facing crons send unconditionally via
 * Telegram and the WhatsApp fan-out adds a second send for the
 * same event.
 *
 * Crons that send user-facing alerts via the Telegram bot import
 * `loadUsersWithActiveWhatsApp` and skip any user_id present in
 * the returned Set. WhatsApp users get the same event via the
 * channel-agnostic pocket-agent dispatch (or the equivalent
 * WhatsApp template send), so dropping the Telegram dispatch is
 * a deduplication, not a deletion.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export async function loadUsersWithActiveWhatsApp(
  supabase: AdminClient,
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('is_active', true)
      .is('opted_out_at', null);
    if (error) {
      console.warn('[whatsapp-dedup] whatsapp_sessions load failed:', error.message);
      return new Set();
    }
    return new Set(
      ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    );
  } catch (err) {
    console.warn('[whatsapp-dedup] load failed:', err);
    return new Set();
  }
}
