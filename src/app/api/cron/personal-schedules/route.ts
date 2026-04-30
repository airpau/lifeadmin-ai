/**
 * Personal Schedules Cron — fires user-configured notification schedules.
 *
 * Triggered by Vercel cron every 15 minutes. For each row in
 * `user_notification_schedules` where `enabled=true` and `schedule_kind='cron'`,
 * we evaluate whether the cron expression matches the current time in the
 * user's timezone. If it does, we ask the Pocket Agent to generate the
 * content (using the user's `custom_prompt` if Pro) and fan it out via
 * `sendNotification()`.
 *
 * This route is ONLY for cron-kind schedules — `lead_time` and `threshold`
 * schedules are evaluated by their own detection crons (renewal-reminders,
 * contract-expiry-alerts, etc.). `system` schedules fire when their
 * detection event happens, not on a clock.
 *
 * Idempotency: each (schedule_id, ISO minute) is dedup'd via
 * last_fired_dedup_key so we don't double-fire if the cron sweeper runs
 * twice in the same minute (Vercel sometimes does on retry).
 *
 * Triggered by vercel.json: `*\/15 * * * *`
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { sendNotification } from '@/lib/notifications/dispatch';
import { telegramTools } from '@/lib/telegram/tools';
import { executeToolCall } from '@/lib/telegram/tool-handlers';
import {
  getEventMeta,
  type NotificationEventType,
} from '@/lib/notifications/events';
import { getEffectiveTier } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ScheduleRow {
  id: string;
  user_id: string;
  event_type: string;
  schedule_kind: 'cron' | 'lead_time' | 'threshold' | 'always_on';
  cron_expression: string | null;
  cron_timezone: string | null;
  custom_prompt: string | null;
  enabled: boolean;
  last_fired_dedup_key: string | null;
}

/**
 * Returns true if the cron expression matches the given Date in the
 * given IANA timezone. Supports the standard 5-field cron format:
 *   minute hour day-of-month month day-of-week
 * Each field can be: number | comma-list | range a-b | * | *\/N
 *
 * Timezone-aware. Day-of-week 0 = Sunday (matching Vercel/cron norms).
 */
export function matchesCron(
  expr: string,
  now: Date,
  timezone: string,
): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [m, h, dom, mon, dow] = fields;

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    minute: '2-digit',
    hour: '2-digit',
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';

  const minute = parseInt(get('minute'), 10);
  // Intl Hour returns "00".."24"; "24" should be treated as 0
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  const day = parseInt(get('day'), 10);
  const month = parseInt(get('month'), 10);
  // Map weekday short → 0..6 (Sun..Sat)
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = dayMap[get('weekday')] ?? 0;

  const matchField = (field: string, value: number, max: number): boolean => {
    if (field === '*') return true;
    return field.split(',').some((part) => {
      if (part.startsWith('*/')) {
        const step = parseInt(part.slice(2), 10);
        return step > 0 && value % step === 0;
      }
      if (part.includes('-')) {
        const [a, b] = part.split('-').map((x) => parseInt(x, 10));
        return value >= a && value <= b;
      }
      return parseInt(part, 10) === value;
    });
  };

  return (
    matchField(m, minute, 59) &&
    matchField(h, hour, 23) &&
    matchField(dom, day, 31) &&
    matchField(mon, month, 12) &&
    matchField(dow, weekday, 6)
  );
}

/**
 * Build a dedup key per (schedule, minute, day-in-tz). Stored on the
 * row so concurrent cron invocations don't double-fire.
 */
function buildDedupKey(scheduleId: string, now: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const stamp = ['year', 'month', 'day', 'hour', 'minute']
    .map((t) => parts.find((p) => p.type === t)?.value ?? '00')
    .join('');
  return `${scheduleId}:${stamp}`;
}

/**
 * Generate the content for a scheduled notification by asking the
 * Pocket Agent's tool-calling Claude. Same brain as the inbound
 * handler — this re-uses the agent so users get the same quality
 * scheduled as ad-hoc.
 *
 * Returns plain text. The caller wraps it for the active channel.
 */
