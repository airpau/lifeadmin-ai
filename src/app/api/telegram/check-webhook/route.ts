import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/telegram/check-webhook?fix=true
 * 
 * Checks the webhook config for both bots and optionally fixes the user bot webhook.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const fix = request.nextUrl.searchParams.get('fix') === 'true';
  const results: Record<string, any> = {};

  // Check admin bot webhook
  const adminToken = process.env.TELEGRAM_BOT_TOKEN;
  if (adminToken) {
    const res = await fetch(`https://api.telegram.org/bot${adminToken}/getWebhookInfo`);
    const data = await res.json();
    results.admin_bot = {
      ok: data.ok,
      url: data.result?.url,
      has_custom_certificate: data.result?.has_custom_certificate,
      pending_update_count: data.result?.pending_update_count,
      last_error_date: data.result?.last_error_date,
      last_error_message: data.result?.last_error_message,
    };
  } else {
    results.admin_bot = { error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  // Check user bot webhook
  const userToken = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (userToken) {
    const res = await fetch(`https://api.telegram.org/bot${userToken}/getWebhookInfo`);
    const data = await res.json();
    results.user_bot = {
      ok: data.ok,
      url: data.result?.url,
      has_custom_certificate: data.result?.has_custom_certificate,
      pending_update_count: data.result?.pending_update_count,
      last_error_date: data.result?.last_error_date,
      last_error_message: data.result?.last_error_message,
    };

    // Fix webhook if requested
    if (fix) {
      const webhookSecret = process.env.TELEGRAM_USER_WEBHOOK_SECRET;
      const correctUrl = 'https://paybacker.co.uk/api/telegram/user-webhook';
      
      const setRes = await fetch(`https://api.telegram.org/bot${userToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: correctUrl,
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query'],
          max_connections: 40,
        }),
      });
      const setData = await setRes.json();
      results.user_bot_fix = {
        action: 'set_webhook',
        target_url: correctUrl,
        result: setData,
      };
    }
  } else {
    results.user_bot = { error: 'TELEGRAM_USER_BOT_TOKEN not set' };
  }

  return NextResponse.json(results);
}
