/**
 * Runtime SID resolver for WhatsApp templates.
 *
 * The registry at src/lib/whatsapp/template-registry.ts is the compile-time
 * source of truth for template bodies, vars, and fallback SIDs. This module
 * adds a runtime layer on top of it: when the founder resubmits a template
 * via /api/admin/whatsapp/resubmit-pending, the new SID is written to
 * `whatsapp_template_sids` (Supabase) along with the Meta approval status.
 *
 * Dispatch paths should call `getTemplateSid(name)` instead of reading
 * `TEMPLATES[name].sid` directly. The resolver mirrors the same SID
 * resolution order the Twilio provider uses, so a preflight skip-check
 * by the cron can never incorrectly suppress a send the provider would
 * have completed:
 *   1. `TWILIO_TEMPLATE_<NAME>` env override — lets ops pin a SID
 *      without a code deploy if Meta force-resubmits one.
 *   2. DB SID from `whatsapp_template_sids` when the row exists AND
 *      `approval_status === 'approved'`.
 *   3. The registry fallback SID, if the registry has a real
 *      (non-PENDING) SID.
 *   4. `null` when nothing usable is configured (caller should skip).
 */

import { createClient } from '@supabase/supabase-js';
import { TEMPLATES, PENDING_RESUBMISSION, type TemplateName } from './template-registry';

export interface TemplateSidRow {
  template_name: string;
  sid: string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'paused' | 'unknown';
  category: string;
  language: string;
  submitted_at: string;
  approved_at: string | null;
  last_status_check_at: string | null;
  last_error: string | null;
  notes: string | null;
  updated_at: string;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Resolve the live, send-safe SID for a template name. Returns null when
 * the template isn't approved (caller MUST skip the send rather than
 * pass a pending/rejected SID to Twilio).
 *
 * Order matches `TwilioWhatsAppProvider.sendTemplate` so a preflight
 * caller (e.g. the morning-brief cron) sees the same SID the provider
 * would actually use — no false skips when ops has pinned a SID via
 * env override or via the /dashboard/admin/whatsapp Resubmit panel.
 */
export async function getTemplateSid(name: string): Promise<string | null> {
  // 1. Env override wins — this is how ops pins a SID without a deploy
  //    when Meta force-resubmits a template. The Twilio provider checks
  //    this first too; the preflight must mirror it or the cron will
  //    skip every send while the override is the only working source.
  const envOverride = process.env[`TWILIO_TEMPLATE_${name.toUpperCase()}`];
  if (envOverride) return envOverride;

  const sb = adminClient();
  if (sb) {
    const { data } = await sb
      .from('whatsapp_template_sids')
      .select('sid, approval_status')
      .eq('template_name', name)
      .maybeSingle();
    if (data && data.approval_status === 'approved' && data.sid) {
      return data.sid;
    }
    // Row exists but not approved — never fall back to a registry SID for
    // a template the founder has explicitly resubmitted. Skip the send.
    if (data) return null;
  }
  // No DB row — fall back to the registry's compile-time SID, which only
  // works for templates that were approved before the dynamic-SID layer
  // was introduced (the 4 known-good ones).
  const tpl = (TEMPLATES as Record<string, { sid: string }>)[name as TemplateName];
  if (!tpl) return null;
  if (tpl.sid && tpl.sid !== PENDING_RESUBMISSION) return tpl.sid;
  return null;
}

/**
 * Bulk fetch — used by the admin UI to render a status panel.
 */
export async function listTemplateSidRows(): Promise<TemplateSidRow[]> {
  const sb = adminClient();
  if (!sb) return [];
  const { data } = await sb
    .from('whatsapp_template_sids')
    .select('*')
    .order('submitted_at', { ascending: false });
  return (data ?? []) as TemplateSidRow[];
}
