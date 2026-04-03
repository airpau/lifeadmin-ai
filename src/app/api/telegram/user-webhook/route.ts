import { webhookCallback } from 'grammy';
import { createUserBot } from '@/lib/telegram/user-bot';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Bot instance — created once per cold start
let handleUpdate: ((req: Request) => Promise<Response>) | null = null;

function getHandler() {
  if (!handleUpdate) {
    const bot = createUserBot();
    handleUpdate = webhookCallback(bot, 'std/http');
  }
  return handleUpdate;
}

export async function POST(request: Request) {
  // Validate webhook secret
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_USER_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 403 });
  }

  try {
    return await getHandler()(request);
  } catch (error) {
    console.error('[UserBotWebhook] Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
