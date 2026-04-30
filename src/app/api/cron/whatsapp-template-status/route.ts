/**
 * GET/POST /api/cron/whatsapp-template-status
 *
 * Daily 11:00 UTC. For every row in `whatsapp_template_sids` where
 * approval_status IN ('pending','unknown'), poll the Twilio Content
 * Approval API and persist the latest Meta status. Newly-approved or
 * newly-rejected templates emit a business_log entry so the founder
 * sees them.
 *
 * Auth: founder cookie OR Bearer CRON_SECRET via authorizeAdminOrCron.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TWILIO_BASE = 'https://content.twilio.com/v1';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

function basicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required');
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

type Status = 'pending' | 'approved' | 'rejected' | 'paused' | 'unknown';

function normaliseStatus(raw: unknown): Status {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'paused') return 'paused';
  if (s === 'pending' || s === 'received' || s === 'submitted') return 'pending';
  return 'unknown';
}

interface ApprovalResponse {
  whatsapp?: { status?: string; rejection_reason?: string; category?: string };
  status?: string;
  rejection_reason?: string;
}

async function logBusiness(category: string, title: string, payload: Record<string, unknown>) {
  try {
    const sb = adminClient();
    await sb.from('business_log').insert({
      category,
      title,
      content: JSON.stringify(payload),
    });
  } catch {
    /* non-blocking */
  }
}

async function run(): Promise<{ checked: number; updated: { name: string; from: Status; to: Status }[]; errors: { name: string; error: string }[] }> {
  const sb = adminClient();
  const authHeader = basicAuth();

  const { data: rows } = await sb
    .from('whatsapp_template_sids')
    .select('template_name, sid, approval_status')
    .in('approval_status', ['pending', 'unknown']);

  const updated: { name: string; from: Status; to: Status }[] = [];
  const errors: { name: string; error: string }[] = [];
  const list = rows ?? [];

  for (const row of list) {
    try {
      const res = await fetch(
        `${TWILIO_BASE}/Content/${encodeURIComponent(row.sid)}/ApprovalRequests`,
        { headers: { Authorization: authHeader } },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`status ${res.status}: ${t.slice(0, 300)}`);
      }
      const data = (await res.json()) as ApprovalResponse;
      const waStatus = normaliseStatus(data.whatsapp?.status ?? data.status);
      const rejectionReason = data.whatsapp?.rejection_reason ?? data.rejection_reason ?? null;

      const fromStatus = row.approval_status as Status;
      const patch: Record<string, unknown> = {
        approval_status: waStatus,
        last_status_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (waStatus === 'approved' && fromStatus !== 'approved') {
        patch.approved_at = new Date().toISOString();
        patch.last_error = null;
      } else if (waStatus === 'rejected') {
        patch.last_error = rejectionReason;
      }

      await sb
        .from('whatsapp_template_sids')
        .update(patch)
        .eq('template_name', row.template_name);

      if (waStatus !== fromStatus) {
        updated.push({ name: row.template_name, from: fromStatus, to: waStatus });
        if (waStatus === 'approved') {
          await logBusiness('whatsapp_template_approved', `WhatsApp template approved: ${row.template_name}`, {
            template_name: row.template_name,
            sid: row.sid,
          });
        } else if (waStatus === 'rejected') {
          await logBusiness('whatsapp_template_rejected', `WhatsApp template rejected: ${row.template_name}`, {
            template_name: row.template_name,
            sid: row.sid,
            rejection_reason: rejectionReason,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ name: row.template_name, error: msg });
    }
  }

  return { checked: list.length, updated, errors };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  try {
    const out = await run();
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return GET(request);
}
