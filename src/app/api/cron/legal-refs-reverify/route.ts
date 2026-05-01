/**
 * GET /api/cron/legal-refs-reverify
 *
 * Weekly Sunday 04:00 UTC. Re-verifies every `legal_references` row
 * regardless of host, with deliberate priority for non-legislation.gov.uk
 * refs (those don't have the daily amendments cron — Perplexity is the
 * only freshness signal we have for them).
 *
 * For each ref it calls the existing `/api/admin/legal-refs/verify`
 * route (which itself prefers legislation.gov.uk canonical fetch and
 * falls back to Perplexity), reusing every gate in that pipeline:
 *   - propose-only on canonical fields
 *   - non-authority URLs auto-rejected
 *   - same-host fast-path / three-gate corroboration via the η sweep
 *
 * Caps:
 *   - 200 refs per run
 *   - per-ref dedup: skip if `last_freshness_check_at` < 6 days ago
 *
 * Auth: matches the existing legal-refs cron pattern — accepts
 * `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { isLegislationGovUkUrl } from '@/lib/legal-data/legislation-gov-uk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const HARD_CAP = 200;
const DEDUP_DAYS = 6;
const CONCURRENCY = 4;

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
}

interface ReverifyCounts {
  scanned: number;
  reverified_ok: number;
  skipped_dedup: number;
  errors: number;
}

interface RefRow {
  id: string;
  source_url: string;
  last_freshness_check_at: string | null;
}

/** Internal call to the existing verify route. Reuses all pipeline gates. */
async function callVerify(
  origin: string,
  cronSecret: string,
  id: string,
): Promise<{ ok: boolean; status?: string }> {
  try {
    const res = await fetch(`${origin}/api/admin/legal-refs/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return { ok: false, status: `http_${res.status}` };
    const data = (await res.json().catch(() => null)) as
      | { updated?: { status?: string } }
      | null;
    return { ok: true, status: data?.updated?.status };
  } catch (err) {
    return { ok: false, status: (err as Error)?.message || 'fetch_threw' };
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i += 1) {
    runners.push(
      (async () => {
        while (cursor < items.length) {
          const idx = cursor;
          cursor += 1;
          const it = items[idx];
          if (it === undefined) break;
          await worker(it);
        }
      })(),
    );
  }
  await Promise.all(runners);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // Pull a generous superset; we'll dedup + prioritise in memory so
  // non-legislation hosts go first.
  const { data, error } = await admin
    .from('legal_references')
    .select('id, source_url, last_freshness_check_at')
    .order('last_freshness_check_at', { ascending: true, nullsFirst: true })
    .limit(HARD_CAP * 3);

  if (error) {
    return NextResponse.json(
      { error: 'fetch refs failed', detail: error.message },
      { status: 500 },
    );
  }

  const dedupCutoff = Date.now() - DEDUP_DAYS * 24 * 60 * 60 * 1000;

  const all = (data || []) as RefRow[];
  const counts: ReverifyCounts = {
    scanned: 0,
    reverified_ok: 0,
    skipped_dedup: 0,
    errors: 0,
  };

  // Skip rows freshly seen by the daily amendments sweep — within
  // dedup window means we already have current freshness data.
  const eligible: RefRow[] = [];
  for (const r of all) {
    if (!r.id) continue;
    if (
      r.last_freshness_check_at &&
      new Date(r.last_freshness_check_at).getTime() > dedupCutoff
    ) {
      counts.skipped_dedup += 1;
      continue;
    }
    eligible.push(r);
  }

  // Prioritise non-legislation.gov.uk hosts — those have no daily cron
  // and Perplexity is their only freshness signal.
  eligible.sort((a, b) => {
    const aLeg = isLegislationGovUkUrl(a.source_url) ? 1 : 0;
    const bLeg = isLegislationGovUkUrl(b.source_url) ? 1 : 0;
    return aLeg - bLeg; // non-leg (0) first
  });

  const queue = eligible.slice(0, HARD_CAP);

  const cronSecret = process.env.CRON_SECRET || '';
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    `https://${request.headers.get('host') || 'paybacker.co.uk'}`;

  await runWithConcurrency(queue, CONCURRENCY, async (ref) => {
    counts.scanned += 1;
    const result = await callVerify(origin, cronSecret, ref.id);
    if (result.ok) {
      counts.reverified_ok += 1;
      // Touch the freshness check stamp so the next sweep can dedup
      // even when /verify itself didn't update freshness columns.
      await admin
        .from('legal_references')
        .update({ last_freshness_check_at: new Date().toISOString() })
        .eq('id', ref.id);
    } else {
      counts.errors += 1;
    }
  });

  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    queue: queue.length,
    counts,
  });
}
