/**
 * Founder Telegram alert.
 *
 * Posts a Markdown message to the founder's private chat via the bot
 * configured by TELEGRAM_BOT_TOKEN + TELEGRAM_FOUNDER_CHAT_ID. This is
 * an admin-only notification channel (signups, cost ceilings, sync
 * failures) and must NEVER block or fail the calling request, so every
 * error is swallowed.
 *
 * Extracted from src/lib/bank-tier-config.ts (which re-exports it as
 * `sendTelegramAlert` for the existing bank-sync callers) so non-bank
 * code paths, like the signup welcome route, can alert the founder
 * without importing bank tier config.
 */
export async function sendFounderAlert(message: string): Promise<void> {
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
    // Non-fatal — founder alerts must never break the caller.
  }
}
