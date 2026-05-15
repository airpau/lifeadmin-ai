/**
 * Immediate compliance alert endpoint (PR ζ).
 *
 * Internal endpoint, called by the verifier or other compliance tooling
 * when something needs the founder's attention before the daily digest:
 *   - A ref used in the last 7 days transitioned to broken
 *   - >3 corrections accumulated for the same ref_id (systemic issue)
 *   - A discovery candidate landed for a heavy-traffic category
 *
 * Cost guards:
 *   - Idempotent via compliance_alerts_sent.alert_key UNIQUE
 *   - Hard cap of 5 urgent alerts per UTC day
 *
 * This endpoint NEVER auto-resolves anything. It only emails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { resend, FROM_EMAIL } from '@/lib/resend';

export const maxDuration = 30;

const ALERT_TO = 'hello@paybacker.co.uk';
const ADMIN_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';
const DAILY_URGENT_CAP = 5;

type Reason =
  | 'ref_broke_high_traffic'
  | 'correction_flood'
  | 'heavy_traffic_candidate';

interface AlertRequest {
  reason: Reason;
  ref_id?: string;
  ref_title?: string;
  category?: string;
  used_count_7d?: number;
  correction_count?: number;
  candidate_id?: string;
  details?: string;
}

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

function alertKeyFor(body: AlertRequest): string {
  const today = new Date().toISOString().slice(0, 10);
  switch (body.reason) {
    case 'ref_broke_high_traffic':
      return `ref-broke:${body.ref_id || 'unknown'}`;
    case 'correction_flood':
      return `correction-flood:${body.ref_id || 'unknown'}:${today}`;
    case 'heavy_traffic_candidate':
      return `category-flood:${body.category || 'unknown'}:${today}`;
  }
}

function subjectFor(body: AlertRequest): string {
  switch (body.reason) {
    case 'ref_broke_high_traffic':
      return `[Compliance · URGENT] Ref "${body.ref_title || body.ref_id}" broke — used ${body.used_count_7d ?? '?'} times in last 7d`;
    case 'correction_flood':
      return `[Compliance · URGENT] ${body.correction_count ?? '?'} corrections on "${body.ref_title || body.ref_id}" — possible systemic issue`;
    case 'heavy_traffic_candidate':
      return `[Compliance · URGENT] New ${body.category || 'unknown'} reference candidate — review needed`;
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  let body: AlertRequest;
  try {
    body = (await request.json()) as AlertRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || !body.reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  const supabase = getAdmin();
  const alertKey = alertKeyFor(body);

  // Idempotency: try to claim the alert_key. If it already exists, skip.
  try {
    const { error: insertErr } = await supabase
      .from('compliance_alerts_sent')
      .insert({
        alert_key: alertKey,
        channel: 'email',
        metadata: body as unknown as Record<string, unknown>,
      });
    if (insertErr) {
      // Most likely UNIQUE violation — already sent
      return NextResponse.json({ ok: true, skipped: 'already_sent', alert_key: alertKey });
    }
  } catch {
    return NextResponse.json({ ok: true, skipped: 'dedup_table_unavailable', alert_key: alertKey });
  }

  // Daily cap check (5/day) — count rows sent today
  try {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('compliance_alerts_sent')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', since.toISOString());
    if ((count ?? 0) > DAILY_URGENT_CAP) {
      return NextResponse.json({
        ok: true,
        skipped: 'daily_cap_reached',
        cap: DAILY_URGENT_CAP,
        alert_key: alertKey,
      });
    }
  } catch {
    // soldier on
  }

  const subject = subjectFor(body);
  const reviewLink = `${ADMIN_BASE}/dashboard/admin/legal-refs`;
  const detailsBlock = body.details ? `<p style="color: #94a3b8;">${escapeHtml(body.details)}</p>` : '';

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 32px; border-radius: 12px;">
      <div style="background: #7f1d1d; color: #fee2e2; padding: 6px 12px; border-radius: 4px; display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.5px;">URGENT</div>
      <h2 style="color: #f87171; margin: 12px 0 8px;">${escapeHtml(subject.replace(/^\[Compliance · URGENT\]\s*/, ''))}</h2>
      <table style="width: 100%; margin-top: 16px; color: #e2e8f0; font-size: 13px;">
        ${body.ref_id ? `<tr><td style="color: #94a3b8; padding: 4px 8px 4px 0;">Ref ID</td><td><code>${escapeHtml(body.ref_id)}</code></td></tr>` : ''}
        ${body.category ? `<tr><td style="color: #94a3b8; padding: 4px 8px 4px 0;">Category</td><td>${escapeHtml(body.category)}</td></tr>` : ''}
        ${body.used_count_7d !== undefined ? `<tr><td style="color: #94a3b8; padding: 4px 8px 4px 0;">Uses (7d)</td><td>${body.used_count_7d}</td></tr>` : ''}
        ${body.correction_count !== undefined ? `<tr><td style="color: #94a3b8; padding: 4px 8px 4px 0;">Corrections</td><td>${body.correction_count}</td></tr>` : ''}
      </table>
      ${detailsBlock}
      <p style="margin-top: 24px;">
        <a href="${reviewLink}" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open review centre</a>
      </p>
      <p style="color: #64748b; font-size: 12px; margin-top: 16px;">— Paybacker Compliance Centre. Observational alert only — nothing has been auto-applied.</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ALERT_TO,
      subject,
      html,
    });
  } catch (err) {
    console.error('[compliance-alert] Resend send failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, alert_key: alertKey, subject });
}
