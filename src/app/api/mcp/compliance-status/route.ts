/**
 * Paybacker Assistant compliance status endpoint (PR ζ).
 *
 * Read-only. Surfaces the same counts + top items the daily digest
 * email contains, plus a markdown summary suitable for chat display.
 *
 * Wired from the MCP server via a simple HTTP fetch — keeps this PR
 * additive and avoids touching the 1200-line MCP tool registry. The
 * MCP wiring (registering a `compliance_status` tool that calls this
 * endpoint) is a follow-up.
 *
 * Auth: cron secret OR admin session — same guard as the other
 * compliance endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import {
  pendingCorrectionsCount,
  pendingCandidatesCount,
  staleRefsCount,
  brokenRefsCount,
  topPendingCorrections,
  topStaleRefsCitedRecently,
} from '@/lib/compliance-queries';

export const maxDuration = 30;

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

  const url = new URL(request.url);
  const category = url.searchParams.get('category');

  const supabase = getAdmin();

  const [pc, pcand, st, br, topCorr, topStale] = await Promise.all([
    pendingCorrectionsCount(supabase),
    pendingCandidatesCount(supabase),
    staleRefsCount(supabase),
    brokenRefsCount(supabase),
    topPendingCorrections(supabase, 5),
    topStaleRefsCitedRecently(supabase, 5),
  ]);

  const filteredStale =
    category && topStale ? topStale.filter((r) => r.category === category) : topStale;

  const counts = {
    pending_corrections: pc,
    pending_candidates: pcand,
    stale_refs: st,
    broken_refs: br,
  };

  const tablesMissing = {
    legal_ref_corrections: pc === null,
    legal_ref_candidates: pcand === null,
    legal_ref_usages: topStale === null,
  };

  // Build a markdown summary suitable for chat
  const lines: string[] = [];
  lines.push('### Paybacker compliance status');
  lines.push('');
  lines.push(`- **Pending corrections:** ${pc ?? 'n/a'}`);
  lines.push(`- **Pending candidates:** ${pcand ?? 'n/a'}`);
  lines.push(`- **Stale references (>30d):** ${st ?? 'n/a'}`);
  lines.push(`- **Broken / flagged references:** ${br ?? 'n/a'}`);
  lines.push('');
  if (topCorr && topCorr.length > 0) {
    lines.push('**Top pending corrections:**');
    for (const c of topCorr) {
      const before = (c.before_value || '').toString().slice(0, 80);
      const after = (c.after_value || '').toString().slice(0, 80);
      lines.push(`- \`${c.id.slice(0, 8)}\` · ${before} → ${after}`);
    }
    lines.push('');
  }
  if (filteredStale && filteredStale.length > 0) {
    lines.push('**Top stale references cited recently:**');
    for (const r of filteredStale) {
      lines.push(
        `- ${r.law_name}${r.section ? ' ' + r.section : ''} (${r.verification_status || 'unknown'}, used ${r.uses_30d}× in 30d)`,
      );
    }
    lines.push('');
  }
  lines.push('_Read-only snapshot. Every change still requires a deliberate founder click._');

  return NextResponse.json({
    ok: true,
    counts,
    top_pending_corrections: topCorr ?? [],
    top_stale_refs: filteredStale ?? [],
    tables_missing: tablesMissing,
    markdown: lines.join('\n'),
    generated_at: new Date().toISOString(),
  });
}
