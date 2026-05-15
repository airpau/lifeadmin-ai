/**
 * Daily compliance digest (PR ζ).
 *
 * Schedule: 09:00 UTC daily — wired in vercel.json.
 * Sends ONE email per day to hello@paybacker.co.uk summarising pending
 * compliance review queues and stale references.
 *
 * Cost: 1 Resend send/day (well under free tier).
 *
 * This cron is observational only. It NEVER auto-applies a correction
 * or auto-resolves anything. Per CLAUDE.md compliance principle: no
 * canonical legal_references write without an approved correction +
 * a deliberate founder click.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { resend, FROM_EMAIL } from '@/lib/resend';
import {
  pendingCorrectionsCount,
  pendingCandidatesCount,
  staleRefsCount,
  brokenRefsCount,
  topPendingCorrections,
  topStaleRefsCitedRecently,
} from '@/lib/compliance-queries';

export const maxDuration = 60;

const ALERT_TO = 'hello@paybacker.co.uk';
const ADMIN_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso?: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const [pendingCorr, pendingCand, stale, broken, topCorr, topStale] = await Promise.all([
    pendingCorrectionsCount(supabase),
    pendingCandidatesCount(supabase),
    staleRefsCount(supabase),
    brokenRefsCount(supabase),
    topPendingCorrections(supabase, 5),
    topStaleRefsCitedRecently(supabase, 5),
  ]);

  // Treat null (table missing) as 0 for the headline but flag it in metadata
  const pc = pendingCorr ?? 0;
  const pcand = pendingCand ?? 0;
  const st = stale ?? 0;
  const br = broken ?? 0;
  const total = pc + pcand;

  const subject =
    total === 0 && st === 0 && br === 0
      ? `[Compliance] All queues clear — ${today}`
      : `[Compliance] ${total} pending reviews, ${st} stale refs — ${today}`;

  const allClear = total === 0 && st === 0 && br === 0;

  const reviewLink = `${ADMIN_BASE}/dashboard/admin/legal-refs`;

  let html: string;
  if (allClear) {
    html = `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <h2 style="color: #34d399; margin: 0 0 8px;">All compliance queues clear ✓</h2>
        <p style="color: #94a3b8; margin: 0;">No pending corrections, candidates, or stale references as of ${escapeHtml(today)}.</p>
        <p style="color: #64748b; font-size: 13px; margin-top: 24px;">— Paybacker Compliance Centre</p>
      </div>
    `;
  } else {
    const corrRows =
      topCorr && topCorr.length > 0
        ? topCorr
            .map((c) => {
              const before = c.before_value ? escapeHtml(String(c.before_value).slice(0, 120)) : '<em>(empty)</em>';
              const after = c.after_value ? escapeHtml(String(c.after_value).slice(0, 120)) : '<em>(empty)</em>';
              return `
                <tr>
                  <td style="padding: 8px 12px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-size: 13px;">
                    <div><strong>${escapeHtml(c.id.slice(0, 8))}</strong> · ${escapeHtml(fmtDate(c.created_at))}</div>
                    <div style="color: #94a3b8; margin-top: 4px;">Before: ${before}</div>
                    <div style="color: #34d399; margin-top: 2px;">After: ${after}</div>
                    <a href="${reviewLink}" style="color: #60a5fa; font-size: 12px;">Review →</a>
                  </td>
                </tr>`;
            })
            .join('')
        : `<tr><td style="padding: 12px; color: #64748b; font-size: 13px;">No pending corrections to display.</td></tr>`;

    const staleRows =
      topStale && topStale.length > 0
        ? topStale
            .map((r) => {
              return `
                <tr>
                  <td style="padding: 8px 12px; border-bottom: 1px solid #1e293b; color: #e2e8f0; font-size: 13px;">
                    <div><strong>${escapeHtml(r.law_name)}</strong>${r.section ? ' ' + escapeHtml(r.section) : ''}</div>
                    <div style="color: #94a3b8; margin-top: 4px;">Status: ${escapeHtml(r.verification_status || 'unknown')} · Last verified: ${escapeHtml(fmtDate(r.last_verified))} · Used ${r.uses_30d}× in last 30d</div>
                    <a href="${reviewLink}" style="color: #60a5fa; font-size: 12px;">Review →</a>
                  </td>
                </tr>`;
            })
            .join('')
        : `<tr><td style="padding: 12px; color: #64748b; font-size: 13px;">No stale references cited recently.</td></tr>`;

    html = `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
        <h2 style="color: #f59e0b; margin: 0 0 16px;">Compliance digest — ${escapeHtml(today)}</h2>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 12px; background: #1e293b; border-radius: 8px; width: 50%;">
              <div style="color: #94a3b8; font-size: 12px;">Pending corrections</div>
              <div style="color: #f59e0b; font-size: 28px; font-weight: 700;">${pc}</div>
            </td>
            <td style="width: 8px;"></td>
            <td style="padding: 12px; background: #1e293b; border-radius: 8px; width: 50%;">
              <div style="color: #94a3b8; font-size: 12px;">Pending candidates</div>
              <div style="color: #f59e0b; font-size: 28px; font-weight: 700;">${pcand}</div>
            </td>
          </tr>
          <tr><td colspan="3" style="height: 8px;"></td></tr>
          <tr>
            <td style="padding: 12px; background: #1e293b; border-radius: 8px;">
              <div style="color: #94a3b8; font-size: 12px;">Stale refs (&gt;30d)</div>
              <div style="color: #fbbf24; font-size: 28px; font-weight: 700;">${st}</div>
            </td>
            <td></td>
            <td style="padding: 12px; background: #1e293b; border-radius: 8px;">
              <div style="color: #94a3b8; font-size: 12px;">Broken / flagged</div>
              <div style="color: #f87171; font-size: 28px; font-weight: 700;">${br}</div>
            </td>
          </tr>
        </table>

        <h3 style="color: #e2e8f0; font-size: 16px; margin: 24px 0 8px;">Top 5 corrections to review</h3>
        <table style="width: 100%; border-collapse: collapse; background: #0b1220; border-radius: 8px; overflow: hidden;">
          ${corrRows}
        </table>

        <h3 style="color: #e2e8f0; font-size: 16px; margin: 24px 0 8px;">Top 5 stale refs cited recently</h3>
        <table style="width: 100%; border-collapse: collapse; background: #0b1220; border-radius: 8px; overflow: hidden;">
          ${staleRows}
        </table>

        <p style="margin-top: 24px;">
          <a href="${reviewLink}" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open review centre</a>
        </p>

        <p style="color: #64748b; font-size: 12px; margin-top: 24px; line-height: 1.5;">
          — Paybacker Compliance Centre. Every change requires a deliberate founder click; nothing in this email auto-applies.
        </p>
      </div>
    `;
  }

  const tablesMissing = {
    legal_ref_corrections: pendingCorr === null,
    legal_ref_candidates: pendingCand === null,
    legal_ref_usages: topStale === null,
  };

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_TO,
      subject,
      html,
    });
  } catch (err) {
    console.error('[compliance-digest] Resend send failed:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        counts: { pendingCorr: pc, pendingCand: pcand, stale: st, broken: br },
        tables_missing: tablesMissing,
      },
      { status: 500 },
    );
  }

  // Best-effort log
  try {
    await supabase.from('business_log').insert({
      category: 'compliance',
      action: 'daily_digest_sent',
      details: {
        counts: { pendingCorr: pc, pendingCand: pcand, stale: st, broken: br },
        tables_missing: tablesMissing,
        all_clear: allClear,
      },
    });
  } catch {
    // business_log is optional
  }

  return NextResponse.json({
    ok: true,
    sent_to: ALERT_TO,
    subject,
    counts: { pendingCorr: pc, pendingCand: pcand, stale: st, broken: br },
    tables_missing: tablesMissing,
  });
}
