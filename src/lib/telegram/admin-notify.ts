/**
 * ADMIN NOTIFICATION ONLY — NOT user-facing.
 *
 * This module sends messages exclusively to the founder's personal Telegram chat
 * via the ADMIN bot (@PaybackerAssistantBot), completely separate from the
 * user-facing bot.
 *
 * Bot separation:
 *   TELEGRAM_ADMIN_BOT_TOKEN  — @PaybackerAssistantBot (admin/founder messages) ← preferred
 *   TELEGRAM_BOT_TOKEN        — Legacy env alias for the admin bot (fallback)
 *   TELEGRAM_USER_BOT_TOKEN   — Customer-facing bot — NEVER used here
 *
 * Required env vars:
 *   TELEGRAM_ADMIN_BOT_TOKEN  — Admin bot token (preferred)
 *   TELEGRAM_BOT_TOKEN        — Fallback if TELEGRAM_ADMIN_BOT_TOKEN not set
 *   TELEGRAM_ADMIN_CHAT_ID    — Paul's personal Telegram chat ID on the admin bot
 *   TELEGRAM_FOUNDER_CHAT_ID  — Legacy alias for TELEGRAM_ADMIN_CHAT_ID (fallback)
 *
 * This module must NEVER send to any user chat IDs from the telegram_sessions table.
 * Used by: CEO report, ad metrics, legal updates, system health alerts.
 * NOT used by: user bots, proactive financial alerts, or any user-facing cron.
 *
 * To find your chat ID: message @userinfobot on Telegram.
 */

function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + limit;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + limit / 2) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

/**
 * Sends a message to the founder's personal Telegram chat only.
 * Throws if TELEGRAM_ADMIN_CHAT_ID (or TELEGRAM_FOUNDER_CHAT_ID) is not configured.
 *
 * @param message - Markdown-formatted message text
 * @returns true if all chunks sent successfully, false on any Telegram API error
 */
export async function sendAdminNotification(message: string): Promise<boolean> {
  // Use the admin bot token — NEVER the user-facing bot token
  const token = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[admin-notify] TELEGRAM_ADMIN_BOT_TOKEN not set — cannot send admin notification');
    return false;
  }

  // SAFETY: only ever send to the admin chat ID, never to user chat IDs
  const rawChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!rawChatId) {
    console.error('[admin-notify] TELEGRAM_ADMIN_CHAT_ID not set — cannot send admin notification');
    return false;
  }

  const chatId = Number(rawChatId);
  if (isNaN(chatId) || chatId === 0) {
    console.error('[admin-notify] TELEGRAM_ADMIN_CHAT_ID is not a valid number:', rawChatId);
    return false;
  }

  const chunks = splitMessage(message);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error('[admin-notify] Telegram API error:', data.description);
      return false;
    }
  }
  return true;
}
