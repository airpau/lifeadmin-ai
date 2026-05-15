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
 *   4. 2s rate-limit between templates (bumped from 1s on 2026-05-03 — Meta
 *      has been flaky on rapid resubmissions).
 *
 * Body: { template_names?: string[] }. Omitted = resubmit all PENDING_RESUBMISSION.
 *
 * Sources picked up when `template_names` is omitted (deduped):
 *   1. Registry rows where `sid === PENDING_RESUBMISSION` (compile-time
 *      sentinel — always-needs-submitting templates).
 *   2. `whatsapp_template_sids` rows where `approval_status = 'rejected'`
 *      AND the template still exists in the registry. Even if the
 *      registry has a real (non-PENDING) SID, if the DB says rejected
 *      we attempt a fresh submission with the current registry body.
 *      Twilio creates a new SID per submission so the upsert handles it.
 *
 * Response includes a `resubmittedRejected` count so callers can see how
 * many rejected templates got auto-retried this run.
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

  const sb = adminClient();

  const allPending: TemplateName[] = (Object.keys(TEMPLATES) as TemplateName[]).filter((n) => {
    const t = TEMPLATES[n];
    return t.sid === PENDING_RESUBMISSION;
  });

  // Auto-pick rejected templates from the DB (added 2026-05-03). When the
  // founder corrects a body and pushes a new build, hitting "Resubmit
  // pending" should also retry every previously-rejected template — even
  // if the registry still has a live SID for it. Meta gives us a fresh
  // SID per submission, so the upsert path below handles the rotation.
  let rejectedNames: TemplateName[] = [];
  try {
    const { data: rejectedRows } = await sb
      .from('whatsapp_template_sids')
      .select('template_name')
      .eq('approval_status', 'rejected');
    rejectedNames = ((rejectedRows ?? []) as Array<{ template_name: string }>)
      .map((r) => r.template_name)
      .filter((n): n is TemplateName => n in TEMPLATES);
  } catch (e) {
    // Non-fatal — log + continue with the registry-only pending set.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[resubmit-pending] failed to load rejected DB rows:', msg);
  }

  let requested: TemplateName[];
  let resubmittedRejected = 0;
  if (body.template_names && body.template_names.length > 0) {
    requested = body.template_names.filter((n): n is TemplateName => n in TEMPLATES) as TemplateName[];
  } else {
    // Union allPending + rejectedNames (deduped via Set).
    const set = new Set<TemplateName>([...allPending, ...rejectedNames]);
    requested = Array.from(set);
    // How many of the resolved set came in via the rejected-DB path?
    resubmittedRejected = rejectedNames.filter((n) => set.has(n)).length;
  }

  if (requested.length === 0) {
    return NextResponse.json({
      submitted: [],
      failed: [],
      resubmittedRejected: 0,
      note: 'No pending or rejected templates to resubmit.',
    });
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

    // Rate-limit: 2s pause between templates (bumped from 1s on
    // 2026-05-03 — Meta has been flaky on rapid resubmissions).
    if (i < requested.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return NextResponse.json({ submitted, failed, resubmittedRejected });
}
