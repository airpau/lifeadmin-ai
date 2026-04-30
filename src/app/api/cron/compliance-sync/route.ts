/**
 * GET/POST /api/cron/compliance-sync
 *
 * Single end-to-end chained compliance pipeline. Replaces the previous
 * fan-out of separate crons + 6-button manual toolbar with ONE entry
 * point that auto-resolves the obvious and only alerts the founder when
 * human judgment is genuinely needed.
 *
 * Schedule: daily 03:00 UTC (vercel.json).
 *
 * Phases (in order):
 *   1. recover-url-dead    — probe url_dead refs; queue pending corrections
 *                            for any that resolve again.
 *   2. authority-audit     — flag any active ref source_url that's now
 *                            non-authority; insert pending corrections.
 *   3. discover-recent     — Perplexity sweep for new UK consumer law
 *                            in the last 30d; insert candidates.
 *   4. enrich-pending      — fetch source URL text for every pending
 *                            correction + candidate; compute risk_score.
 *   5. auto-reject-non-authority — for any pending correction whose
 *                            proposed_source_url is rejected/unrecognised
 *                            by checkUkLegalAuthority, mark rejected.
 *                            No human eye needed.
 *   6. auto-apply-low-risk — three-gate sweep PLUS the same-host fast-path
 *                            for url-only redirects within the authority
 *                            allowlist.
 *   7. summary-email       — send ONE email punch-list to hello@paybacker.co.uk
 *                            with auto-applied / needs-review / failed groups.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) OR logged-in admin (founder
 * "Run sync now" button via authorizeAdminOrCron).
 *
 * Cost: dominated by phase 3 (Perplexity ~£0.005) and phase 4 (Perplexity
 * summaries × N pending). Worst-case ~£0.30-£0.50.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

export const runtime = 'nodejs';
export const maxDuration = 600;
export const dynamic = 'force-dynamic';

const ALERT_TO = 'hello@paybacker.co.uk';
const ADMIN_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
const REVIEW_LINK = `${ADMIN_BASE}/dashboard/admin/legal-refs`;

type PhaseStatus = 'ok' | 'error' | 'skipped';
interface PhaseResult {
  name: string;
  status: PhaseStatus;
  details: Record<string, unknown>;
  ms: number;
  error?: string;
}

interface SyncSummary {
  ok: boolean;
  started_at: string;
  completed_at: string;
  total_ms: number;
  phases: PhaseResult[];
  totals: {
    queued_corrections: number;
    new_candidates: number;
    auto_applied: number;
    auto_rejected: number;
    needs_review: number;
    url_dead_unrecoverable: number;
  };
  email_sent: boolean;
}

async function callInternal(
  path: string,
  init: RequestInit,
  origin: string,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const cronSecret = process.env.CRON_SECRET;
  const headers = new Headers(init.headers || {});
  if (cronSecret) headers.set('Authorization', `Bearer ${cronSecret}`);
  if (init.method && init.method !== 'GET' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    const url = path.startsWith('http') ? path : `${origin}${path}`;
    const res = await fetch(url, { ...init, headers });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function getOrigin(request: NextRequest | Request): string {
  try {
    return new URL(request.url).origin;
  } catch {
    return ADMIN_BASE;
  }
}

async function runPhase(
  name: string,
  fn: () => Promise<{ details: Record<string, unknown>; status?: PhaseStatus }>,
): Promise<PhaseResult> {
  const start = Date.now();
  try {
    const out = await fn();
    return {
      name,
      status: out.status ?? 'ok',
      details: out.details,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: 'error',
      details: {},
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface PendingCorrectionRow {
  id: string;
  proposed_source_url: string | null;
  proposed_law_name: string | null;
  before_law_name: string | null;
  before_source_url: string | null;
  enrichment_data: { risk_score?: string | null } | null;
  reasoning?: string | null;
}

function getAdminSupabase() {
  // Lazy import to avoid pulling supabase into edge runtime build paths.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function autoRejectNonAuthority(): Promise<{
  scanned: number;
  rejected: number;
  errors: string[];
}> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from('legal_ref_corrections')
    .select('id, proposed_source_url')
    .eq('status', 'pending')
    .not('proposed_source_url', 'is', null)
    .limit(1000);
  if (error || !data) {
    return { scanned: 0, rejected: 0, errors: error ? [error.message] : [] };
  }
  let rejected = 0;
  const errors: string[] = [];
  for (const row of data as Array<{ id: string; proposed_source_url: string }>) {
    if (!row.proposed_source_url) continue;
    const check = checkUkLegalAuthority(row.proposed_source_url);
    if (!check.ok && (check.reason === 'rejected' || check.reason === 'unrecognised')) {
      const { error: updErr } = await supabase
        .from('legal_ref_corrections')
        .update({
          status: 'rejected',
          reviewed_by: 'system-auto-reject',
          notes: `Auto-rejected: non-authority source (${check.reason})`,
        })
        .eq('id', row.id);
      if (updErr) errors.push(`${row.id}: ${updErr.message}`);
      else rejected++;
    }
  }
  return { scanned: data.length, rejected, errors };
}

interface SummaryCounts {
  pending_corrections: number;
  pending_candidates: number;
  url_dead: number;
  auto_applied_today: number;
}

async function gatherSummaryCounts(): Promise<SummaryCounts> {
  const supabase = getAdminSupabase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [pc, pcand, urlDead, autoApplied] = await Promise.all([
    supabase
      .from('legal_ref_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('legal_ref_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('legal_references')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'url_dead'),
    supabase
      .from('legal_ref_corrections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'auto_applied')
      .gte('applied_at', since),
  ]);
  return {
    pending_corrections: pc.count ?? 0,
    pending_candidates: pcand.count ?? 0,
    url_dead: urlDead.count ?? 0,
    auto_applied_today: autoApplied.count ?? 0,
  };
}

async function topNeedsReview(): Promise<PendingCorrectionRow[]> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from('legal_ref_corrections')
    .select(
      'id, proposed_source_url, proposed_law_name, before_law_name, before_source_url, enrichment_data, reasoning',
    )
    .eq('status', 'pending')
    .not('enrichment_data', 'is', null)
    .order('enriched_at', { ascending: false })
    .limit(10);
  return (data ?? []) as PendingCorrectionRow[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderEmail(opts: {
  autoApplied: number;
  needsReview: PendingCorrectionRow[];
  needsReviewTotal: number;
  urlDeadUnrecoverable: number;
  newCandidates: number;
  autoRejected: number;
}): { subject: string; html: string } {
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const allClear =
    opts.needsReviewTotal === 0 &&
    opts.urlDeadUnrecoverable === 0 &&
    opts.newCandidates === 0;

  const subject = allClear
    ? `[Compliance] Daily sync clean ✓ — ${today}`
    : `[Compliance] Daily sync · ${opts.autoApplied} auto-applied · ${opts.needsReviewTotal} need your review`;

  if (allClear && opts.autoApplied === 0) {
    const html = `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <h2 style="color: #34d399; margin: 0 0 8px;">All caught up ✓</h2>
        <p style="color: #94a3b8; margin: 0;">No compliance work for ${escapeHtml(today)} — every legal reference is current and on an authority source.</p>
        <p style="color: #64748b; font-size: 13px; margin-top: 24px;">— Paybacker Compliance</p>
      </div>`;
    return { subject, html };
  }

  const greenBlock =
    opts.autoApplied > 0
      ? `<h3 style="color: #34d399; font-size: 15px; margin: 0 0 8px;">🟢 Auto-applied silently (${opts.autoApplied})</h3>
         <ul style="color: #cbd5e1; font-size: 13px; margin: 0 0 20px; padding-left: 20px;">
           <li>${opts.autoApplied} mechanical changes (URL redirects within authority domains, low-risk corrections that passed all 3 gates) — applied without your eye.</li>
           ${opts.autoRejected > 0 ? `<li>${opts.autoRejected} non-authority proposals auto-rejected before reaching your queue.</li>` : ''}
         </ul>`
      : '';

  const yellowBlock =
    opts.needsReviewTotal > 0
      ? `<h3 style="color: #fbbf24; font-size: 15px; margin: 0 0 8px;">🟡 Need your eye (${opts.needsReviewTotal})</h3>
         <div style="margin: 0 0 20px;">
           ${opts.needsReview
             .slice(0, 8)
             .map((c) => {
               const risk = c.enrichment_data?.risk_score ?? 'unknown';
               const proposed = c.proposed_law_name ?? c.before_law_name ?? '(unknown ref)';
               const reasoning = c.reasoning ? c.reasoning.slice(0, 140) : '';
               return `<div style="background: #1e293b; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px;">
                 <div style="color: #e2e8f0; font-size: 13px; font-weight: 600;">${escapeHtml(proposed)} <span style="color: #fbbf24; font-size: 11px;">[${escapeHtml(risk)} risk]</span></div>
                 ${reasoning ? `<div style="color: #94a3b8; font-size: 12px; margin-top: 3px;">${escapeHtml(reasoning)}</div>` : ''}
                 <a href="${REVIEW_LINK}#correction-${escapeHtml(c.id)}" style="color: #60a5fa; font-size: 12px;">Review →</a>
               </div>`;
             })
             .join('')}
           ${opts.needsReviewTotal > 8 ? `<p style="color: #94a3b8; font-size: 12px;">…and ${opts.needsReviewTotal - 8} more in the queue.</p>` : ''}
         </div>`
      : '';

  const redBlock =
    opts.urlDeadUnrecoverable > 0
      ? `<h3 style="color: #f87171; font-size: 15px; margin: 0 0 8px;">🔴 Failed (${opts.urlDeadUnrecoverable})</h3>
         <ul style="color: #cbd5e1; font-size: 13px; margin: 0 0 20px; padding-left: 20px;">
           <li>${opts.urlDeadUnrecoverable} url_dead reference${opts.urlDeadUnrecoverable === 1 ? '' : 's'} couldn't be resolved automatically — manual research needed.</li>
         </ul>`
      : '';

  const candBlock =
    opts.newCandidates > 0
      ? `<h3 style="color: #60a5fa; font-size: 15px; margin: 0 0 8px;">🔵 New candidate refs (${opts.newCandidates})</h3>
         <p style="color: #cbd5e1; font-size: 13px; margin: 0 0 20px;">${opts.newCandidates} potential new UK consumer-law reference${opts.newCandidates === 1 ? '' : 's'} discovered. Review and approve to add to the citation library.</p>`
      : '';

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
      <h2 style="color: #f59e0b; margin: 0 0 16px;">Compliance daily sync — ${escapeHtml(today)}</h2>
      ${greenBlock}
      ${yellowBlock}
      ${candBlock}
      ${redBlock}
      <p style="margin-top: 24px;">
        <a href="${REVIEW_LINK}" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open compliance dashboard</a>
      </p>
      <p style="color: #64748b; font-size: 12px; margin-top: 24px; line-height: 1.5;">— Paybacker Compliance. The pipeline auto-applied the obvious; everything above needs your judgment.</p>
    </div>`;
  return { subject, html };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason ?? 'Unauthorized' },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const skipEmail = url.searchParams.get('skip_email') === '1';
  const origin = getOrigin(request);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const phases: PhaseResult[] = [];

  // ---- Phase 1: recover-url-dead ----
  const phase1 = await runPhase('recover-url-dead', async () => {
    const out = await callInternal(
      '/api/admin/legal-refs/recover-url-dead',
      { method: 'POST', body: JSON.stringify({ queue: true }) },
      origin,
    );
    if (!out.ok) {
      return { details: { http_status: out.status, error: out.error }, status: 'error' };
    }
    return { details: (out.data as Record<string, unknown>) ?? {} };
  });
  phases.push(phase1);

  // ---- Phase 2: authority-audit ----
  const phase2 = await runPhase('authority-audit', async () => {
    const out = await callInternal(
      '/api/admin/legal-refs/audit-authority',
      { method: 'POST' },
      origin,
    );
    if (!out.ok) {
      return { details: { http_status: out.status, error: out.error }, status: 'error' };
    }
    return { details: (out.data as Record<string, unknown>) ?? {} };
  });
  phases.push(phase2);

  // ---- Phase 3: discover-legal-refs (recent) ----
  const phase3 = await runPhase('discover-recent', async () => {
    const out = await callInternal(
      '/api/cron/discover-legal-refs?leg=recent',
      { method: 'POST' },
      origin,
    );
    if (!out.ok) {
      return { details: { http_status: out.status, error: out.error }, status: 'error' };
    }
    return { details: (out.data as Record<string, unknown>) ?? {} };
  });
  phases.push(phase3);

  // ---- Phase 4: enrich-pending ----
  const phase4 = await runPhase('enrich-pending', async () => {
    const out = await callInternal(
      '/api/cron/enrich-compliance-pending',
      { method: 'POST' },
      origin,
    );
    if (!out.ok) {
      return { details: { http_status: out.status, error: out.error }, status: 'error' };
    }
    return { details: (out.data as Record<string, unknown>) ?? {} };
  });
  phases.push(phase4);

  // ---- Phase 5: auto-reject non-authority proposals ----
  const phase5 = await runPhase('auto-reject-non-authority', async () => {
    const out = await autoRejectNonAuthority();
    return { details: { ...out } };
  });
  phases.push(phase5);

  // ---- Phase 6: auto-apply LOW-risk + fast-path ----
  const phase6 = await runPhase('auto-apply-low-risk', async () => {
    const out = await callInternal(
      '/api/cron/legal-refs-auto-apply-sweep',
      { method: 'POST' },
      origin,
    );
    if (!out.ok) {
      return { details: { http_status: out.status, error: out.error }, status: 'error' };
    }
    return { details: (out.data as Record<string, unknown>) ?? {} };
  });
  phases.push(phase6);

  // ---- Phase 7: summary email ----
  const counts = await gatherSummaryCounts();
  const reviewSample = await topNeedsReview();
  const phase6Details = (phase6.details ?? {}) as { auto_applied?: number };
  const phase5Details = (phase5.details ?? {}) as { rejected?: number };
  const phase3Details = (phase3.details ?? {}) as { candidates_added?: number };
  const phase1Details = (phase1.details ?? {}) as {
    queued?: number;
    still_dead?: number;
  };

  const autoAppliedThisRun = phase6Details.auto_applied ?? 0;
  const autoRejectedThisRun = phase5Details.rejected ?? 0;
  const newCandidatesThisRun = phase3Details.candidates_added ?? 0;
  const urlDeadUnrecoverable = phase1Details.still_dead ?? 0;

  let emailSent = false;
  if (!skipEmail) {
    const phase7 = await runPhase('summary-email', async () => {
      const { subject, html } = renderEmail({
        autoApplied: autoAppliedThisRun,
        needsReview: reviewSample,
        needsReviewTotal: counts.pending_corrections,
        urlDeadUnrecoverable,
        newCandidates: newCandidatesThisRun,
        autoRejected: autoRejectedThisRun,
      });
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: ALERT_TO,
          subject,
          html,
        });
        emailSent = true;
        return { details: { sent_to: ALERT_TO, subject } };
      } catch (err) {
        return {
          details: {
            error: err instanceof Error ? err.message : String(err),
          },
          status: 'error',
        };
      }
    });
    phases.push(phase7);
  } else {
    phases.push({
      name: 'summary-email',
      status: 'skipped',
      details: { reason: 'skip_email=1' },
      ms: 0,
    });
  }

  const summary: SyncSummary = {
    ok: phases.every((p) => p.status !== 'error'),
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    total_ms: Date.now() - startMs,
    phases,
    totals: {
      queued_corrections: phase1Details.queued ?? 0,
      new_candidates: newCandidatesThisRun,
      auto_applied: autoAppliedThisRun,
      auto_rejected: autoRejectedThisRun,
      needs_review: counts.pending_corrections,
      url_dead_unrecoverable: urlDeadUnrecoverable,
    },
    email_sent: emailSent,
  };

  // Best-effort audit row
  try {
    const supabase = getAdminSupabase();
    await supabase.from('business_log').insert({
      category: 'compliance',
      action: 'compliance_sync_run',
      details: summary,
    });
  } catch {
    // optional
  }

  return NextResponse.json(summary);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
