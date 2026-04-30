/**
 * /api/cron/b2b-weekly-digest — Mondays 09:00 UTC.
 *
 * For each non-revoked B2B key with weekly_digest_opt_in = true,
 * compute last 7 days of usage + errors and email a summary to the
 * key owner. Founder gets a roll-up via Telegram.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { resend } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface KeyRow {
  id: string;
  owner_email: string;
  name: string;
  tier: string;
  monthly_limit: number;
  key_prefix: string;
  weekly_digest_opt_in: boolean;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true, skipped: 'no RESEND_API_KEY' });

  const supabase = getAdmin();
  const { data: keys } = await supabase
    .from('b2b_api_keys')
    .select('id, owner_email, name, tier, monthly_limit, key_prefix, weekly_digest_opt_in')
    .is('revoked_at', null)
    .eq('weekly_digest_opt_in', true);

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  let sent = 0;
  const fromEmail = process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>';

  // Group by owner_email — one digest per customer not per key.
  const byOwner = new Map<string, KeyRow[]>();
  for (const k of (keys ?? []) as KeyRow[]) {
    const arr = byOwner.get(k.owner_email) ?? [];
    arr.push(k);
    byOwner.set(k.owner_email, arr);
  }

  for (const [owner, ownerKeys] of byOwner) {
    const ids = ownerKeys.map((k) => k.id);
    const { data: usage } = await supabase
      .from('b2b_api_usage')
      .select('status_code, latency_ms, key_id, created_at')
      .in('key_id', ids)
      .gte('created_at', since);
    const rows = (usage ?? []) as Array<{ status_code: number; latency_ms: number | null; key_id: string }>;
    const total = rows.length;
    const errors = rows.filter((r) => r.status_code >= 400).length;
    const lats = rows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const p95 = lats.length > 0 ? lats[Math.floor(0.95 * (lats.length - 1))] : 0;

    const perKeyRows = ownerKeys.map((k) => {
      const c = rows.filter((r) => r.key_id === k.id).length;
      const e = rows.filter((r) => r.key_id === k.id && r.status_code >= 400).length;
      const pct = k.monthly_limit > 0 ? Math.round((c / k.monthly_limit) * 100) : 0;
      return `<tr><td style="padding:6px 12px 6px 0;">${escape(k.name)}</td><td style="padding:6px 12px 6px 0;">${c.toLocaleString()}</td><td style="padding:6px 12px 6px 0;">${e}</td><td style="padding:6px 12px 6px 0;">${pct}%</td></tr>`;
    }).join('');

    try {
      await resend.emails.send({
        from: fromEmail,
        to: owner,
        replyTo: 'business@paybacker.co.uk',
        subject: `📊 Weekly Paybacker API digest — ${total.toLocaleString()} calls`,
        html: `
          <div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
            <h2 style="margin:0 0 4px;">Weekly digest</h2>
            <p style="color:#475569;margin:0 0 16px;">Last 7 days for your Paybacker API keys.</p>
            <table style="border-collapse:collapse;font-size:14px;margin:0 0 14px;">
              <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Total calls</td><td><strong>${total.toLocaleString()}</strong></td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#64748b;">Errors</td><td><strong>${errors}</strong></td></tr>
              <tr><td style="padding:4px 16px 4px 0;color:#64748b;">p95 latency</td><td><strong>${p95}ms</strong></td></tr>
            </table>
            <h3 style="margin:14px 0 6px;font-size:14px;">Per key</h3>
            <table style="border-collapse:collapse;font-size:13px;width:100%;">
              <thead><tr style="text-align:left;color:#64748b;"><th style="padding:6px 12px 6px 0;">Key</th><th style="padding:6px 12px 6px 0;">Calls</th><th style="padding:6px 12px 6px 0;">Errors</th><th style="padding:6px 12px 6px 0;">Of cap</th></tr></thead>
              <tbody>${perKeyRows}</tbody>
            </table>
            <p style="margin-top:16px;"><a href="https://paybacker.co.uk/dashboard/api-keys" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Open portal</a></p>
            <p style="color:#94a3b8;font-size:12px;margin-top:16px;">Don't want this? Sign in to the portal → Account → toggle Weekly digest off.</p>
          </div>`,
      });
      sent++;
    } catch (e: any) {
      console.error('[b2b-weekly-digest] send failed for', owner, e?.message);
    }
  }

  return NextResponse.json({ ok: true, owners: byOwner.size, sent });
}

function escape(s: string) { return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
