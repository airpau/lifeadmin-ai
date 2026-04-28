/**
 * Append-only audit log helper for B2B customer events.
 * Fire-and-forget — audit logging must never block a user-facing path.
 */

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

export type AuditAction =
  | 'key_created'
  | 'key_revoked'
  | 'key_reissued'
  | 'key_viewed'
  | 'portal_signin'
  | 'login_link_requested'
  | 'reveal_link_used'
  | 'plan_changed';

export type AuditActor = 'customer' | 'founder' | 'system' | 'stripe';

export interface AuditEvent {
  email: string;
  action: AuditAction;
  actor?: AuditActor;
  key_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function audit(ev: AuditEvent): void {
  // Fire and forget. We never want a failed audit insert to surface as
  // a customer-visible 500 — the value is the trail, not strict
  // synchronous correctness.
  void (async () => {
    try {
      const supabase = getAdmin();
      await supabase.from('b2b_audit_log').insert({
        email: ev.email.toLowerCase(),
        action: ev.action,
        actor: ev.actor ?? 'customer',
        key_id: ev.key_id ?? null,
        ip_address: ev.ip_address ?? null,
        user_agent: ev.user_agent ?? null,
        metadata: ev.metadata ?? {},
      });
    } catch (e: any) {
      console.error('[audit] insert failed:', e?.message);
    }
  })();
}

export function extractClientMeta(request: NextRequest): { ip_address: string | null; user_agent: string | null } {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') || null);
  return {
    ip_address: ip,
    user_agent: request.headers.get('user-agent'),
  };
}
