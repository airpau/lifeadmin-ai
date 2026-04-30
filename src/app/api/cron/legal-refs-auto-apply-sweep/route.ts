/**
 * Daily auto-apply sweep for legal-reference corrections (PR η).
 *
 * Runs at 05:30 UTC, after ζ's enrichment cron (~04:00) and before β's
 * 14-day staleness cutoff. Iterates pending rows in `legal_ref_corrections`
 * that have enrichment_data attached, evaluates each through the three
 * gates in `evaluateCorrection`, and auto-applies ones that pass.
 *
 * Hard cap: 50 auto-applies per run. Anything that fails any gate stays
 * `status='pending'` for the founder to review manually.
 *
 * If the `legal_ref_corrections` table doesn't yet exist (ε not merged),
 * the entire route silently no-ops with a structured zero-row summary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import {
  evaluateCorrection,
  applyCorrection,
  type LegalRefCorrection,
} from '@/lib/legal-refs-auto-apply';

export const maxDuration = 300;

const HARD_CAP = 50;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason ?? 'Unauthorized' },
      { status: auth.status },
    );
  }

  const supabase = getAdmin();
  const summary = {
    processed: 0,
    auto_applied: 0,
    still_pending: 0,
    failures: 0,
    skipped_table_missing: false as boolean,
    examples: [] as Array<{
      id: string;
      reasons: string[];
      failed_gates: string[];
      applied: boolean;
    }>,
  };

  let pending: LegalRefCorrection[] = [];
  try {
    const { data, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('status', 'pending')
      .not('enrichment_data', 'is', null)
      .not('enriched_at', 'is', null)
      .order('enriched_at', { ascending: true })
      .limit(HARD_CAP * 4); // grab a few extra so cap is meaningful
    if (error) {
      // Table or column missing — silent no-op.
      summary.skipped_table_missing = true;
      return NextResponse.json(summary);
    }
    pending = (data as LegalRefCorrection[]) ?? [];
  } catch {
    summary.skipped_table_missing = true;
    return NextResponse.json(summary);
  }

  for (const row of pending) {
    if (summary.auto_applied >= HARD_CAP) break;
    summary.processed++;
    try {
      const decision = await evaluateCorrection(supabase, row);
      if (decision.shouldAutoApply) {
        const ok = await applyCorrection(supabase, row, decision);
        if (ok) {
          summary.auto_applied++;
          summary.examples.push({
            id: row.id,
            reasons: decision.reasons,
            failed_gates: [],
            applied: true,
          });
        } else {
          summary.failures++;
        }
      } else {
        summary.still_pending++;
        if (summary.examples.length < 10) {
          summary.examples.push({
            id: row.id,
            reasons: decision.reasons,
            failed_gates: decision.failed_gates,
            applied: false,
          });
        }
      }
    } catch (e) {
      summary.failures++;
      console.error('[auto-apply-sweep] row failed', row.id, e);
    }
  }

  console.log('[auto-apply-sweep] summary', {
    processed: summary.processed,
    auto_applied: summary.auto_applied,
    still_pending: summary.still_pending,
    failures: summary.failures,
  });

  return NextResponse.json(summary);
}
