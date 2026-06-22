/**
 * POST /api/admin/whatsapp/stage-template   { template_name }
 *
 * Zero-downtime body change for an ALREADY-APPROVED WhatsApp template.
 *
 * Unlike /resubmit-pending (which overwrites the live SID with a pending one
 * and therefore pauses the dispatch until Meta re-approves), this submits a NEW
 * Twilio Content for the template's CURRENT registry body and parks it in the
 * `pending_*` columns. The live `sid` / `approval_status` are left untouched, so
 * the morning brief (and any other send using this template) keeps going out on
 * the existing approved SID. The daily whatsapp-template-status cron promotes
 * pending_sid → sid once Meta approves it; a rejection leaves the live SID as-is.
 *
 * Founder-gated (authorizeAdminOrCron). Twilio creds never leave the server.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { TEMPLATES, type TemplateName } from '@/lib/whatsapp/template-registry';
import { getTemplateSid } from '@/lib/whatsapp/template-sids';

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

function buildContentPayload(name: string, tpl: { body: string; vars: readonly string[]; language?: string }) {
  const variables: Record<string, string> = {};
  tpl.vars.forEach((v, i) => {
    variables[String(i + 1)] = v;
  });
  return {
    friendly_name: name,
    language: tpl.language ?? 'en',
    variables,
    types: { 'twilio/text': { body: tpl.body } },
  };
}

async function logBusiness(action: string, payload: Record<string, unknown>) {
  try {
    await adminClient().from('business_log').insert({
      category: 'whatsapp_template_stage',
      title: `WhatsApp template stage: ${action}`,
      content: JSON.stringify(payload),
    });
  } catch {
    /* non-blocking */
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  let body: { template_name?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const name = body.template_name as TemplateName;
  if (!name || !(name in TEMPLATES)) {
    return NextResponse.json({ error: 'unknown or missing template_name' }, { status: 400 });
  }
  const tpl = TEMPLATES[name];
  const sb = adminClient();

  // Must have a live, approved SID to keep serving while the new one is in
  // review — otherwise this isn't a zero-downtime change and the founder should
  // use /resubmit-pending instead.
  const liveSid = await getTemplateSid(name);
  if (!liveSid) {
    return NextResponse.json(
      {
        error:
          'No live approved SID for this template — nothing to keep serving. Use /resubmit-pending instead.',
      },
      { status: 409 },
    );
  }

  // Don't double-stage.
  const { data: existing } = await sb
    .from('whatsapp_template_sids')
    .select('pending_status')
    .eq('template_name', name)
    .maybeSingle();
  if (existing?.pending_status === 'pending') {
    return NextResponse.json(
      { error: 'A staged change is already pending Meta approval for this template.' },
      { status: 409 },
    );
  }

  let authHeader: string;
  try {
    authHeader = basicAuth();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  try {
    // 1 — create the new Content with the current registry body.
    const createRes = await fetch(`${TWILIO_BASE}/Content`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildContentPayload(name, tpl)),
    });
    if (!createRes.ok) {
      throw new Error(`create ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`);
    }
    const created = (await createRes.json()) as { sid?: string };
    const pendingSid = created.sid;
    if (!pendingSid) throw new Error('Twilio response missing sid');

    // 2 — submit the new Content for WhatsApp approval.
    const approveRes = await fetch(
      `${TWILIO_BASE}/Content/${encodeURIComponent(pendingSid)}/ApprovalRequests/whatsapp`,
      {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category: tpl.category }),
      },
    );
    if (!approveRes.ok) {
      throw new Error(`approval ${approveRes.status}: ${(await approveRes.text()).slice(0, 300)}`);
    }

    // 3 — park the pending SID WITHOUT disturbing the live, approved one.
    //     Seeds the live row from the resolved live SID so getTemplateSid keeps
    //     returning an approved SID (covers templates that were on the registry
    //     fallback and had no DB row yet).
    await sb.from('whatsapp_template_sids').upsert(
      {
        template_name: name,
        sid: liveSid,
        approval_status: 'approved',
        category: tpl.category,
        language: 'en',
        submitted_at: new Date().toISOString(),
        pending_sid: pendingSid,
        pending_status: 'pending',
        pending_submitted_at: new Date().toISOString(),
        pending_body: tpl.body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'template_name' },
    );

    await logBusiness('staged', { template_name: name, live_sid: liveSid, pending_sid: pendingSid });
    return NextResponse.json({
      template_name: name,
      live_sid: liveSid,
      pending_sid: pendingSid,
      pending_status: 'pending',
      note: 'New body submitted to Meta. Live brief unaffected; promotes automatically on approval.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logBusiness('failed', { template_name: name, error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
