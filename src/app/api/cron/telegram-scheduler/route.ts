/**
 * Telegram Scheduler — combined dispatcher cron
 *
 * Runs at: 0 5,8,9,10,13,18 * * *
 *
 * Consolidates 10 individual Telegram notification crons into one vercel.json
 * entry to stay within Vercel Pro's 40-cron limit. Each invocation checks the
 * current UTC hour (and day/date where needed) and calls only the appropriate
 * individual handlers.
 *
 * Hour 05 → price-increase-detection
 * Hour 08 → payment-reminders, contract-expiry, budget-alerts
 *           + weekly-summary (Monday only)
 * Hour 09 → dispute-tracker
 *           + unused-subscription-alert (Wednesday only)
 *           + month-end-recap (1st of month only)
 * Hour 10 → payday-summary
 *           + savings-milestone (Sunday only)
 * Hour 13 → budget-alerts
 * Hour 18 → budget-alerts
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use stable production URL for self-calls.
  // NEXT_PUBLIC_APP_URL = https://paybacker.co.uk (always correct in prod + local).
  // VERCEL_PROJECT_PRODUCTION_URL = stable Vercel hostname (no https:// prefix).
  // VERCEL_URL changes per deployment — last resort only.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'http://localhost:3000';

  const now = new Date();
  const hour = now.getUTCHours();
  const dow = now.getUTCDay();  // 0=Sun, 1=Mon, 3=Wed
  const dom = now.getUTCDate(); // 1-31

  const routes: string[] = [];

  if (hour === 5) {
    routes.push('/api/cron/telegram-price-increase-detection');
  }

  if (hour === 8) {
    routes.push('/api/cron/telegram-payment-reminders');
    routes.push('/api/cron/telegram-contract-expiry');
    routes.push('/api/cron/telegram-budget-alerts');
    if (dow === 1) {
      routes.push('/api/cron/telegram-weekly-summary');
    }
  }

  if (hour === 9) {
    routes.push('/api/cron/telegram-dispute-tracker');
    if (dow === 3) {
      routes.push('/api/cron/telegram-unused-subscription-alert');
    }
    if (dom === 1) {
      routes.push('/api/cron/telegram-month-end-recap');
    }
  }

  if (hour === 10) {
    routes.push('/api/cron/telegram-payday-summary');
    if (dow === 0) {
      routes.push('/api/cron/telegram-savings-milestone');
    }
  }

  if (hour === 13 || hour === 18) {
    routes.push('/api/cron/telegram-budget-alerts');
  }

  const headers = { authorization: `Bearer ${process.env.CRON_SECRET}` };

  const results = await Promise.allSettled(
    routes.map((path) =>
      fetch(`${baseUrl}${path}`, { headers }).then((r) => ({
        status: r.status,
        ok: r.ok,
      })),
    ),
  );

  const summary = results.map((r, i) => ({
    path: routes[i],
    ...(r.status === 'fulfilled' ? r.value : { error: String((r as PromiseRejectedResult).reason) }),
  }));

  return NextResponse.json({ ok: true, hour, dow, dom, dispatched: summary });
}
