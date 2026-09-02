/**
 * Resolve ONE Pocket Agent session row for a user.
 *
 * `telegram_sessions` and `whatsapp_sessions` are unique on the CHANNEL
 * identity (`telegram_chat_id`, `whatsapp_phone`), not on `user_id`. A user who
 * links a second number or device, or who opts out and relinks, legitimately
 * ends up with more than one row. `listActivePocketAgentSessions` in
 * ./dispatch.ts already assumes this — it maps rows per user precisely because
 * "there are still code paths that can leave both rows active".
 *
 * Callers that wanted a single row were getting it wrong in two ways, and both
 * failed silently because every one of them destructured `{ data }` and threw
 * the `error` away:
 *
 *  1. `.eq('user_id', id).maybeSingle()` with no `.limit(1)`. PostgREST answers
 *     a multi-row match with PGRST116 and a null body, so a user with two
 *     linked numbers reads as a user with no Pocket Agent at all, and the
 *     alert is dropped. In large-debit-alert that dropped alert was then
 *     stamped into notification_log as handled, so it never retried.
 *
 *  2. Columns that do not exist. builder-verify and support-chase selected
 *     `telegram_sessions.chat_id` and `whatsapp_sessions.phone_number`,
 *     filtered on `opted_in`, and ordered by `updated_at`. The real columns are
 *     `telegram_chat_id`, `whatsapp_phone`, `opted_in_at`/`opted_out_at` and
 *     `last_message_at`. Every one of those queries returned 42703, so those
 *     two fallbacks had never delivered a message to anyone.
 *
 * Ordering is `last_message_at` descending — the most recently active session
 * is the one the user is actually reading, and it matches the tie-break
 * dispatch.ts already uses when both channels are live.
 *
 * These helpers log on error rather than swallowing it, so the next silent
 * drop shows up in the cron logs instead of looking like "user has no session".
 */

// Loose typing to match ./dispatch.ts — crons pass a Supabase client with a
// different generic instantiation than this lib's inference would produce, and
// we only call .from() here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type TelegramSession = {
  telegram_chat_id: number;
  last_message_at: string | null;
};

export type WhatsAppSession = {
  whatsapp_phone: string;
  last_message_at: string | null;
};

/**
 * The active Telegram session for a user, or null if they have none.
 *
 * `context` names the caller so a failed lookup is attributable in the logs.
 */
export async function resolveTelegramSession(
  supabase: AdminClient,
  userId: string,
  context: string,
): Promise<TelegramSession | null> {
  const { data, error } = await supabase
    .from('telegram_sessions')
    .select('telegram_chat_id, last_message_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[${context}] telegram session lookup failed:`, error.message);
    return null;
  }
  return (data as TelegramSession | null) ?? null;
}

/**
 * The active, opted-in WhatsApp session for a user, or null if they have none.
 *
 * `opted_out_at IS NULL` is part of the definition of active here: an opted-out
 * row may still carry `is_active = true`, and sending to it would breach the
 * Meta opt-in policy the column exists to enforce.
 */
export async function resolveWhatsAppSession(
  supabase: AdminClient,
  userId: string,
  context: string,
): Promise<WhatsAppSession | null> {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('whatsapp_phone, last_message_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('opted_out_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[${context}] whatsapp session lookup failed:`, error.message);
    return null;
  }
  return (data as WhatsAppSession | null) ?? null;
}
