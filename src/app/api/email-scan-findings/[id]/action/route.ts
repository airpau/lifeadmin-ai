/**
 * POST /api/email-scan-findings/[id]/action
 *
 * P5-4 — close the email-scan findings outcome loop.
 *
 * Body: { action: 'actioned' | 'dismissed'; action_type?: string }
 *
 * Behaviour:
 *   - Updates email_scan_findings.status to 'actioned' or 'dismissed'.
 *   - The DB trigger (migration 20260608140000) automatically attaches
 *     the outcome to the matching scan_finding_emitted intelligence
 *     event, so per-finding-kind action rate falls out of the daily
 *     rollup.
 *   - action_type (optional) — surfaces in the trigger's outcome jsonb
 *     so the dashboard can later distinguish "Add to Subscriptions"
 *     from "Write Letter" from "Claim Compensation".
 *
 * RLS does the auth check: only the row owner can write.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const VALID_ACTIONS = new Set(['actioned', 'dismissed']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string; action_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.action || !VALID_ACTIONS.has(body.action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${Array.from(VALID_ACTIONS).join(', ')}` },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {
    status: body.action,
    updated_at: new Date().toISOString(),
  };

  // Persist action_type into the finding's metadata so the DB trigger
  // and downstream consumers can see WHICH user action was taken.
  if (body.action === 'actioned' && body.action_type) {
    // We can't merge jsonb from the client without a round-trip; fetch
    // existing metadata and merge.
    const { data: existing } = await supabase
      .from('email_scan_findings')
      .select('metadata')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    const merged = {
      ...((existing?.metadata as Record<string, unknown>) ?? {}),
      action_type: body.action_type,
      actioned_at: new Date().toISOString(),
    };
    patch.metadata = merged;
  }

  const { error } = await supabase
    .from('email_scan_findings')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
