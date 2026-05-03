/**
 * Compliance enrichment cron (PR ζ).
 *
 * Schedule: 04:00 UTC daily — wired in vercel.json.
 *
 * Purpose: when a correction or candidate lands in the queue, do the
 * legwork BEFORE the founder reviews — fetch source URL, extract relevant
 * text, diff URL/title, risk-score the change, optionally summarise via
 * Perplexity. Founder then sees a fully-prepped diff with evidence
 * instead of a one-line "Perplexity says try this".
 *
 * Hard rules:
 *   - NEVER auto-applies a correction. Only writes enrichment_data
 *     onto the pending row.
 *   - Hard cap: 50 items/day total (corrections + candidates combined).
 *   - Per-item cost ≈ £0.01 (Perplexity AI summary + free HTTP fetch).
 *     Daily worst-case ~£0.50.
 *   - Skips items that already have enriched_at set.
 *   - Gracefully no-ops if legal_ref_corrections / legal_ref_candidates
 *     don't exist yet (sibling PRs δ, ε not merged).
 *
 * Per-row enrichment lives in `src/lib/legal-refs-enrich.ts` so
 * insert-flow callers (recover-url-dead, amendments-sweep) can fire it
 * synchronously without waiting for this cron.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { enrichRow } from '@/lib/legal-refs-enrich';

export const maxDuration = 300;

const DAILY_CAP = 50;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const results = {
    processed_corrections: 0,
    processed_candidates: 0,
    risk_low: 0,
    risk_medium: 0,
    risk_high: 0,
    errors: 0,
    cap: DAILY_CAP,
    tables_missing: { legal_ref_corrections: false, legal_ref_candidates: false },
  };

  let budget = DAILY_CAP;

  // Corrections first
  try {
    const { data: corrections, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('status', 'pending')
      .is('enriched_at', null)
      .order('created_at', { ascending: true })
      .limit(budget);
    if (error) {
      // Likely missing table or missing enriched_at column — skip silently
      results.tables_missing.legal_ref_corrections = true;
    } else if (corrections) {
      for (const row of corrections) {
        if (budget <= 0) break;
        const out = await enrichRow(supabase, 'legal_ref_corrections', row);
        budget--;
        if (out.ok) {
          results.processed_corrections++;
          if (out.risk === 'low') results.risk_low++;
          else if (out.risk === 'medium') results.risk_medium++;
          else if (out.risk === 'high') results.risk_high++;
        } else {
          results.errors++;
        }
      }
    }
  } catch {
    results.tables_missing.legal_ref_corrections = true;
  }

  // Candidates
  try {
    const { data: candidates, error } = await supabase
      .from('legal_ref_candidates')
      .select('*')
      .eq('status', 'pending')
      .is('enriched_at', null)
      .order('created_at', { ascending: true })
      .limit(budget);
    if (error) {
      results.tables_missing.legal_ref_candidates = true;
    } else if (candidates) {
      for (const row of candidates) {
        if (budget <= 0) break;
        const out = await enrichRow(supabase, 'legal_ref_candidates', row);
        budget--;
        if (out.ok) {
          results.processed_candidates++;
          if (out.risk === 'low') results.risk_low++;
          else if (out.risk === 'medium') results.risk_medium++;
          else if (out.risk === 'high') results.risk_high++;
        } else {
          results.errors++;
        }
      }
    }
  } catch {
    results.tables_missing.legal_ref_candidates = true;
  }

  // Best-effort log
  try {
    await supabase.from('business_log').insert({
      category: 'compliance',
      action: 'enrichment_cron',
      details: results,
    });
  } catch {
    // optional
  }

  return NextResponse.json({ ok: true, ...results });
}

// Mirror GET so the founder can trigger this from the admin dashboard
// without needing a cron-secret bearer header (the admin UI authenticates
// via the Supabase session cookie, see authorizeAdminOrCron).
export async function POST(request: NextRequest) {
  return GET(request);
}
