import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function sendTelegram(chatId: number, text: string) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
  }
}

/**
 * Runs the developer agent and sends the result to Telegram.
 * Called from the webhook as a separate function to avoid timeout.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { chatId, task } = await request.json();

  try {
    const devRes = await fetch('https://paybacker.co.uk/api/developer/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task }),
    });

    const result = await devRes.json();

    if (result.ok && result.pr) {
      await sendTelegram(chatId, `*PR Created*\n\n[${result.pr}](${result.pr})\n\nBranch: \`${result.branch}\`\nFiles: ${result.files}\n\nReview and merge when ready.`);
    } else {
      await sendTelegram(chatId, `Developer agent couldn't create PR: ${result.error || result.detail || 'unknown error'}`);
    }
  } catch (err: any) {
    await sendTelegram(chatId, `Developer agent failed: ${err.message}`);
  }

  return NextResponse.json({ ok: true });
}
