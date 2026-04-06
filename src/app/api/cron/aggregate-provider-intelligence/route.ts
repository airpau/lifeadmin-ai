import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const FOUNDER_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(Number)[0];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function sendTelegram(message: string) {
  if (!TELEGRAM_TOKEN || !FOUNDER_CHAT_ID) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: FOUNDER_CHAT_ID, text: message, parse_mode: 'Markdown' }),
    });
  } catch {
    // Non-critical
  }
}

/**
 * Use Claude to normalise a provider name to a canonical lowercase form.
 * e.g. "British Gas", "british gas energy", "BritishGas" all → "british gas"
 */
async function normaliseProviderName(raw: string): Promise<string> {
  if (!raw || raw.trim().length === 0) return 'unknown';

  // Fast path: already clean
  const cleaned = raw.trim().toLowerCase();

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{
        role: 'user',
        content: `Normalise this UK company name to a canonical lowercase form. Remove "Ltd", "Limited", "plc", "Group" suffixes. Return ONLY the normalised name, nothing else.\n\nInput: "${raw}"\n\nOutput:`,
      }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim().toLowerCase() : cleaned;
    return text || cleaned;
  } catch {
    return cleaned;
  }
}

/**
 * Compute median of an array of numbers.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Return the most-frequently occurring value in an array of strings.
 */
function mostCommon(values: string[]): string | null {
  if (values.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const v of values) {
    const k = v.trim().toLowerCase();
    freq[k] = (freq[k] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * POST /api/cron/aggregate-provider-intelligence
 * Weekly: aggregate anonymised contract_extractions data grouped by
 * (normalised_provider_name, contract_type). Only creates entries where
 * sample_size >= 3 (privacy threshold). Upserts into provider_intelligence.
 *
 * Schedule: Every Sunday at midnight — configured in vercel.json
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Fetch all contract extractions with enough data to aggregate
  const { data: extractions, error } = await supabase
    .from('contract_extractions')
    .select(
      'provider_name, contract_type, monthly_cost, annual_cost, notice_period, minimum_term, early_exit_fee, cancellation_fee, price_increase_clause, auto_renewal, unfair_clauses'
    )
    .not('provider_name', 'is', null)
    .not('contract_type', 'is', null);

  if (error || !extractions || extractions.length === 0) {
    return NextResponse.json({ ok: true, reason: 'No contract extractions to aggregate' });
  }

  // Group by raw provider_name + contract_type first
  const rawGroups = new Map<string, typeof extractions>();
  for (const ext of extractions) {
    const key = `${(ext.provider_name || '').toLowerCase().trim()}||${(ext.contract_type || '').toLowerCase().trim()}`;
    if (!rawGroups.has(key)) rawGroups.set(key, []);
    rawGroups.get(key)!.push(ext);
  }

  // Only process groups that meet the privacy threshold
  const eligibleGroups = [...rawGroups.entries()].filter(([, rows]) => rows.length >= 3);

  if (eligibleGroups.length === 0) {
    return NextResponse.json({ ok: true, reason: 'No groups meet the minimum sample size of 3' });
  }

  let upserted = 0;
  let skipped = 0;
  const summaryLines: string[] = [];

  for (const [key, rows] of eligibleGroups) {
    const [rawProvider, contractType] = key.split('||');
    const sampleSize = rows.length;

    // Normalise provider name using Claude (only for the canonical key, not every row)
    const normalisedName = await normaliseProviderName(rawProvider);

    // Aggregate costs
    const monthlyCosts = rows
      .map(r => parseFloat(String(r.monthly_cost)))
      .filter(n => !isNaN(n) && n > 0);
    const annualCosts = rows
      .map(r => parseFloat(String(r.annual_cost)))
      .filter(n => !isNaN(n) && n > 0);
    const avgMonthly = monthlyCosts.length > 0
      ? monthlyCosts.reduce((a, b) => a + b, 0) / monthlyCosts.length
      : null;
    const medianMonthly = median(monthlyCosts);

    // Notice period, minimum term, early exit fee — most common value
    const noticePeriods = rows.map(r => r.notice_period).filter(Boolean) as string[];
    const minimumTerms = rows.map(r => r.minimum_term).filter(Boolean) as string[];
    const earlyExitFees = rows.map(r => r.early_exit_fee || r.cancellation_fee).filter(Boolean) as string[];

    const commonNoticePeriod = mostCommon(noticePeriods);
    const commonMinimumTerm = mostCommon(minimumTerms);
    const commonEarlyExitFee = mostCommon(earlyExitFees);

    // Price increase clause: % of contracts that have one
    const withPriceIncrease = rows.filter(r => r.price_increase_clause && r.price_increase_clause.trim().length > 0).length;
    const priceIncreasePct = Math.round((withPriceIncrease / sampleSize) * 100);

    // Auto-renewal: % that mention auto-renewal
    const withAutoRenewal = rows.filter(r => r.auto_renewal && r.auto_renewal.trim().length > 0).length;
    const autoRenewalPct = Math.round((withAutoRenewal / sampleSize) * 100);

    // Unfair clauses: collect all, deduplicate by similarity, take most frequent
    const allUnfairClauses: string[] = rows
      .flatMap(r => Array.isArray(r.unfair_clauses) ? r.unfair_clauses : [])
      .filter(Boolean);

    // Count occurrence of each unique clause (simple string dedup)
    const clauseFreq: Record<string, number> = {};
    for (const clause of allUnfairClauses) {
      const k = clause.trim().toLowerCase().slice(0, 80);
      clauseFreq[k] = (clauseFreq[k] || 0) + 1;
    }
    const commonUnfairClauses = Object.entries(clauseFreq)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([clause]) => clause);

    // Upsert into provider_intelligence
    const { error: upsertError } = await supabase
      .from('provider_intelligence')
      .upsert({
        provider_name_normalised: normalisedName,
        contract_type: contractType,
        avg_monthly_cost: avgMonthly ? parseFloat(avgMonthly.toFixed(2)) : null,
        median_monthly_cost: medianMonthly ? parseFloat(medianMonthly.toFixed(2)) : null,
        common_notice_period: commonNoticePeriod,
        common_minimum_term: commonMinimumTerm,
        common_early_exit_fee: commonEarlyExitFee,
        has_price_increase_clause_pct: priceIncreasePct,
        common_unfair_clauses: commonUnfairClauses,
        auto_renewal_pct: autoRenewalPct,
        sample_size: sampleSize,
        last_aggregated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'provider_name_normalised,contract_type',
      });

    if (upsertError) {
      console.error(`Failed to upsert provider_intelligence for ${normalisedName}/${contractType}:`, upsertError);
      skipped++;
    } else {
      upserted++;
      summaryLines.push(`• *${normalisedName}* (${contractType}): ${sampleSize} contracts, avg £${avgMonthly?.toFixed(0) ?? '?'}/mo${priceIncreasePct > 50 ? ', price hike clause common' : ''}${commonUnfairClauses.length > 0 ? `, ${commonUnfairClauses.length} unfair clauses` : ''}`);
    }
  }

  // Send Telegram summary
  if (upserted > 0) {
    const msg = `*Provider Intelligence Updated*\n\n${upserted} provider/type combinations updated (${skipped} skipped).\n\n${summaryLines.slice(0, 10).join('\n')}${summaryLines.length > 10 ? `\n...and ${summaryLines.length - 10} more` : ''}`;
    await sendTelegram(msg);
  }

  console.log(`[aggregate-provider-intelligence] upserted=${upserted}, skipped=${skipped}`);
  return NextResponse.json({ ok: true, upserted, skipped });
}
