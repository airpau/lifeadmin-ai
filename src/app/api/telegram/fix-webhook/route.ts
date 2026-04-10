import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// TEMPORARY one-time endpoint — delete after use (pb-fix-wh-20260410)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (token !== 'pb-fix-wh-20260410') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const userToken = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!userToken) {
    return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });
  }

  const webhookSecret = process.env.TELEGRAM_USER_WEBHOOK_SECRET;
  const webhookUrl = 'https://paybacker.co.uk/api/telegram/user-webhook';

  // Get current webhook info
  const infoRes = await fetch(`https://api.telegram.org/bot${userToken}/getWebhookInfo`);
  const info = await infoRes.json();

  // Register webhook
  const setRes = await fetch(`https://api.telegram.org/bot${userToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
      max_connections: 40,
    }),
  });
  const result = await setRes.json();

  return NextResponse.json({
    previous_webhook: info.result,
    set_webhook_result: result,
    target_url: webhookUrl,
    has_secret: !!webhookSecret,
  });
}
