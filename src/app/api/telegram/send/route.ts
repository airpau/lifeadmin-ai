/**
 * ADMIN NOTIFICATION ENDPOINT — internal use only.
 *
 * Sends a Telegram message to the admin/founder chat exclusively.
 * Any chatId in the request body is IGNORED — the destination is always
 * TELEGRAM_ADMIN_CHAT_ID (or TELEGRAM_FOUNDER_CHAT_ID as fallback).
 *
 * This endpoint must NEVER be used to send messages to user chat IDs.
 * User notifications are handled by the cron routes in /api/cron/telegram-*/
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Admin bot only — NEVER use TELEGRAM_USER_BOT_TOKEN here
const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { message } = await request.json();

  // SAFETY GUARDRAIL: always send to admin chat only, ignore any chatId in the request
  const targetChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_FOUNDER_CHAT_ID;

  if (!targetChatId || !message) {
    return NextResponse.json({ error: 'TELEGRAM_ADMIN_CHAT_ID not set or message missing' }, { status: 400 });
  }

  // Split long messages
  const chunks = [];
  for (let i = 0; i < message.length; i += 4000) {
    chunks.push(message.slice(i, i + 4000));
  }

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(targetChatId),
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ error: err.description }, { status: 500 });
    }
  }

  return NextResponse.json({ sent: true });
}
