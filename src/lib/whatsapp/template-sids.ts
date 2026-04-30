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
 * `TEMPLATES[name].sid` directly. The resolver returns:
 *   - the DB SID if the row exists AND `approval_status === 'approved'`,
 *   - the registry fallback SID if the registry has a real (non-PENDING) SID,
 *   - null when nothing is approved yet (caller should skip the send).
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
 */
export async function getTemplateSid(name: string): Promise<string | null> {
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
