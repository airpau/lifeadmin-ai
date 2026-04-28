/**
 * GET /api/cron/case-law-monitor
 *
 * Weekly Perplexity scan dedicated to UK consumer-rights CASE LAW —
 * Court of Appeal / Supreme Court rulings, FOS final decisions on
 * systemic issues, and tribunal decisions that change how an existing
 * statute should be interpreted in customer-facing replies.
 *
 * Why separate from consumer-law-news: that cron is broader (CMA fines,
 * regulator press releases, parliamentary bills). Case law is a narrow
 * but very-high-signal stream — a single Court of Appeal ruling can
 * flip how the engine should ground a sector for years (Wakefield v
 * Loganair on UK261 extraordinary circumstances; recent FOS systemic
 * findings on motor-finance commissions). Worth its own dedicated
 * Perplexity prompt + storage row + B2B webhook fan-out.
 *
 * Schedule: Tuesdays 06:00 UTC (offset from consumer-law-news daily
 * runs so we don't double-burn Perplexity quota).
 *
 * Output:
 *   - Stores material rulings in consumer_law_updates with source='court'
 *   - For high-importance hits, fires statute.updated webhook to B2B
 *     subscribers (the index they ground in just gained interpretive
 *     authority — they need to know)
 *   - Telegram digest to founder
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 90;
export const dynamic = 'force-dynamic';

interface CaseLawItem {
  case_name: string;
  citation: string;
  court: string;
  decided_on?: string;
  affected_statute: string;
  affected_categories: string[];
  why_it_matters: string;
  source_url?: string;
  importance: 'high' | 'medium' | 'low';
}

const PROMPT = `You are a UK consumer-protection legal analyst. List up to 5 UK case-law decisions, FOS final decisions on systemic issues, or appellate rulings published in the LAST 7 DAYS that change how an existing UK consumer-protection statute should be interpreted when responding to a consumer dispute.

Prioritise:
- Court of Appeal, Supreme Court, High Court rulings
- Financial Ombudsman Service final decisions where the FOS sets a systemic precedent (e.g. multi-firm motor-finance commission, recurring complaint pattern)
- Upper Tribunal decisions on tax / employment-rights / housing-tribunal matters that affect consumer-facing claims
- Permission decisions that materially change the litigation landscape

Bias toward decisions that affect: Section 75 CCA 1974, Consumer Rights Act 2015, UK261, Ofgem licence conditions, Ofcom General Conditions, FCA Consumer Duty, Limitation Act, Tenant Fees Act.

For each item return JSON object with these fields:
- case_name (string, e.g. "Smith v Acme Ltd")
- citation (string, e.g. "[2026] EWCA Civ 412")
- court (string, e.g. "Court of Appeal", "Financial Ombudsman Service", "High Court")
- decided_on (ISO yyyy-mm-dd if known, else null)
- affected_statute (string, e.g. "Consumer Credit Act 1974, s.75")
- affected_categories (array of: energy, broadband, finance, travel, rail, insurance, council_tax, parking, hmrc, dvla, nhs, gym, debt, general)
- why_it_matters (2 sentences explaining what shifted in the law)
- source_url (string URL to BAILII / FOS decision database / official transcript)
- importance: 'high' if national systemic effect, 'medium' if sector-changing, 'low' otherwise

Return ONLY a JSON array, no preamble. Empty array if no qualifying rulings this week.`;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function fetchCaseLaw(): Promise<CaseLawItem[]> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITY_API_KEY not set');

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: PROMPT }],
      return_citations: true,
    }),
  });
  if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]) as CaseLawItem[];
  return parsed.filter((c) =>
    typeof c?.case_name === 'string' &&
    typeof c?.affected_statute === 'string' &&
    Array.isArray(c?.affected_categories),
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const sb = admin();
  let items: CaseLawItem[] = [];
  try {
    items = await fetchCaseLaw();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[case-law-monitor]', msg);
    await sb.from('business_log').insert({
      category: 'case_law_monitor',
      title: 'Perplexity case-law fetch failed',
      content: msg,
      created_by: 'case-law-monitor-cron',
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (items.length === 0) {
    await sb.from('business_log').insert({
      category: 'case_law_monitor',
      title: 'Weekly case-law scan: no qualifying rulings',
      content: 'No Court of Appeal / Supreme Court / FOS systemic decisions reported this week.',
      created_by: 'case-law-monitor-cron',
    });
    return NextResponse.json({ ok: true, count: 0 });
  }

  // Persist into consumer_law_updates (same table the broader news
  // cron uses) with source='court' so the dashboard / future
  // founder review pulls them out distinctly.
  for (const item of items) {
    try {
      await sb.from('consumer_law_updates').insert({
        headline: `${item.case_name} ${item.citation}`,
        summary: item.why_it_matters,
        source: 'court',
        source_url: item.source_url ?? null,
        effective_date: item.decided_on ?? null,
        importance: item.importance,
        affects_categories: item.affected_categories,
        metadata: {
          court: item.court,
          affected_statute: item.affected_statute,
          ingested_by: 'case-law-monitor',
        },
      });
    } catch (e) {
      console.warn('[case-law-monitor] insert failed', e instanceof Error ? e.message : e);
    }

    // High-importance rulings fire statute.updated to B2B subscribers
    // (with the change_summary explaining the new precedent). The
    // affected ref in legal_references doesn't change yet — that's
    // the founder's call after review. Subscribers get the heads-up.
    if (item.importance === 'high') {
      try {
        const { publishStatuteUpdated } = await import('@/lib/b2b/webhook-publisher');
        for (const cat of item.affected_categories) {
          await publishStatuteUpdated({
            category: cat,
            law_name: item.affected_statute,
            change_summary: `New case-law authority — ${item.case_name} ${item.citation} (${item.court}): ${item.why_it_matters}`,
            effective_date: item.decided_on ?? null,
            source_url: item.source_url ?? null,
          });
        }
      } catch (e) {
        console.warn('[case-law-monitor] webhook publish failed', e instanceof Error ? e.message : e);
      }
    }
  }

  await sb.from('business_log').insert({
    category: 'case_law_monitor',
    title: `Weekly case-law scan: ${items.length} ruling${items.length === 1 ? '' : 's'} ingested`,
    content: items.map((i) => `• ${i.case_name} ${i.citation} (${i.importance}) — ${i.affected_statute}`).join('\n'),
    created_by: 'case-law-monitor-cron',
  });

  // Telegram founder digest.
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
    if (token && chatId) {
      const lines = [
        `⚖️ *Weekly UK case-law scan* — ${items.length} ruling${items.length === 1 ? '' : 's'}`,
        '',
        ...items.map((i) =>
          `*${i.importance.toUpperCase()}* — ${i.case_name} ${i.citation}\n  ${i.court} on ${i.affected_statute}\n  ${i.why_it_matters}\n  ${i.source_url ?? ''}`,
        ),
      ];
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: lines.join('\n\n'), parse_mode: 'Markdown', disable_web_page_preview: true }),
      });
    }
  } catch (e) {
    console.warn('[case-law-monitor] Telegram failed', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, count: items.length });
}
