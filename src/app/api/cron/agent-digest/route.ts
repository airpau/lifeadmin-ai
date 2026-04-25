/**
 * Agent Digest Cron
 *
 * Builds a 3-times-a-day Telegram summary of managed-agent activity for the founder.
 * Reads:
 *   - business_log entries since the previous digest slot
 *   - executive_reports (managed-agent runs) in the same window
 *   - shared-context handoff-notes.md (assembled by digest-compiler agent)
 *   - the current task-queue.md "Bug queue" + "Support priorities" sections
 *
 * Sends one consolidated Telegram message to TELEGRAM_FOUNDER_CHAT_ID.
 *
 * Schedule (UTC): 07:00 morning, 12:30 midday, 19:00 evening.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Slot = 'morning' | 'midday' | 'evening';

interface DigestPayload {
  slot: Slot;
  windowStart: string;
  windowEnd: string;
  businessLogRows: Array<{
    category?: string;
    title?: string;
    content?: string;
    created_at?: string;
    created_by?: string;
  }>;
  executiveReportRows: Array<{ agent_name?: string; summary?: string; created_at?: string }>;
  handoffNotes: string | null;
}

// Categories the digest treats as severity-elevated. Agents emit these via the
// append_business_log MCP tool. Anything not in this set is treated as 'info'.
const ESCALATED_CATEGORIES = new Set([
  'alert',
  'critical',
  'warn',
  'finding',
  'recommendation',
  'escalation',
  'agent_governance',
]);

function detectSlot(date: Date): Slot {
  const h = date.getUTCHours();
  if (h < 11) return 'morning';
  if (h < 17) return 'midday';
  return 'evening';
}

function windowStartFor(slot: Slot, now: Date): Date {
  const d = new Date(now);
  if (slot === 'morning') {
    // since previous evening digest at 19:00 UTC yesterday
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(19, 0, 0, 0);
  } else if (slot === 'midday') {
    d.setUTCHours(7, 0, 0, 0);
  } else {
    d.setUTCHours(12, 30, 0, 0);
  }
  return d;
}

function categoryEmoji(cat: string | undefined): string {
  switch (cat) {
    case 'critical':
    case 'alert':
      return '🔴';
    case 'warn':
      return '🟠';
    case 'recommendation':
    case 'escalation':
      return '🟡';
    case 'finding':
    case 'agent_governance':
      return '🔵';
    default:
      return '🟢';
  }
}

async function gatherDigest(slot: Slot): Promise<DigestPayload> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const now = new Date();
  const start = windowStartFor(slot, now);

  const supa = createClient(url, key);

  const [logRes, reportRes] = await Promise.all([
    supa
      .from('business_log')
      .select('category, title, content, created_at, created_by')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })
      .limit(60),
    supa
      .from('executive_reports')
      .select('agent_name, summary, created_at')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Best-effort fetch handoff-notes from shared-context (file is on Paul's machine; in the
  // Vercel runtime it's not available, so we just skip it there and rely on business_log).
  // The digest-compiler agent always also writes a one-line summary to business_log so the
  // digest still has signal even without file access.
  return {
    slot,
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
    businessLogRows: logRes.data ?? [],
    executiveReportRows: reportRes.data ?? [],
    handoffNotes: null,
  };
}

function buildMessage(payload: DigestPayload): string {
  const slotLabels: Record<Slot, string> = {
    morning: '🌅 Morning',
    midday: '☀️ Midday',
    evening: '🌙 Evening',
  };

  const totalRuns = payload.executiveReportRows.length;
  const findings = payload.businessLogRows.filter(
    (r) => r.category && ESCALATED_CATEGORIES.has(r.category),
  );
  const decisions = findings.filter(
    (r) => r.category === 'recommendation' || r.category === 'critical' || r.category === 'escalation',
  );

  const lines: string[] = [];
  lines.push(`*${slotLabels[payload.slot]} digest — ${new Date().toUTCString().slice(0, 22)}*`);
  lines.push(`Window: ${payload.windowStart.slice(11, 16)} → now`);
  lines.push(`Agent runs: ${totalRuns} · Findings: ${findings.length}`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('🟢 All clean. No findings or recommendations since the last digest.');
  } else {
    lines.push('*Findings*');
    for (const r of findings.slice(0, 10)) {
      const e = categoryEmoji(r.category);
      const who = r.created_by ? `[${r.created_by}] ` : '';
      const headline = (r.title ?? '(no title)').slice(0, 100);
      const detail = (r.content ?? '').slice(0, 160);
      lines.push(`${e} ${who}*${headline}*${detail ? ` — ${detail}` : ''}`);
    }
  }

  if (decisions.length > 0) {
    lines.push('');
    lines.push('*Needs your decision*');
    for (const r of decisions.slice(0, 6)) {
      const headline = (r.title ?? '').slice(0, 100);
      const detail = (r.content ?? '').slice(0, 140);
      lines.push(`• *${headline}*${detail ? ` — ${detail}` : ''}`);
    }
  }

  if (payload.slot === 'morning' && totalRuns > 0) {
    const recentAgents = Array.from(
      new Set(payload.executiveReportRows.map((r) => r.agent_name).filter(Boolean) as string[]),
    );
    if (recentAgents.length > 0) {
      lines.push('');
      lines.push(`*Active overnight:* ${recentAgents.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('_paybacker.co.uk · digest cron_');

  return lines.join('\n');
}

async function sendTelegram(text: string): Promise<{ ok: boolean; detail?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, detail: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_FOUNDER_CHAT_ID' };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: Number(chatId),
      text: text.slice(0, 3800),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, detail: JSON.stringify(err) };
  }
  return { ok: true };
}

async function handleDigest(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const explicitSlot = searchParams.get('slot') as Slot | null;
  const slot: Slot = explicitSlot ?? detectSlot(new Date());

  try {
    const payload = await gatherDigest(slot);
    const message = buildMessage(payload);
    const sent = await sendTelegram(message);

    return NextResponse.json({
      ok: sent.ok,
      slot,
      runs: payload.executiveReportRows.length,
      findings: payload.businessLogRows.length,
      sent_detail: sent.detail,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleDigest(req);
}

export async function POST(req: NextRequest) {
  return handleDigest(req);
}
