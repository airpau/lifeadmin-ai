// src/lib/telegram.ts
// Thin wrapper around the Telegram Bot API. Token comes from the
// existing get_telegram_token() Postgres function so it stays in
// Supabase Vault and out of the build artefacts.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

type SupabaseAdmin = SupabaseClient;

let cachedToken: string | null = null;

async function getBotToken(admin: SupabaseAdmin): Promise<string> {
  if (cachedToken) return cachedToken;
  const { data, error } = await admin.rpc('get_telegram_token');
  if (error) throw new Error(`get_telegram_token failed: ${error.message}`);
  if (!data) throw new Error('get_telegram_token returned null');
  cachedToken = String(data);
  return cachedToken;
}

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboard = InlineKeyboardButton[][];

export interface SendMessageOpts {
  chatId: number | string;
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  inlineKeyboard?: InlineKeyboard;
  disableWebPagePreview?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  date: number;
}

export interface SendMessageResult {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
}

export async function sendTelegramMessage(
  admin: SupabaseAdmin,
  opts: SendMessageOpts,
): Promise<SendMessageResult> {
  const token = await getBotToken(admin);
  const body: Record<string, unknown> = {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode ?? 'Markdown',
    disable_web_page_preview: opts.disableWebPagePreview ?? true,
  };
  if (opts.inlineKeyboard) {
    body.reply_markup = { inline_keyboard: opts.inlineKeyboard };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as SendMessageResult;
}

export async function answerCallbackQuery(
  admin: SupabaseAdmin,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const token = await getBotToken(admin);
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

export async function editTelegramMessage(
  admin: SupabaseAdmin,
  opts: {
    chatId: number | string;
    messageId: number;
    text: string;
    parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
    inlineKeyboard?: InlineKeyboard;
  },
): Promise<void> {
  const token = await getBotToken(admin);
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: opts.chatId,
      message_id: opts.messageId,
      text: opts.text,
      parse_mode: opts.parseMode ?? 'Markdown',
      reply_markup: opts.inlineKeyboard
        ? { inline_keyboard: opts.inlineKeyboard }
        : undefined,
    }),
  });
}

/**
 * Helper used by the cron route and by the webhook dispatcher.
 * Looks up the chat_id for a given user_id from telegram_sessions.
 * Returns null if the user hasn't linked Telegram.
 */
export async function getChatIdForUser(
  admin: SupabaseAdmin,
  userId: string,
): Promise<number | null> {
  const { data } = await admin
    .from('telegram_sessions')
    .select('telegram_chat_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data?.telegram_chat_id ?? null;
}

/**
 * Used by both the cron and the webhook to lazily get a service-role
 * Supabase client. Same pattern as the rest of the cron routes.
 */
export function getSupabaseAdmin(): SupabaseAdmin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
