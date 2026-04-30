#!/usr/bin/env npx tsx
/**
 * scripts/recover-url-dead.ts
 *
 * One-shot helper that scans `legal_references` for `verification_status='url_dead'`,
 * spot-checks every URL with a real-browser User-Agent (some publishers — notably
 * ofcom.org.uk and orr.gov.uk — return 403 to default fetchers but 200 to a normal
 * browser UA), and writes a structured per-row report.
 *
 * IT DOES NOT MUTATE THE DATABASE. It only proposes corrections that the founder
 * can review and apply through the existing /dashboard/admin/legal-refs UI.
 *
 * Output:
 *   - stdout markdown table (count of url_dead rows, status verdict per row,
 *     suggested action: keep_dead / live_with_browser_ua / candidate_redirect)
 *   - optional --queue flag: when present, INSERTs a propose-only row into
 *     `legal_ref_corrections` with status='pending' for any row whose URL came
 *     back live with a browser UA (so a single founder approval can mark it
 *     active again). Default: dry-run only.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/recover-url-dead.ts [--queue]
 *
 * NOT auto-run. Manual founder utility.
 */

import { createClient } from '@supabase/supabase-js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface Row {
  id: string;
  law_name: string;
  source_url: string;
  category: string;
  verification_status: string;
  last_verified: string | null;
}

interface Verdict {
  id: string;
  law_name: string;
  source_url: string;
  status_default: number | 'fetch_error';
  status_browser_ua: number | 'fetch_error';
  final_url_browser_ua: string | null;
  action: 'keep_dead' | 'live_with_browser_ua' | 'candidate_redirect';
  notes: string;
}

function getEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function probe(url: string, ua: string | null): Promise<{
  status: number | 'fetch_error';
  final_url: string | null;
}> {
  const headers: Record<string, string> = ua ? { 'User-Agent': ua } : {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { status: res.status, final_url: res.url };
  } catch {
    return { status: 'fetch_error', final_url: null };
  }
}

async function main(): Promise<void> {
  const queue = process.argv.includes('--queue');

  const url = getEnv('SUPABASE_URL', getEnv('NEXT_PUBLIC_SUPABASE_URL', ''));
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('legal_references')
    .select('id, law_name, source_url, category, verification_status, last_verified')
    .eq('verification_status', 'url_dead')
    .order('category', { ascending: true });

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    console.log('No url_dead rows. Nothing to recover.');
    return;
  }

  console.log(`Probing ${rows.length} url_dead rows…`);
  const verdicts: Verdict[] = [];

  for (const row of rows) {
    // Sequential to avoid hammering remote hosts.
    // eslint-disable-next-line no-await-in-loop
    const def = await probe(row.source_url, null);
    // eslint-disable-next-line no-await-in-loop
    const ua = await probe(row.source_url, BROWSER_UA);

    let action: Verdict['action'] = 'keep_dead';
    let notes = '';

    if (typeof ua.status === 'number' && ua.status >= 200 && ua.status < 300) {
      if (ua.final_url && ua.final_url !== row.source_url) {
        action = 'candidate_redirect';
        notes = `redirected ${row.source_url} → ${ua.final_url}`;
      } else {
        action = 'live_with_browser_ua';
        notes = `live with browser UA (default UA returned ${def.status})`;
      }
    } else if (typeof ua.status === 'number' && ua.status >= 300 && ua.status < 400 && ua.final_url) {
      action = 'candidate_redirect';
      notes = `redirected ${row.source_url} → ${ua.final_url}`;
    } else {
      action = 'keep_dead';
      notes = `default=${def.status} browser-ua=${ua.status}`;
    }

    verdicts.push({
      id: row.id,
      law_name: row.law_name,
      source_url: row.source_url,
      status_default: def.status,
      status_browser_ua: ua.status,
      final_url_browser_ua: ua.final_url,
      action,
      notes,
    });

    // Polite throttle — the dead URLs are a mix of regulators that
    // sometimes rate-limit aggressive scanning.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 400));
  }

  // Markdown report.
  console.log('');
  console.log('| # | Category | Law | Action | Default | Browser UA | Notes |');
  console.log('|---|---|---|---|---|---|---|');
  verdicts.forEach((v, i) => {
    console.log(
      `| ${i + 1} | ${rows[i].category} | ${v.law_name} | ${v.action} | ${v.status_default} | ${v.status_browser_ua} | ${v.notes.replace(/\|/g, '/')} |`,
    );
  });

  const recoverable = verdicts.filter(
    (v) => v.action === 'live_with_browser_ua' || v.action === 'candidate_redirect',
  );
  console.log('');
  console.log(
    `Summary: ${verdicts.length} probed, ${recoverable.length} potentially recoverable (live_with_browser_ua + candidate_redirect), ${verdicts.length - recoverable.length} keep_dead.`,
  );

  if (!queue) {
    console.log('');
    console.log('Dry run. Pass --queue to insert pending rows in legal_ref_corrections.');
    return;
  }

  // Optional: queue propose-only corrections for founder approval.
  let queued = 0;
  for (const v of recoverable) {
    const proposed_source_url = v.final_url_browser_ua ?? v.source_url;
    // eslint-disable-next-line no-await-in-loop
    const { error: insErr } = await supabase.from('legal_ref_corrections').insert({
      ref_id: v.id,
      proposer: 'recover-url-dead-script',
      before_law_name: v.law_name,
      before_source_url: v.source_url,
      before_status: 'url_dead',
      proposed_law_name: null,
      proposed_source_url:
        proposed_source_url !== v.source_url ? proposed_source_url : null,
      proposed_status: 'verified',
      reasoning: `Recovery script: ${v.notes}`,
      confidence: v.action === 'candidate_redirect' ? 'medium' : 'high',
      status: 'pending',
    });
    if (!insErr) queued++;
  }
  console.log(`Queued ${queued} pending corrections in legal_ref_corrections.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
