#!/usr/bin/env tsx
/**
 * Submit the 3 new payment-alert templates to Twilio Content API and
 * then to Meta for WhatsApp approval. Writes back the new HX… SIDs
 * into `whatsapp_template_sids` (status='pending').
 *
 * Templates created here:
 *   - paybacker_payment_received
 *   - paybacker_payment_outgoing
 *   - paybacker_dd_warning
 *
 * Requires env vars at runtime:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   pnpm tsx scripts/submit-payment-templates.ts
 *
 * Idempotent-ish: each invocation creates a NEW Content SID (Twilio's
 * Content API rejects re-creating the same friendly_name), so the
 * preferred path is to use the admin "Resubmit pending" button at
 * /dashboard/admin/whatsapp once. This CLI is here for headless use.
 */

import { TEMPLATES } from '../src/lib/whatsapp/template-registry';

const TWILIO_BASE = 'https://content.twilio.com/v1';

const TARGETS = [
  'paybacker_payment_received',
  'paybacker_payment_outgoing',
  'paybacker_dd_warning',
] as const;

function basicAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
  }
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

function buildPayload(name: string) {
  const tpl = TEMPLATES[name as keyof typeof TEMPLATES];
  if (!tpl) throw new Error(`Unknown template ${name}`);
  const variables: Record<string, string> = {};
  tpl.vars.forEach((v, i) => {
    variables[String(i + 1)] = v;
  });
  return {
    friendly_name: name,
    language: 'en',
    variables,
    types: {
      'twilio/text': { body: tpl.body },
    },
  };
}

async function upsertSid(name: string, sid: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn(`  (skipping DB upsert for ${name} — Supabase env not set)`);
    return;
  }
  const tpl = TEMPLATES[name as keyof typeof TEMPLATES];
  const res = await fetch(`${url}/rest/v1/whatsapp_template_sids?on_conflict=template_name`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([
      {
        template_name: name,
        sid,
        approval_status: 'pending',
        category: tpl.category,
        language: 'en',
        submitted_at: new Date().toISOString(),
        approved_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
    ]),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn(`  ⚠️  DB upsert failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

async function main() {
  const authHeader = basicAuth();
  for (const name of TARGETS) {
    console.log(`→ submitting ${name}`);
    try {
      const createRes = await fetch(`${TWILIO_BASE}/Content`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload(name)),
      });
      if (!createRes.ok) {
        const t = await createRes.text();
        throw new Error(`create ${createRes.status}: ${t.slice(0, 300)}`);
      }
      const created = (await createRes.json()) as { sid?: string };
      const newSid = created.sid;
      if (!newSid) throw new Error('Twilio response missing sid');
      console.log(`  Content SID: ${newSid}`);

      const tpl = TEMPLATES[name];
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
      console.log(`  ✓ submitted to Meta for approval`);
      await upsertSid(name, newSid);
      // Polite spacing between submissions.
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ✗ ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log('\nDone. Once Meta approves (usually <24h), the cron');
  console.log('  /api/cron/whatsapp-template-status');
  console.log('flips approval_status to "approved" and the live SID is served.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
