/**
 * GET /api/cron/consumer-law-news
 *
 * Weekly research-driven scan of UK consumer-law / regulatory news.
 * Asks the shared web-research client for the most material
 * developments in the last 7 days that affect typical UK consumer
 * bills — CMA fines, Ofcom / Ofgem rule changes, FCA enforcement,
 * Consumer Rights Act amendments, court rulings, parliamentary bills.
 *
 * All real-time web research goes through src/lib/research/web-research.ts
 * (Anthropic `web_search`). Never call a search provider directly from a
 * route, and never use Google / scraping / Bing.
 *
 * Output:
 *   - Stores top items in consumer_law_updates (audit + future
 *     dashboard surface)
 *   - Posts a consolidated Telegram digest to the founder admin
 *     chat for review
 *
 * Schedule (vercel.json): Mondays at 06:00 UTC.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { researchWeb, type ResearchCitation } from '@/lib/research/web-research';

export const runtime = 'nodejs';
export const maxDuration = 90;

interface LawUpdate {
  headline: string;
  summary: string;
  source: 'cma' | 'ofcom' | 'ofgem' | 'fca' | 'cra' | 'parliament' | 'court' | 'other';
  source_url?: string | null;
  effective_date?: string | null;
  importance: 'high' | 'medium' | 'low';
  affects_categories?: string[];
}

const PROMPT = `You are a UK consumer-protection news analyst. List the 5 most material developments in UK consumer law, financial regulation or bill-relevant regulator action from the last 7 days.

Bias toward changes that directly affect typical household bills (energy, broadband, mobile, insurance, banking, mortgages, council tax, water) or that grant consumers a new right / refund opportunity.

For each item return JSON object with these fields:
- headline (string, max 120 chars)
- summary (string, exactly 2 sentences explaining what changed and why a UK consumer should care)
- source: one of 'cma' | 'ofcom' | 'ofgem' | 'fca' | 'cra' | 'parliament' | 'court' | 'other'
- source_url (string URL of primary source)
- effective_date (ISO yyyy-mm-dd if applicable, else null)
- importance: 'high' if affects most households or grants new rights, 'medium' if affects a sector, 'low' otherwise
- affects_categories: array of bill categories from {energy, broadband, mobile, insurance, banking, mortgages, council_tax, water, transport, housing}

Return ONLY a JSON array of 5 objects, no preamble, no trailing prose.`;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function fetchUpdates(): Promise<{ items: LawUpdate[]; citations: ResearchCitation[] | null }> {
  const res = await researchWeb<LawUpdate[]>({
    prompt: PROMPT,
    parse: 'json_array',
    maxTokens: 2000,
    // These rows are persisted as fact and surfaced to the founder, so
    // an ungrounded (parametric-memory) answer must fail the run rather
    // than be written to consumer_law_updates. The throw lands in the
    // existing catch below, which already returns 500.
    requireGrounding: true,
    endpoint: '/api/cron/consumer-law-news',
  });

  if (!res.parsed) {
    throw new Error('Research response had no JSON array');
  }

  // Validate shape so we don't insert garbage. Drop anything that
  // doesn't have at minimum headline + summary + source.
  const items = res.parsed.filter(
    (u) => typeof u?.headline === 'string' && typeof u?.summary === 'string' && typeof u?.source === 'string',
  );

  // Citations the model actually cited, normalised to { url, title? }.
  // `citations` (not `sources`) because the column is an audit/display
  // surface — `sources` includes every page retrieved and discarded.
  return { items, citations: res.citations.length ? res.citations : null };
}

async function sendFounderTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(chatId),
        text: text.slice(0, 3800),
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error('[consumer-law-news] founder telegram send failed', e);
  }
}

function buildDigest(items: LawUpdate[]): string {
  if (items.length === 0) return '';
  const lines: string[] = [];
  lines.push('📜 *UK consumer-law roundup — last 7 days*');
  lines.push('');
  for (const u of items) {
    const sourceLabel = u.source.toUpperCase();
    const importanceEmoji = u.importance === 'high' ? '🔴' : u.importance === 'medium' ? '🟡' : '⚪';
    const cats = u.affects_categories?.length ? ` _(${u.affects_categories.join(', ')})_` : '';
    lines.push(`${importanceEmoji} *${u.headline}* (${sourceLabel})${cats}`);
    lines.push(`  ${u.summary}`);
    if (u.source_url) lines.push(`  [Source](${u.source_url})`);
    if (u.effective_date) lines.push(`  _Effective: ${u.effective_date}_`);
    lines.push('');
  }
  lines.push('_paybacker.co.uk · consumer-law cron_');
  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let items: LawUpdate[];
  let citations: ResearchCitation[] | null;
  try {
    ({ items, citations } = await fetchUpdates());
  } catch (e: any) {
    console.error('[consumer-law-news] research fetch failed', e?.message);
    return NextResponse.json({ error: e?.message ?? 'fetch failed' }, { status: 500 });
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true, items: 0, message: 'No updates returned by research' });
  }

  const supabase = getAdmin();
  const scanned_at = new Date().toISOString();

  const rows = items.map((u) => ({
    scanned_at,
    headline: u.headline.slice(0, 200),
    summary: u.summary,
    source: u.source,
    source_url: u.source_url ?? null,
    effective_date: u.effective_date ?? null,
    importance: u.importance ?? 'medium',
    affects_categories: u.affects_categories ?? [],
    citations,
  }));

  const { error: insertErr } = await supabase.from('consumer_law_updates').insert(rows);
  if (insertErr) {
    console.error('[consumer-law-news] insert failed', insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Push high+medium importance to founder Telegram. Low-importance
  // items are archived in the table for the dashboard view but not
  // worth pinging the founder over.
  const surfaceable = items.filter((u) => u.importance !== 'low');
  if (surfaceable.length > 0) {
    await sendFounderTelegram(buildDigest(surfaceable));
  }

  return NextResponse.json({
    ok: true,
    inserted: rows.length,
    surfaced_to_telegram: surfaceable.length,
  });
}
