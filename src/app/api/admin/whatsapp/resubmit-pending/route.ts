/**
 * POST /api/admin/whatsapp/resubmit-pending
 *
 * Founder-gated server-side resubmit of WhatsApp templates currently marked
 * PENDING_RESUBMISSION in the registry. Runs on Vercel where TWILIO_AUTH_TOKEN
 * is in scope as a Sensitive env var (it can't be `vercel env pull`-ed).
 *
 * For each template:
 *   1. Create a Twilio Content (POST /v1/Content) — body + variables.
 *   2. Submit it for WhatsApp approval (POST /v1/Content/{sid}/ApprovalRequests/whatsapp).
 *   3. UPSERT the new SID + approval_status='pending' into whatsapp_template_sids.
 *   4. 1s rate-limit between templates.
 *
 * Body: { template_names?: string[] }. Omitted = resubmit all PENDING_RESUBMISSION.
 *
 * Logs every action to business_log under category `whatsapp_template_resubmit`.
 * Twilio creds are NEVER returned in the response or echoed to console.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import {
  TEMPLATES,
  PENDING_RESUBMISSION,
  type TemplateName,
} from '@/lib/whatsapp/template-registry';

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
  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required');
  }
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

/**
 * Build the Twilio Content payload from a registry entry. We use the
 * `twilio/text` content type (plain WhatsApp text body with variables).
 * Variables map: { "1": "name", "2": "merchant", ... } per the registry.
 */
function buildContentPayload(name: string, tpl: { body: string; vars: readonly string[]; language?: string }) {
  const variables: Record<string, string> = {};
  tpl.vars.forEach((v, i) => {
    variables[String(i + 1)] = v;
  });
  return {
    friendly_name: name,
    language: tpl.language ?? 'en',
    variables,
    types: {
      'twilio/text': { body: tpl.body },
    },
  };
}

interface ResubmitOk {
  name: string;
  sid: string;
  status: 'pending';
}
interface ResubmitFail {
  name: string;
  error: string;
}

async function logBusiness(action: string, payload: Record<string, unknown>) {
  try {
    const sb = adminClient();
    await sb.from('business_log').insert({
      category: 'whatsapp_template_resubmit',
      title: `WhatsApp template resubmit: ${action}`,
      content: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking.
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  let body: { template_names?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const allPending: TemplateName[] = (Object.keys(TEMPLATES) as TemplateName[]).filter((n) => {
    const t = TEMPLATES[n];
    return t.sid === PENDING_RESUBMISSION;
  });

  const requested = body.template_names && body.template_names.length > 0
    ? (body.template_names.filter((n): n is TemplateName => n in TEMPLATES) as TemplateName[])
    : allPending;

  if (requested.length === 0) {
    return NextResponse.json({ submitted: [], failed: [], note: 'No pending templates to resubmit.' });
  }

  let authHeader: string;
  try {
    authHeader = basicAuth();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logBusiness('config_error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const submitted: ResubmitOk[] = [];
  const failed: ResubmitFail[] = [];
  const sb = adminClient();

  for (let i = 0; i < requested.length; i += 1) {
    const name = requested[i];
    const tpl = TEMPLATES[name];

    try {
      // Step 1 — create the Content
      const createRes = await fetch(`${TWILIO_BASE}/Content`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildContentPayload(name, tpl)),
      });
      if (!createRes.ok) {
        const t = await createRes.text();
        throw new Error(`create ${createRes.status}: ${t.slice(0, 300)}`);
      }
      const created = (await createRes.json()) as { sid?: string };
      const newSid = created.sid;
      if (!newSid) throw new Error('Twilio response missing sid');

      // Step 2 — submit for WhatsApp approval
      const approveRes = await fetch(
        `${TWILIO_BASE}/Content/${encodeURIComponent(newSid)}/ApprovalRequests/whatsapp`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, category: tpl.category }),
        },
      );
      if (!approveRes.ok) {
        const t = await approveRes.text();
        throw new Error(`approval ${approveRes.status}: ${t.slice(0, 300)}`);
      }

      // Step 3 — upsert
      await sb
        .from('whatsapp_template_sids')
        .upsert(
          {
            template_name: name,
            sid: newSid,
            approval_status: 'pending',
            category: tpl.category,
            language: 'en',
            submitted_at: new Date().toISOString(),
            approved_at: null,
            last_error: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'template_name' },
        );

      submitted.push({ name, sid: newSid, status: 'pending' });
      await logBusiness('submitted', { name, sid: newSid });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ name, error: msg });
      await logBusiness('failed', { name, error: msg });
    }

    // Rate-limit: 1s pause between templates.
    if (i < requested.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return NextResponse.json({ submitted, failed });
}
