/**
 * Telegram User Bot — Webhook Endpoint
 *
 * IMPORTANT: We MUST await bot.handleUpdate() before returning the Response.
 * Vercel terminates serverless functions once the Response is sent — any
 * unawaited Promises (fire-and-forget) get killed silently. This was the root
 * cause of the bot appearing dead: the update was accepted (200) but the
 * message handler never ran because the function was terminated.
 *
 * We bypass grammy's webhookCallback because its hardcoded 10s timeout would
 * return 500 for any Claude call > 10s, causing Telegram to drop the webhook.
 * Instead we await handleUpdate (up to maxDuration 300s) and always return 200.
 * Telegram may retry if we take > 60s, but the dedup in user-bot.ts handles that.
 *
 * ctx.reply() / ctx.api.sendMessage() are direct Telegram API calls — they work
 * regardless of how long we take to return the HTTP response.
 */

import { createUserBot } from '@/lib/telegram/user-bot';
import type { Update } from '@grammyjs/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Bot singleton — created once per Vercel function instance (warm invocations reuse it)
let bot: ReturnType<typeof createUserBot> | null = null;
let botReady = false;

function getBotInstance() {
  if (!bot) {
    bot = createUserBot();
    botReady = false;
  }
  return bot;
}

export async function POST(request: Request) {
  const startMs = Date.now();

  // Validate webhook secret — fail closed if env var is missing or token mismatches.
  const expectedSecret = process.env.TELEGRAM_USER_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[UserBotWebhook] TELEGRAM_USER_WEBHOOK_SECRET is not configured — rejecting request');
    return new Response('Internal Server Error', { status: 500 });
  }
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== expectedSecret) {
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

  const updateId = (update as { update_id?: number }).update_id;
  console.log(`[UserBotWebhook] Received update_id=${updateId} (${Date.now() - startMs}ms)`);

  // Get (or create) the bot instance
  const botInstance = getBotInstance();

  // Init on cold start — only once per function instance
  if (!botReady) {
    try {
      await botInstance.init();
      botReady = true;
      console.log(`[UserBotWebhook] Bot initialised (${Date.now() - startMs}ms)`);
    } catch (err) {
      console.error('[UserBotWebhook] bot.init() failed:', err);
      bot = null;
      botReady = false;
      // Return 200 so Telegram doesn't drop the webhook
      return new Response('OK', { status: 200 });
    }
  }

  // AWAIT the update handler — this is critical. Without awaiting, Vercel kills
  // the function after sending the Response and the handler never completes.
  try {
    await botInstance.handleUpdate(update);
    console.log(`[UserBotWebhook] Finished update_id=${updateId} in ${Date.now() - startMs}ms`);
  } catch (err) {
    console.error(`[UserBotWebhook] Error handling update_id=${updateId}:`, err);
  }

  // Always return 200 — even on error — so Telegram doesn't retry or drop the webhook
  return new Response('OK', { status: 200 });
}
