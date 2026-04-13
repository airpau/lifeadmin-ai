import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Key consumer protection statutes on legislation.gov.uk
const KEY_STATUTES = [
  { name: 'Consumer Rights Act 2015', path: 'ukpga/2015/15' },
  { name: 'Consumer Contracts Regulations 2013', path: 'uksi/2013/3134' },
  { name: 'Financial Services and Markets Act 2000', path: 'ukpga/2000/8' },
  { name: 'Communications Act 2003', path: 'ukpga/2003/21' },
  { name: 'Equality Act 2010', path: 'ukpga/2010/15' },
  { name: 'Data Protection Act 2018', path: 'ukpga/2018/12' },
  { name: 'Consumer Credit Act 1974', path: 'ukpga/1974/39' },
  { name: 'Energy Act 2023', path: 'ukpga/2023/52' },
  { name: 'Electricity Act 1989', path: 'ukpga/1989/29' },
  { name: 'Gas Act 1986', path: 'ukpga/1986/44' },
];

// Regulator news/guidance pages to scan for recent changes
const REGULATOR_SOURCES = [
  {
    name: 'Ofgem',
    category: 'energy',
    newsUrl: 'https://www.ofgem.gov.uk/check-if-energy-price-cap-affects-you',
    guidanceUrl: 'https://www.ofgem.gov.uk/information-for-household-consumers/your-energy-supply',
  },
  {
    name: 'Ofcom',
    category: 'broadband',
    newsUrl: 'https://www.ofcom.org.uk/phones-and-broadband/tips-for-choosing/changing-provider',
    guidanceUrl: 'https://www.ofcom.org.uk/phones-and-broadband/tips-for-choosing/mobile-complaints',
  },
  {
    name: 'FCA',
    category: 'finance',
    newsUrl: 'https://www.fca.org.uk/consumers/consumer-credit',
    guidanceUrl: 'https://www.fca.org.uk/consumers/making-claim',
  },
  {
    name: 'Citizens Advice',
    category: 'general',
    newsUrl: 'https://www.citizensadvice.org.uk/consumer/somethings-gone-wrong-with-a-purchase/making-a-complaint/',
    guidanceUrl: 'https://www.citizensadvice.org.uk/debt-and-money/',
  },
];

// Search legislation.gov.uk for recently enacted consumer protection legislation
const NEW_LEGISLATION_FEED = 'https://www.legislation.gov.uk/new-enacted.atom';

interface LegalRef {
  id: string;
  law_name: string;
  section: string | null;
  summary: string;
  source_url: string;
  source_type: string;
  category: string;
  content_hash: string | null;
}

interface Change {
  statuteName?: string;
  statutePath?: string;
  regulatorName?: string;
  sourceUrl: string;
  summary: string;
  rawContent?: string;
}

