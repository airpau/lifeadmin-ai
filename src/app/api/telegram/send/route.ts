import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { chatId, message } = await request.json();
  const targetChatId = chatId || process.env.TELEGRAM_FOUNDER_CHAT_ID;

  if (!targetChatId || !message) {
    return NextResponse.json({ error: 'chatId and message required' }, { status: 400 });
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
