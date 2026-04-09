/**
 * Telegram User Bot — Webhook Endpoint
 *
 * We intentionally bypass grammy's webhookCallback here. The default grammy
 * webhookCallback has a hardcoded 10-second onTimeout:"throw", which means any
 * Claude API call that takes > 10 s returns 500 to Telegram and Telegram
 * stops retrying. Instead we:
 *  1. Parse the update
 *  2. Return 200 to Telegram immediately (so Telegram never sees a failure)
 *  3. Fire-and-forget bot.handleUpdate() with error catching
 *
 * Vercel keeps the function alive until the handler completes (up to maxDuration).
 * ctx.reply() / ctx.api.sendMessage() go out as direct Telegram API calls (not
 * inline webhook reply) because we don't pass a webhookReplyEnvelope.
 */

import { createUserBot } from '@/lib/telegram/user-bot';
import type { Update } from '@grammyjs/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Bot singleton — created once per Vercel function instance (warm invocations reuse it)
let bot: ReturnType<typeof createUserBot> | null = null;
let initPromise: Promise<void> | null = null;

function getBotInstance() {
  if (!bot) {
    bot = createUserBot();
    // Kick off init in background so subsequent requests find it ready
    initPromise = bot.init()
      .then(() => { initPromise = null; })
      .catch((err) => {
        console.error('[UserBotWebhook] bot.init() failed — will retry on next request:', err);
        bot = null;
        initPromise = null;
      });
  }
  return bot;
}

export async function POST(request: Request) {
  // Validate webhook secret — only enforced when the env var is configured.
  const expectedSecret = process.env.TELEGRAM_USER_WEBHOOK_SECRET;
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (expectedSecret && secret !== expectedSecret) {
    console.error('[UserBotWebhook] Secret mismatch — update TELEGRAM_USER_WEBHOOK_SECRET or re-register webhook');
    return new Response('Unauthorized', { status: 403 });
  }

  // Parse the Telegram update
  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Get (or create) the bot instance
  const botInstance = getBotInstance();

  // Wait for init if it's still in progress on first cold-start request
  if (initPromise) {
    await initPromise.catch(() => {});
    // If init failed, bot is null — log and still return 200 so Telegram doesn't retry
    if (!bot) {
      console.error('[UserBotWebhook] Dropping update', (update as { update_id?: number }).update_id, '— bot failed to initialise');
      return new Response('OK', { status: 200 });
    }
  }

  // Fire-and-forget: respond 200 to Telegram immediately, process in background.
  // Vercel keeps this function alive until handleUpdate() resolves (maxDuration: 300s).
  // Any BotError or handler exception is caught and logged — never a 500 to Telegram.
  botInstance.handleUpdate(update).catch((err) => {
    const updateId = (update as { update_id?: number }).update_id;
    console.error('[UserBotWebhook] Error handling update', updateId, ':', err);
  });

  return new Response('OK', { status: 200 });
}