/**
 * Weekly legal intelligence scan.
 * Schedule: Mondays at 6am — configured in vercel.json
 *
 * 1. Fetches legislation.gov.uk XML for key consumer protection statutes
 * 2. Fetches regulator guidance pages and checks for updates
 * 3. Scans new-enacted feed for relevant new legislation
 * 4. Claude analyses each change, determines affected refs, drafts updates
 * 5. High-confidence → auto-apply; medium/low → queue for review
 * 6. Sends Telegram summary to founder
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.MANAGED_AGENTS_ENABLED !== 'true') {
    console.log('[legal-updates] Managed agents disabled (MANAGED_AGENTS_ENABLED != true)');
    return NextResponse.json({ ok: true, message: 'Managed agents disabled' });
  }

  const supabase = getAdmin();

  const { data: allRefs } = await supabase
    .from('legal_references')
    .select('id, law_name, section, summary, source_url, source_type, category, content_hash')
    .in('verification_status', ['current', 'updated']);

  const refs: LegalRef[] = allRefs || [];

  const summary = {
    statutesChecked: 0,
    regulatorsChecked: 0,
    newLegislationFound: 0,
    changesDetected: 0,
    autoApplied: 0,
    queued: 0,
    errors: 0,
  };

  const detectedChanges: Array<{ law: string; change: string; confidence: string; action: string }> = [];

  // ── 1. Scan key statutes on legislation.gov.uk ──────────────────────────────
  for (const statute of KEY_STATUTES) {
    try {
      const xmlUrl = `https://www.legislation.gov.uk/${statute.path}/data.xml`;
      const res = await fetch(xmlUrl, {
        headers: {
          'User-Agent': 'Paybacker-LegalMonitor/1.0 (hello@paybacker.co.uk)',
          Accept: 'application/xml',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        summary.errors++;
        continue;
      }

      const xml = await res.text();
      summary.statutesChecked++;

      // Look for recently dated amendment effects in the XML
      const effectMatches = xml.match(/<ukm:Effect[^>]*>/g) || [];
      const recentEffects = effectMatches.filter(e => {
        // Check if effect was applied in the last 90 days
        const dateMatch = e.match(/Applied="(\d{4}-\d{2}-\d{2})"/);
        if (!dateMatch) return false;
        const effectDate = new Date(dateMatch[1]);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        return effectDate > cutoff;
      });

      const hasUnapplied = xml.includes('<ukm:UnappliedEffects>') && xml.includes('<ukm:Effect');
      const possiblyRepealed =
        xml.includes('repealed') || xml.includes('revoked');

      if (recentEffects.length > 0 || hasUnapplied || possiblyRepealed) {
        // Find our stored refs for this statute
        const affectedRefs = refs.filter(r =>
          r.law_name.toLowerCase().includes(statute.name.toLowerCase().split(' ').slice(0, 3).join(' ').toLowerCase())
        );

        const changeContext = [
          recentEffects.length > 0 && `${recentEffects.length} amendment(s) applied in the last 90 days`,
          hasUnapplied && 'pending unapplied amendments',
          possiblyRepealed && 'possible repeal or revocation detected',
        ]
          .filter(Boolean)
          .join('; ');

        const change: Change = {
          statuteName: statute.name,
          statutePath: statute.path,
          sourceUrl: `https://www.legislation.gov.uk/${statute.path}`,
          summary: changeContext,
          rawContent: xml.slice(0, 8000),
        };

        await processStatuteChange(supabase, change, affectedRefs, summary, detectedChanges);
      }
    } catch (err) {
      console.error(`[legal-updates] Error checking ${statute.name}:`, err);
      summary.errors++;
    }

    await delay(300);
  }

  // ── 2. Scan regulator guidance pages ────────────────────────────────────────
  for (const source of REGULATOR_SOURCES) {
    try {
      const pageContent = await fetchPageText(source.newsUrl);
      if (!pageContent) {
        summary.errors++;
        continue;
      }
      summary.regulatorsChecked++;

      const affectedRefs = refs.filter(r => r.category === source.category || r.category === 'general');

      await processRegulatorPage(
        supabase,
        source.name,
        source.newsUrl,
        pageContent,
        affectedRefs,
        summary,
        detectedChanges
      );
    } catch (err) {
      console.error(`[legal-updates] Error scanning ${source.name}:`, err);
      summary.errors++;
    }

    await delay(500);
  }

  // ── 3. Scan new-enacted feed for relevant legislation ───────────────────────
  try {
    const feedRes = await fetch(NEW_LEGISLATION_FEED, {
      headers: { 'User-Agent': 'Paybacker-LegalMonitor/1.0 (hello@paybacker.co.uk)' },
      signal: AbortSignal.timeout(10000),
    });

    if (feedRes.ok) {
      const feedXml = await feedRes.text();
      // Extract entry titles and links from ATOM feed
      const entries: Array<{ title: string; link: string; summary: string }> = [];
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(feedXml)) !== null && entries.length < 20) {
        const entryXml = match[1];
        const titleMatch = entryXml.match(/<title[^>]*>([^<]+)<\/title>/);
        const linkMatch = entryXml.match(/<link[^>]*href="([^"]+)"/);
        const summaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
        if (titleMatch && linkMatch) {
          entries.push({
            title: titleMatch[1].trim(),
            link: linkMatch[1].trim(),
            summary: summaryMatch ? summaryMatch[1].replace(/<[^>]+>/g, '').trim() : '',
          });
        }
      }

      // Ask Claude if any new legislation is consumer-protection relevant
      if (entries.length > 0) {
        const newLegResult = await scanNewLegislation(supabase, entries, refs, summary, detectedChanges);
        summary.newLegislationFound = newLegResult;
      }
    }
  } catch (err) {
    console.error('[legal-updates] Error fetching new-enacted feed:', err);
    summary.errors++;
  }

  // ── 4. Log to business_log ───────────────────────────────────────────────────
  const logEntry = {
    category: 'legal_intelligence',
    action: 'weekly_scan',
    details: {
      summary: `Weekly legal scan: ${summary.changesDetected} changes detected (${summary.autoApplied} auto-applied, ${summary.queued} queued for review)`,
      ...summary,
      changes: detectedChanges,
    },
  };

  await supabase.from('business_log').insert(logEntry);

  // ── 5. Telegram alert ────────────────────────────────────────────────────────
  if (summary.changesDetected > 0 || summary.errors > 0) {
    const telegramMsg = buildTelegramMessage(summary, detectedChanges);
    await sendTelegram(telegramMsg);
  }

  console.log('[legal-updates] Scan complete:', summary);
  return NextResponse.json({ ok: true, ...summary, changes: detectedChanges });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function processStatuteChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  change: Change,
  affectedRefs: LegalRef[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any,
  detectedChanges: Array<{ law: string; change: string; confidence: string; action: string }>
) {
  try {
    const refsContext =
      affectedRefs.length > 0
        ? affectedRefs
            .map(r => `ID: ${r.id}\nLaw: ${r.law_name}${r.section ? `, ${r.section}` : ''}\nSummary: ${r.summary}`)
            .join('\n\n')
        : 'No matching stored references found.';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a UK consumer law analyst monitoring legislative changes for Paybacker, a UK consumer rights platform.

DETECTED CHANGE IN: ${change.statuteName}
Change summary: ${change.summary}
Source: ${change.sourceUrl}

XML EXCERPT (first 6000 chars):
${change.rawContent?.slice(0, 6000) || 'Not available'}

OUR STORED REFERENCES FOR THIS STATUTE:
${refsContext}

Your tasks:
1. Assess whether this change materially affects how consumers can exercise their rights
2. For each stored reference affected, draft a proposed updated summary
3. Assign a confidence score: "high" (clear wording change or repeal), "medium" (possibly affects interpretation), "low" (unclear / unlikely to matter)
4. If there are no material changes for consumers, say so

Return ONLY valid JSON:
{
  "material_change": boolean,
  "change_explanation": "brief plain-English explanation",
  "affected_refs": [
    {
      "ref_id": "uuid",
      "current_summary": "...",
      "proposed_summary": "...",
      "confidence": "high|medium|low",
      "reason": "why this ref needs updating"
    }
  ],
  "new_legislation_notes": "if this introduces NEW rights not yet in our database, describe them here, or empty string"
}`,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);
    if (!result.material_change) return;

    summary.changesDetected++;

    for (const affected of result.affected_refs || []) {
      const ref = affectedRefs.find(r => r.id === affected.ref_id);
      if (!ref) continue;

      if (affected.confidence === 'high') {
        // Auto-apply
        await supabase
          .from('legal_references')
          .update({
            summary: affected.proposed_summary,
            verification_status: 'updated',
            last_changed: new Date().toISOString(),
            verification_notes: `Auto-applied by weekly legal scan on ${new Date().toISOString()}. ${result.change_explanation}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'content_update',
          source_url: change.sourceUrl,
          detected_change_summary: result.change_explanation,
          proposed_update: affected.proposed_summary,
          confidence: 'high',
          status: 'auto_applied',
          reviewed_at: new Date().toISOString(),
        });

        await supabase.from('legal_audit_log').insert({
          legal_reference_id: ref.id,
          check_type: 'weekly_scan',
          result: 'updated',
          details: `Auto-applied: ${result.change_explanation}`,
        });

        summary.autoApplied++;
        detectedChanges.push({
          law: `${ref.law_name}${ref.section ? ` ${ref.section}` : ''}`,
          change: result.change_explanation,
          confidence: 'high',
          action: 'auto_applied',
        });
      } else {
        // Queue for review
        await supabase.from('legal_update_queue').insert({
          legal_reference_id: ref.id,
          change_type: 'content_update',
          source_url: change.sourceUrl,
          detected_change_summary: result.change_explanation,
          proposed_update: affected.proposed_summary,
          confidence: affected.confidence,
          status: 'pending',
        });

        await supabase.from('legal_audit_log').insert({
          legal_reference_id: ref.id,
          check_type: 'weekly_scan',
          result: 'queued',
          details: `Queued for review (${affected.confidence} confidence): ${result.change_explanation}`,
        });

        summary.queued++;
        detectedChanges.push({
          law: `${ref.law_name}${ref.section ? ` ${ref.section}` : ''}`,
          change: result.change_explanation,
          confidence: affected.confidence,
          action: 'queued',
        });
      }
    }

    // If new consumer rights discovered not yet in DB, queue as new_legislation
    if (result.new_legislation_notes && result.new_legislation_notes.length > 20) {
      await supabase.from('legal_update_queue').insert({
        legal_reference_id: null,
        change_type: 'new_legislation',
        source_url: change.sourceUrl,
        detected_change_summary: `New rights detected in ${change.statuteName}: ${result.new_legislation_notes}`,
        proposed_update: result.new_legislation_notes,
        confidence: 'medium',
        status: 'pending',
      });
      summary.queued++;
    }
  } catch (err) {
    console.error('[legal-updates] Claude error (statute):', err);
    summary.errors++;
  }
}

async function processRegulatorPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  regulatorName: string,
  sourceUrl: string,
  pageContent: string,
  affectedRefs: LegalRef[],
  summary: any,
  detectedChanges: Array<{ law: string; change: string; confidence: string; action: string }>
) {
  try {
    const refsContext = affectedRefs
      .slice(0, 15)
      .map(r => `ID: ${r.id}\nLaw: ${r.law_name}${r.section ? `, ${r.section}` : ''}\nSummary: ${r.summary}`)
      .join('\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are a UK consumer law analyst monitoring ${regulatorName} for Paybacker.

PAGE CONTENT FROM ${sourceUrl}:
${pageContent.slice(0, 5000)}

OUR STORED REFERENCES FOR THIS REGULATOR:
${refsContext}

Check whether the page content indicates:
1. Changed compensation amounts (e.g. auto-compensation rates, price cap figures)
2. New guidance or rules affecting consumer rights
3. Changed time limits or eligibility criteria
4. Any rights that no longer apply

Return ONLY valid JSON:
{
  "found_changes": boolean,
  "change_summary": "brief plain-English summary or empty string",
  "affected_refs": [
    {
      "ref_id": "uuid",
      "proposed_summary": "updated summary",
      "confidence": "high|medium|low",
      "reason": "specific change found"
    }
  ]
}

If you cannot identify specific material changes to any stored reference, set found_changes to false.`,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const result = JSON.parse(jsonMatch[0]);
    if (!result.found_changes || !result.affected_refs?.length) return;

    summary.changesDetected++;

    for (const affected of result.affected_refs) {
      const ref = affectedRefs.find(r => r.id === affected.ref_id);
      if (!ref) continue;

      const queueEntry = {
        legal_reference_id: ref.id,
        change_type: 'regulator_change' as const,
        source_url: sourceUrl,
        detected_change_summary: result.change_summary,
        proposed_update: affected.proposed_summary,
        confidence: affected.confidence as 'high' | 'medium' | 'low',
        status: affected.confidence === 'high' ? 'auto_applied' : 'pending',
      };

      await supabase.from('legal_update_queue').insert(queueEntry);

      if (affected.confidence === 'high') {
        await supabase
          .from('legal_references')
          .update({
            summary: affected.proposed_summary,
            verification_status: 'updated',
            last_changed: new Date().toISOString(),
            verification_notes: `Auto-applied by ${regulatorName} scan on ${new Date().toISOString()}. ${result.change_summary}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ref.id);

        summary.autoApplied++;
        detectedChanges.push({
          law: `${ref.law_name}${ref.section ? ` ${ref.section}` : ''}`,
          change: result.change_summary,
          confidence: 'high',
          action: 'auto_applied',
        });
      } else {
        await supabase.from('legal_audit_log').insert({
          legal_reference_id: ref.id,
          check_type: 'weekly_scan',
          result: 'queued',
          details: `${regulatorName} change queued (${affected.confidence}): ${result.change_summary}`,
        });

        summary.queued++;
        detectedChanges.push({
          law: `${ref.law_name}${ref.section ? ` ${ref.section}` : ''}`,
          change: result.change_summary,
          confidence: affected.confidence,
          action: 'queued',
        });
      }
    }
  } catch (err) {
    console.error(`[legal-updates] Claude error (${regulatorName}):`, err);
    summary.errors++;
  }
}

async function scanNewLegislation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entries: Array<{ title: string; link: string; summary: string }>,
  existingRefs: LegalRef[],
  summary: any,
  detectedChanges: Array<{ law: string; change: string; confidence: string; action: string }>
): Promise<number> {
  try {
    const entriesList = entries
      .map((e, i) => `${i + 1}. "${e.title}" — ${e.link}\n   ${e.summary}`)
      .join('\n');

    const existingLawNames = existingRefs.map(r => r.law_name).join(', ');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are a UK consumer law analyst. Review these recently enacted UK laws and identify any that affect consumer rights in these areas: energy bills, broadband/mobile contracts, financial services, travel, parking, debt, general consumer rights, GDPR/data protection.

RECENTLY ENACTED LEGISLATION:
${entriesList}

LAWS WE ALREADY TRACK: ${existingLawNames}

Identify legislation NOT already tracked that is relevant to consumer rights.

Return ONLY valid JSON:
{
  "relevant_new_laws": [
    {
      "title": "law title",
      "link": "legislation.gov.uk URL",
      "relevance": "how it affects consumer rights",
      "suggested_category": "energy|broadband|finance|travel|parking|debt|general"
    }
  ]
}

Return an empty array if nothing is relevant.`,
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return 0;

    const result = JSON.parse(jsonMatch[0]);
    const newLaws = result.relevant_new_laws || [];

    for (const law of newLaws) {
      await supabase.from('legal_update_queue').insert({
        legal_reference_id: null,
        change_type: 'new_legislation',
        source_url: law.link,
        detected_change_summary: `New legislation detected: ${law.title}. ${law.relevance}`,
        proposed_update: `Consider adding to ${law.suggested_category} category: ${law.title} — ${law.relevance}`,
        confidence: 'medium',
        status: 'pending',
      });

      summary.queued++;
      detectedChanges.push({
        law: law.title,
        change: law.relevance,
        confidence: 'medium',
        action: 'queued (new legislation)',
      });
    }

    return newLaws.length;
  } catch (err) {
    console.error('[legal-updates] Error scanning new legislation:', err);
    summary.errors++;
    return 0;
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Paybacker-LegalMonitor/1.0 (hello@paybacker.co.uk)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  } catch {
    return null;
  }
}

function buildTelegramMessage(
  summary: any,
  changes: Array<{ law: string; change: string; confidence: string; action: string }>
): string {
  const lines = [
    `*Weekly Legal Intelligence Scan*`,
    ``,
    `Statutes checked: ${summary.statutesChecked}`,
    `Regulators scanned: ${summary.regulatorsChecked}`,
    `Changes detected: *${summary.changesDetected}*`,
    `Auto-applied: ${summary.autoApplied}`,
    `Queued for review: ${summary.queued}`,
    summary.errors > 0 ? `Errors: ${summary.errors}` : null,
    ``,
  ].filter(l => l !== null);

  if (changes.length > 0) {
    lines.push(`*Changes:*`);
    for (const c of changes.slice(0, 8)) {
      const icon = c.confidence === 'high' ? '✅' : c.confidence === 'medium' ? '⚠️' : '🔍';
      lines.push(`${icon} ${c.law}: ${c.change.slice(0, 120)}`);
    }
    if (changes.length > 8) {
      lines.push(`...and ${changes.length - 8} more`);
    }
  }

  if (summary.queued > 0) {
    lines.push(``, `Review at: paybacker.co.uk/dashboard/admin/legal-updates`);
  }

  return lines.join('\n');
}

async function sendTelegram(text: string) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
    if (!botToken || !chatId) return;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[legal-updates] Telegram error:', err);
  }
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