async function generateContent(
  userId: string,
  event: NotificationEventType,
  customPrompt: string | null,
): Promise<string> {
  const meta = getEventMeta(event);
  if (!meta) return '';

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const instructionsByEvent: Partial<Record<NotificationEventType, string>> = {
    morning_summary:
      'Compose a concise morning briefing. Pull yesterday\'s spending, today\'s bills due, contracts ending in the next 30 days, and any active dispute milestones. Bullets, no essays.',
    evening_summary:
      'Compose an end-of-day recap. Today\'s spending vs daily average, anything you spotted (refunds, unusual charges), what\'s pending tomorrow.',
    payday_summary:
      'It looks like the user got paid in the last 24 hours. Show income received, upcoming bills this month, what\'s left for spending after fixed costs.',
    weekly_digest:
      'Build a weekly summary: amount spent vs budget, money recovered, top 3 categories, any actions taken or pending.',
    monthly_recap:
      'Build a month-end recap: total income vs spending, biggest savings opportunities found, dispute outcomes, year-to-date Paybacker savings.',
    unused_subscription:
      'Find subscriptions with no transactions in the last 30 days and list them with monthly cost.',
    deal_alert:
      'Surface 1-3 of the cheapest switching deals available right now in categories the user spends in. Link directly to switch.',
    targeted_deal:
      'Surface a single highly relevant switching deal in the user\'s biggest discretionary spend category.',
  };
  const baseInstruction = instructionsByEvent[event] ?? `Compose a ${meta.label}.`;

  const customLine = customPrompt
    ? `\n\nThe user has asked specifically: "${customPrompt}". Honour their style preference.`
    : '';

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `${baseInstruction}${customLine}\n\nUse the relevant tools (get_spending_summary, get_subscriptions, get_disputes, get_upcoming_payments, etc.) to ground every claim in the user's actual data. Currency in £, dates in DD/MM/YYYY. Keep it under 600 chars total.`,
    },
  ];

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are Paybacker\'s Pocket Agent producing a scheduled notification. Be concise and concrete — use the user\'s actual numbers, not generic copy.',
    tools: telegramTools,
    messages,
  });

  // Tool loop — same pattern as user-bot, capped harder for cron
  let iters = 0;
  while (response.stop_reason === 'tool_use' && iters < 4) {
    iters++;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      try {
        const result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
          userId,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.text,
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    }
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are Paybacker\'s Pocket Agent producing a scheduled notification. Be concise and concrete — use the user\'s actual numbers, not generic copy.',
      tools: telegramTools,
      messages,
    });
  }

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdmin();
  const now = new Date();

  // Pull all enabled cron-kind schedules.
  const { data: schedules, error } = await sb
    .from('user_notification_schedules')
    .select('id, user_id, event_type, schedule_kind, cron_expression, cron_timezone, custom_prompt, enabled, last_fired_dedup_key')
    .eq('enabled', true)
    .eq('schedule_kind', 'cron')
    .not('cron_expression', 'is', null);

  if (error) {
    console.error('[cron/personal-schedules] query failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let fired = 0;
  let skipped = 0;
  const errors: Array<{ id: string; reason: string }> = [];

  for (const row of (schedules ?? []) as ScheduleRow[]) {
    if (!row.cron_expression) continue;
    const tz = row.cron_timezone ?? 'Europe/London';

    if (!matchesCron(row.cron_expression, now, tz)) {
      skipped++;
      continue;
    }

    const dedupKey = buildDedupKey(row.id, now, tz);
    if (row.last_fired_dedup_key === dedupKey) {
      // Already fired this minute — skip silently.
      continue;
    }

    // Tier gate: Pro-only events skip non-Pro users entirely.
    const meta = getEventMeta(row.event_type as NotificationEventType);
    if (!meta) continue;

    if (meta.proOnly) {
      const tier = await getEffectiveTier(row.user_id);
      if (tier !== 'pro') {
        skipped++;
        continue;
      }
    }

    try {
      const text = await generateContent(
        row.user_id,
        row.event_type as NotificationEventType,
        row.custom_prompt,
      );
      if (!text) {
        errors.push({ id: row.id, reason: 'empty content' });
        continue;
      }

      // Dispatch — let the unified dispatcher fan out to the user's
      // chosen channel(s) per their notification_preferences.
      const result = await sendNotification(sb, {
        userId: row.user_id,
        event: row.event_type as NotificationEventType,
        telegram: { text },
        whatsapp: { text },
        email: meta.allowedChannels.includes('email')
          ? {
              subject: `Paybacker — ${meta.label}`,
              html: `<div style="font-family: ui-sans-serif, system-ui;">${text.replace(/\n/g, '<br>')}</div>`,
            }
          : undefined,
        push: meta.allowedChannels.includes('push')
          ? { title: meta.label, body: text.slice(0, 240) }
          : undefined,
        bypassQuietHours: !!meta.critical,
      });

      // Stamp last-fired so we don't double-fire this minute.
      await sb
        .from('user_notification_schedules')
        .update({
          last_fired_at: new Date().toISOString(),
          last_fired_status: result.delivered.length > 0 ? 'delivered' : 'no_channel',
          last_fired_dedup_key: dedupKey,
        })
        .eq('id', row.id);

      fired += 1;
    } catch (err) {
      errors.push({
        id: row.id,
        reason: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    evaluated: (schedules ?? []).length,
    fired,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    ranAt: now.toISOString(),
  });
}
