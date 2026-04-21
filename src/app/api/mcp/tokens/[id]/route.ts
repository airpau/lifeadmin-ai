// src/app/api/mcp/tokens/[id]/route.ts
// Revoke (soft-delete) a single MCP token. Keeps the row so we can
// still show "was used N times, last used X" in the audit trail — but
// the token_hash will no longer match because revoked_at is set.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Confirm the token belongs to this user before touching it.
  const { data: existing, error: fetchErr } = await admin()
    .from('mcp_tokens')
    .select('id, name, token_prefix, revoked_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  if (existing.revoked_at) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const { error } = await admin()
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[mcp/tokens] revoke failed:', error.message);
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 });
  }

  try {
    await admin().from('business_log').insert({
      category: 'progress',
      title: `MCP token revoked: ${existing.name}`,
      content: `User ${user.id} revoked MCP token ${existing.token_prefix}… (id ${existing.id}).`,
      created_by: 'mcp',
    });
  } catch {}

  return NextResponse.json({ ok: true });
}
